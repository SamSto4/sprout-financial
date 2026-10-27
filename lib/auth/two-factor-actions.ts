"use server"

import { googleEnabled, signIn } from "@/lib/auth/auth"
import { currentRequestContext, recordSecurityEvent, sendSecurityNoticeLater } from "@/lib/auth/security-log-server"
import { currentUserEmail, freshGoogleOnlySignIn } from "@/lib/auth/session"
import { checkCode, type CodeCheckOutcome } from "@/lib/auth/two-factor-code"
import {
  confirmTwoFactorSetup,
  disableTwoFactor,
  isTwoFactorAvailable,
  removeTwoFactor,
  replaceRecoveryCodes,
  signedInCodeDeps,
  startTwoFactorSetup,
} from "@/lib/auth/two-factor-server"
import { beginSetup, SETUP_UNAVAILABLE, type TwoFactorActionResult } from "@/lib/auth/two-factor-setup"
import { accountExists, findUserByEmail, verifyPassword } from "@/lib/auth/users"
import { accountKey } from "@/lib/rate-limit/limits"
import { checkRateLimitFor, limitMessage } from "@/lib/rate-limit/server"

// Server actions for the Account page's two-step verification card. Each checks the session and
// that the account still exists. Turning it on is limited per account (twoFactor); codes typed to
// turn it off or make new recovery codes go through checkCode (lib/auth/two-factor-code.ts): their
// own limit (twoFactorCode), a log entry for each wrong one, and an email to the owner at the limit.
// Each change is written to the security log before replying (recordSecurityEvent never throws),
// so the page refresh that follows already lists it; the owner's email goes out after the reply.

const UNAVAILABLE = SETUP_UNAVAILABLE

async function signedInEmail(): Promise<string | null> {
  if (!isTwoFactorAvailable()) return null
  const email = await currentUserEmail()
  return email && (await accountExists(email)) ? email : null
}

async function setupLimited(email: string): Promise<string | null> {
  const decision = await checkRateLimitFor("twoFactor", accountKey(email))
  return decision.allowed ? null : limitMessage(decision)
}

function codeFailure(outcome: Exclude<CodeCheckOutcome, { status: "ok" }>): TwoFactorActionResult {
  switch (outcome.status) {
    case "missing":
      return { ok: false, error: "Enter a code from your authenticator app, or a recovery code." }
    case "limited":
      return { ok: false, error: limitMessage({ allowed: false, scope: "client", retryAfterSeconds: outcome.retryAfterSeconds }) }
    case "unavailable":
      return { ok: false, error: UNAVAILABLE }
    case "not-enabled":
      return { ok: false, error: "Two-step verification is already off." }
    case "invalid":
      return { ok: false, error: "That code didn't work. Use the newest code from your app, or a recovery code." }
  }
}

/**
 * Starts setup. Password accounts must give their current password, and Google-only accounts must
 * have logged in with Google in the last few minutes (lib/auth/two-factor-setup.ts). The password
 * is sent as form data rather than a plain argument so `next dev` doesn't print it with the call.
 */
export async function beginTwoFactorSetup(form: FormData): Promise<TwoFactorActionResult> {
  const email = await signedInEmail()
  if (!email) return { ok: false, error: UNAVAILABLE }
  const password = form instanceof FormData ? form.get("password") : null
  const result = await beginSetup(email, password, {
    limited: setupLimited,
    hasPassword: async (address) => {
      const user = await findUserByEmail(address)
      return user ? Boolean(user.passwordHash) : null
    },
    freshGoogleSignIn: freshGoogleOnlySignIn,
    checkPassword: async (address, typed) => Boolean(await verifyPassword(address, typed)),
    start: startTwoFactorSetup,
    wrongPassword: async (address) =>
      recordSecurityEvent(address, { type: "password_wrong", at: new Date(), ...(await currentRequestContext()) }),
  })
  // Logging in with Google again is the only way on for a Google-only account; without Google
  // sign-in on this server there's none.
  if (!result.ok && result.reauth && !googleEnabled) return { ok: false, error: UNAVAILABLE }
  return result
}

