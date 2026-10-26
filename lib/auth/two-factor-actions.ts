"use server"

import { currentUserEmail } from "@/lib/auth/session"
import {
  confirmTwoFactorSetup,
  disableTwoFactor,
  isTwoFactorAvailable,
  replaceRecoveryCodes,
  startTwoFactorSetup,
  type SecondFactorResult,
} from "@/lib/auth/two-factor-server"
import { accountExists } from "@/lib/auth/users"
import { accountKey } from "@/lib/rate-limit/limits"
import { checkRateLimitFor, limitMessage } from "@/lib/rate-limit/server"

// Server actions for the Account page's two-step verification card. Each checks the session and
// that the account still exists; those that check a code are also limited per account.

export type TwoFactorActionResult =
  | { ok: true; qrSvg?: string; secret?: string; recoveryCodes?: string[] }
  | { ok: false; error: string }

const UNAVAILABLE = "Two-step verification isn't available right now. Please try again later."

async function signedInEmail(): Promise<string | null> {
  if (!isTwoFactorAvailable()) return null
  const email = await currentUserEmail()
  return email && (await accountExists(email)) ? email : null
}

async function limited(email: string): Promise<string | null> {
  const decision = await checkRateLimitFor("twoFactor", accountKey(email))
  return decision.allowed ? null : limitMessage(decision)
}

function failure(check: SecondFactorResult): TwoFactorActionResult {
  if (check.status === "unavailable") return { ok: false, error: UNAVAILABLE }
  if (check.status === "not-enabled") return { ok: false, error: "Two-step verification is already off." }
  return { ok: false, error: "That code didn't work. Use the newest code from your app, or a recovery code." }
}

export async function beginTwoFactorSetup(): Promise<TwoFactorActionResult> {
  const email = await signedInEmail()
  if (!email) return { ok: false, error: UNAVAILABLE }
  const setup = await startTwoFactorSetup(email)
  return setup ? { ok: true, qrSvg: setup.qrSvg, secret: setup.secret } : { ok: false, error: "Two-step verification is already on." }
}

export async function finishTwoFactorSetup(code: string): Promise<TwoFactorActionResult> {
  const email = await signedInEmail()
  if (!email) return { ok: false, error: UNAVAILABLE }
  const tooMany = await limited(email)
  if (tooMany) return { ok: false, error: tooMany }
  const recoveryCodes = await confirmTwoFactorSetup(email, String(code).slice(0, 64))
  return recoveryCodes
    ? { ok: true, recoveryCodes }
    : { ok: false, error: "That code didn't match. Check the time on your phone is set automatically, and enter the newest code. If it's been more than 15 minutes, start again." }
}

export async function turnOffTwoFactor(code: string): Promise<TwoFactorActionResult> {
  const email = await signedInEmail()
  if (!email) return { ok: false, error: UNAVAILABLE }
  const tooMany = await limited(email)
  if (tooMany) return { ok: false, error: tooMany }
  const check = await disableTwoFactor(email, String(code).slice(0, 64))
  return check.status === "ok" ? { ok: true } : failure(check)
}

export async function makeNewRecoveryCodes(code: string): Promise<TwoFactorActionResult> {
  const email = await signedInEmail()
  if (!email) return { ok: false, error: UNAVAILABLE }
  const tooMany = await limited(email)
  if (tooMany) return { ok: false, error: tooMany }
  const { check, codes } = await replaceRecoveryCodes(email, String(code).slice(0, 64))
  return codes ? { ok: true, recoveryCodes: codes } : failure(check)
}
