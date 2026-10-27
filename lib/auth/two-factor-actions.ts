"use server"

import { currentRequestContext, recordSecurityEvent, sendSecurityNoticeLater } from "@/lib/auth/security-log-server"
import { currentUserEmail } from "@/lib/auth/session"
import {
  confirmTwoFactorSetup,
  disableTwoFactor,
  isTwoFactorAvailable,
  replaceRecoveryCodes,
  startTwoFactorSetup,
  type SecondFactorResult,
} from "@/lib/auth/two-factor-server"
import { beginSetup, SETUP_UNAVAILABLE, type TwoFactorActionResult } from "@/lib/auth/two-factor-setup"
import { accountExists, findUserByEmail, verifyPassword } from "@/lib/auth/users"
import { accountKey } from "@/lib/rate-limit/limits"
import { checkRateLimitFor, limitMessage } from "@/lib/rate-limit/server"

// Server actions for the Account page's two-step verification card. Each checks the session and
// that the account still exists; those that check a password or a code are also limited per account.
// Each change is written to the security log before replying (recordSecurityEvent never throws),
// so the page refresh that follows already lists it; the owner's email goes out after the reply.

const UNAVAILABLE = SETUP_UNAVAILABLE

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

/**
 * Starts setup. Password accounts must give their current password (lib/auth/two-factor-setup.ts),
 * sent as form data rather than a plain argument so `next dev` doesn't print it with the call.
 */
export async function beginTwoFactorSetup(form: FormData): Promise<TwoFactorActionResult> {
  const email = await signedInEmail()
  if (!email) return { ok: false, error: UNAVAILABLE }
  const password = form instanceof FormData ? form.get("password") : null
  return beginSetup(email, password, {
    limited,
    hasPassword: async (address) => {
      const user = await findUserByEmail(address)
      return user ? Boolean(user.passwordHash) : null
    },
    checkPassword: async (address, typed) => Boolean(await verifyPassword(address, typed)),
    start: startTwoFactorSetup,
    wrongPassword: async (address) =>
      recordSecurityEvent(address, { type: "password_wrong", at: new Date(), ...(await currentRequestContext()) }),
  })
}

export async function finishTwoFactorSetup(code: string): Promise<TwoFactorActionResult> {
  const email = await signedInEmail()
  if (!email) return { ok: false, error: UNAVAILABLE }
  const tooMany = await limited(email)
  if (tooMany) return { ok: false, error: tooMany }
  const recoveryCodes = await confirmTwoFactorSetup(email, String(code).slice(0, 64))
  if (!recoveryCodes) {
    return { ok: false, error: "That code didn't match. Check the time on your phone is set automatically, and enter the newest code. If it's been more than 15 minutes, start again." }
  }
  await recordSecurityEvent(email, { type: "two_step_on", at: new Date(), ...(await currentRequestContext()) })
  return { ok: true, recoveryCodes }
}

export async function turnOffTwoFactor(code: string): Promise<TwoFactorActionResult> {
  const email = await signedInEmail()
  if (!email) return { ok: false, error: UNAVAILABLE }
  const tooMany = await limited(email)
  if (tooMany) return { ok: false, error: tooMany }
  const check = await disableTwoFactor(email, String(code).slice(0, 64))
  if (check.status !== "ok") return failure(check)
  const context = await currentRequestContext()
  await recordSecurityEvent(email, { type: "two_step_off", at: new Date(), secondFactor: check.usedRecoveryCode ? "recovery" : "app", ...context })
  sendSecurityNoticeLater(email, "two_step_off", context)
  return { ok: true }
}

export async function makeNewRecoveryCodes(code: string): Promise<TwoFactorActionResult> {
  const email = await signedInEmail()
  if (!email) return { ok: false, error: UNAVAILABLE }
  const tooMany = await limited(email)
  if (tooMany) return { ok: false, error: tooMany }
  const { check, codes } = await replaceRecoveryCodes(email, String(code).slice(0, 64))
  if (!codes || check.status !== "ok") return failure(check)
  await recordSecurityEvent(email, {
    type: "recovery_codes_replaced",
    at: new Date(),
    secondFactor: check.usedRecoveryCode ? "recovery" : "app",
    ...(await currentRequestContext()),
  })
  return { ok: true, recoveryCodes: codes }
}
