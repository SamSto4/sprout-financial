import "server-only"

import { renderSVG } from "uqr"

import {
  base32Decode,
  formatSecret,
  hashRecoveryCode,
  newRecoveryCodes,
  newTotpSecret,
  otpauthUri,
  readSecondFactor,
  verifyTotp,
} from "@/lib/auth/totp"
import { normalizeEmail, type UserDoc } from "@/lib/auth/users"
import { getDb, isDatabaseConfigured } from "@/lib/db/mongodb"
import { decryptSecret, encryptSecret, needsReseal, parseKeyring, type Keyring } from "@/lib/security/encryption"
import { SITE_NAME } from "@/lib/site"

// Two-step verification with an authenticator app. The secret is stored encrypted, recovery codes
// only as hashes, and the last accepted code step so no code works twice. Checked at password
// login (lib/auth/auth.ts) and, through checkSecondFactor, before any action that needs proof the
// account holder is present, such as linking a bank account.

const SETUP_MINUTES = 15

let keyring: Keyring | null | undefined
function keys() {
  keyring ??= parseKeyring({ DATA_ENCRYPTION_KEY: process.env.DATA_ENCRYPTION_KEY, DATA_ENCRYPTION_KEY_PREVIOUS: process.env.DATA_ENCRYPTION_KEY_PREVIOUS })
  return keyring
}

/** Two-step verification needs accounts (MongoDB) and an encryption key for the secrets. */
export function isTwoFactorAvailable() {
  return isDatabaseConfigured() && keys() !== null
}

async function users() {
  return (await getDb()).collection<UserDoc>("users")
}

// Each encrypted value is bound to its account and purpose (see encryptSecret's context).
const secretContext = (email: string) => `totp:${email}`
const setupContext = (email: string) => `totp-setup:${email}`

export type TwoFactorStatus = { enabled: false } | { enabled: true; enabledAt: Date; recoveryCodesLeft: number }

export async function twoFactorStatus(email: string): Promise<TwoFactorStatus> {
  const user = await (await users()).findOne({ email: normalizeEmail(email) }, { projection: { twoFactor: 1 } })
  return user?.twoFactor
    ? { enabled: true, enabledAt: user.twoFactor.enabledAt, recoveryCodesLeft: user.twoFactor.recoveryCodes.length }
    : { enabled: false }
}

/**
 * Starts setup: a new secret, kept (encrypted) for 15 minutes until a code from the app confirms
 * it. Returns what the person needs to add it to their app: a QR code and the key to type in.
 */
export async function startTwoFactorSetup(email: string): Promise<{ qrSvg: string; secret: string } | null> {
  const ring = keys()
  if (!ring) return null
  const key = normalizeEmail(email)
  const secret = newTotpSecret()
  const result = await (await users()).updateOne(
    { email: key, twoFactor: { $exists: false } },
    { $set: { twoFactorSetup: { secret: encryptSecret(secret, ring, setupContext(key)), expiresAt: new Date(Date.now() + SETUP_MINUTES * 60_000) } } }
  )
  if (result.matchedCount === 0) return null
  return { qrSvg: renderSVG(otpauthUri(SITE_NAME, key, secret)), secret: formatSecret(secret) }
}

/**
 * Finishes setup when the code matches the pending secret. Returns the recovery codes, shown to
 * the person once and stored only as hashes; null when the code or the setup isn't valid.
 */
export async function confirmTwoFactorSetup(email: string, input: string, now: number = Date.now()): Promise<string[] | null> {
  const ring = keys()
  const typed = readSecondFactor(input)
  if (!ring || typed?.kind !== "totp") return null
  const key = normalizeEmail(email)
  const collection = await users()
  const user = await collection.findOne({ email: key }, { projection: { twoFactor: 1, twoFactorSetup: 1 } })
  const setup = user?.twoFactorSetup
  if (!setup || user.twoFactor || setup.expiresAt.getTime() < now) return null
  const plain = decryptSecret(setup.secret, ring, setupContext(key))
  const secret = plain ? base32Decode(plain) : null
  const step = secret ? verifyTotp(secret, typed.code, now, null) : null
  if (!plain || step === null) return null

  const codes = newRecoveryCodes()
  const result = await collection.updateOne(
    { email: key, twoFactor: { $exists: false } },
    {
      $set: {
        twoFactor: { secret: encryptSecret(plain, ring, secretContext(key)), enabledAt: new Date(now), lastStep: step, recoveryCodes: codes.map(hashRecoveryCode) },
        updatedAt: new Date(now),
      },
      $unset: { twoFactorSetup: "" },
    }
  )
  return result.modifiedCount === 1 ? codes : null
}