export async function finishTwoFactorSetup(code: string): Promise<TwoFactorActionResult> {
  const email = await signedInEmail()
  if (!email) return { ok: false, error: UNAVAILABLE }
  const tooMany = await setupLimited(email)
  if (tooMany) return { ok: false, error: tooMany }
  const recoveryCodes = await confirmTwoFactorSetup(email, String(code).slice(0, 64))
  if (!recoveryCodes) {
    return { ok: false, error: "That code didn't match. Check the time on your phone is set automatically, and enter the newest code. If it's been more than 15 minutes, start again." }
  }
  const context = await currentRequestContext()
  await recordSecurityEvent(email, { type: "two_step_on", at: new Date(), ...context })
  // From now on deleting the account or turning this off needs this authenticator, so the owner
  // hears about it at once in case it wasn't them.
  sendSecurityNoticeLater(email, "two_step_on", context)
  return { ok: true, recoveryCodes }
}

/**
 * Turns two-step verification off with a code from the app or a recovery code. A Google-only
 * account that logged in with Google in the last few minutes needs no code
 * (lib/auth/two-factor-code.ts), so its owner can always get out.
 */
export async function turnOffTwoFactor(code: string): Promise<TwoFactorActionResult> {
  const email = await signedInEmail()
  if (!email) return { ok: false, error: UNAVAILABLE }
  const context = await currentRequestContext()
  if (await freshGoogleOnlySignIn(email)) {
    if (!(await removeTwoFactor(email))) return { ok: false, error: "Two-step verification is already off." }
    await recordSecurityEvent(email, { type: "two_step_off", at: new Date(), ...context })
    sendSecurityNoticeLater(email, "two_step_off", context)
    return { ok: true }
  }
  const outcome = await checkCode(code, signedInCodeDeps(email, "off", context, (typed) => disableTwoFactor(email, typed)))
  if (outcome.status !== "ok") return codeFailure(outcome)
  await recordSecurityEvent(email, { type: "two_step_off", at: new Date(), secondFactor: outcome.usedRecoveryCode ? "recovery" : "app", ...context })
  sendSecurityNoticeLater(email, "two_step_off", context)
  return { ok: true }
}

export async function makeNewRecoveryCodes(code: string): Promise<TwoFactorActionResult> {
  const email = await signedInEmail()
  if (!email) return { ok: false, error: UNAVAILABLE }
  const context = await currentRequestContext()
  let codes: string[] | undefined
  const outcome = await checkCode(
    code,
    signedInCodeDeps(email, "new-codes", context, async (typed) => {
      const replaced = await replaceRecoveryCodes(email, typed)
      codes = replaced.codes
      return replaced.check
    })
  )
  if (outcome.status !== "ok") return codeFailure(outcome)
  if (!codes) return { ok: false, error: "Two-step verification is already off." }
  await recordSecurityEvent(email, {
    type: "recovery_codes_replaced",
    at: new Date(),
    secondFactor: outcome.usedRecoveryCode ? "recovery" : "app",
    ...context,
  })
  return { ok: true, recoveryCodes: codes }
}

/** Where each "log in with Google again" comes back to, so the Account page can carry on. */
const REAUTH_RETURN = {
  on: "/account?reauth=on",
  off: "/account?reauth=off",
  delete: "/account?reauth=delete",
} as const

/**
 * Sends a Google-only account to Google to log in again (always with the account chooser, so a
 * copied Sprout cookie alone isn't enough), then back to the Account page to carry on: that fresh
 * sign-in is what turning two-step verification on, or turning it off or deleting the account
 * without a code, accepts (lib/auth/two-factor-code.ts).
 */
export async function logInWithGoogleAgain(form: FormData): Promise<void> {
  if (!googleEnabled) return
  const purpose = form instanceof FormData ? form.get("purpose") : null
  const redirectTo = typeof purpose === "string" && Object.hasOwn(REAUTH_RETURN, purpose) ? REAUTH_RETURN[purpose as keyof typeof REAUTH_RETURN] : "/account"
  const email = await currentUserEmail()
  await signIn("google", { redirectTo }, { prompt: "select_account", ...(email ? { login_hint: email } : {}) })
}