/**
 * - "ok": the code was right; it can't be used again.
 * - "invalid": wrong, already used, or not a code.
 * - "not-enabled": the account has no two-step verification.
 * - "unavailable": it's on, but this server can't check it (no or wrong encryption key). Callers
 *   must refuse, never let the person through.
 */
export type SecondFactorResult = { status: "ok"; usedRecoveryCode: boolean } | { status: "invalid" | "not-enabled" | "unavailable" }

/** Checks an authenticator or recovery code for this account, and uses it up if it's right. */
export async function checkSecondFactor(email: string, input: string, now: number = Date.now()): Promise<SecondFactorResult> {
  const key = normalizeEmail(email)
  const collection = await users()
  const user = await collection.findOne({ email: key }, { projection: { twoFactor: 1 } })
  const factor = user?.twoFactor
  if (!factor) return { status: "not-enabled" }
  const typed = readSecondFactor(input)
  if (!typed) return { status: "invalid" }

  if (typed.kind === "recovery") {
    const hash = hashRecoveryCode(typed.code)
    // Removing the code in the same step as matching it means two requests can't both use it.
    const result = await collection.updateOne({ email: key, "twoFactor.recoveryCodes": hash }, { $pull: { "twoFactor.recoveryCodes": hash } })
    return result.modifiedCount === 1 ? { status: "ok", usedRecoveryCode: true } : { status: "invalid" }
  }

  const ring = keys()
  const plain = ring ? decryptSecret(factor.secret, ring, secretContext(key)) : null
  const secret = plain ? base32Decode(plain) : null
  if (!ring || !plain || !secret) {
    console.error("Two-step verification secret couldn't be decrypted: check DATA_ENCRYPTION_KEY.")
    return { status: "unavailable" }
  }
  const step = verifyTotp(secret, typed.code, now, factor.lastStep)
  if (step === null) return { status: "invalid" }
  // Only if no later step was recorded meanwhile, so the same code sent twice at once is accepted once.
  const result = await collection.updateOne(
    { email: key, "twoFactor.lastStep": { $lt: step } },
    { $set: { "twoFactor.lastStep": step, ...(needsReseal(factor.secret, ring) ? { "twoFactor.secret": encryptSecret(plain, ring, secretContext(key)) } : {}) } }
  )
  return result.modifiedCount === 1 ? { status: "ok", usedRecoveryCode: false } : { status: "invalid" }
}

/** Turns two-step verification off, after a valid code. */
export async function disableTwoFactor(email: string, input: string): Promise<SecondFactorResult> {
  const check = await checkSecondFactor(email, input)
  if (check.status === "ok") {
    await (await users()).updateOne({ email: normalizeEmail(email) }, { $unset: { twoFactor: "", twoFactorSetup: "" }, $set: { updatedAt: new Date() } })
  }
  return check
}

/** Replaces the recovery codes, after a valid code. Returns the new ones, shown once. */
export async function replaceRecoveryCodes(email: string, input: string): Promise<{ check: SecondFactorResult; codes?: string[] }> {
  const check = await checkSecondFactor(email, input)
  if (check.status !== "ok") return { check }
  const codes = newRecoveryCodes()
  await (await users()).updateOne({ email: normalizeEmail(email), twoFactor: { $exists: true } }, { $set: { "twoFactor.recoveryCodes": codes.map(hashRecoveryCode) } })
  return { check, codes }
}
