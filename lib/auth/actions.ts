"use server"

import { AuthError, CredentialsSignin } from "next-auth"
import { headers } from "next/headers"
import { after } from "next/server"

import { signIn } from "@/lib/auth/auth"
import { rememberDevice } from "@/lib/auth/device-server"
import { siteUrl } from "@/lib/auth/reset"
import { recordSecurityEventLater, requestContextFrom } from "@/lib/auth/security-log-server"
import { createUser, findUserByEmail, normalizeEmail } from "@/lib/auth/users"
import { safeRedirect, validateCredentials } from "@/lib/auth/validate"
import { startSignupQuietly, verificationRequired } from "@/lib/auth/verify"
import { signupEmailAllowance, verifyDeps } from "@/lib/auth/verify-server"
import { isDatabaseConfigured } from "@/lib/db/mongodb"
import { visitorKey } from "@/lib/rate-limit/limits"
import { checkRateLimit, limitMessage } from "@/lib/rate-limit/server"

/**
 * On success, redirectTo is set; the form refreshes the session and then navigates there.
 * After a sign-up that needs confirming, checkEmail is the address the link went to.
 */
export type AuthState = {
  error?: string
  redirectTo?: string
  checkEmail?: string
  /** The password was right and the account has two-step verification: ask for a code. */
  needsCode?: boolean
}

// Only used when email verification is off (see verificationRequired): one message whichever way
// the email is already in use, though a new address still gets an account and an existing one doesn't.
const EMAIL_TAKEN = "We couldn't create an account with that email. If it's yours, log in instead."

/** Logs in, or creates an account and logs in, depending on the form's intent. */
export async function emailAuth(_previous: AuthState, formData: FormData): Promise<AuthState> {
  if (!isDatabaseConfigured()) return { error: "Accounts aren't set up yet. Please try again later." }

  const creating = formData.get("intent") === "signup"
  const credentials = validateCredentials(formData.get("email"), formData.get("password"), creating ? "signup" : "login")
  if (!credentials.ok) return { error: credentials.error }
  const { email, password } = credentials
  const next = safeRedirect(formData.get("redirectTo"))

  try {
    if (creating) {
      // Login attempts are counted in the credentials provider (lib/auth/auth.ts); sign-ups here.
      const requestHeaders = await headers()
      const signups = await checkRateLimit("signup", requestHeaders)
      if (!signups.allowed) return { error: limitMessage(signups) }

      if (verificationRequired(process.env)) {
        // Everything else happens after the reply is sent, and the reply is the same whether the
        // address is new or taken: the email itself says which. No account exists until the link is
        // confirmed, so a login attempt can't tell them apart either (lib/auth/verify.ts).
        const base = siteUrl(process.env)
        const address = normalizeEmail(email)
        const deps = { ...verifyDeps, allowEmail: signupEmailAllowance(visitorKey(requestHeaders)) }
        after(async () => {
          const outcome = await startSignupQuietly(address, password, base, deps)
          console.log(JSON.stringify({ event: "signup", outcome }))
        })
        return { checkEmail: email }
      }
      console.warn("Email verification is off: set RESEND_API_KEY and EMAIL_FROM to require it.")
      if (await findUserByEmail(email)) return { error: EMAIL_TAKEN }
      if (!(await createUser(email, password))) return { error: EMAIL_TAKEN }
      recordSecurityEventLater(email, { type: "account_created", method: "password", ...requestContextFrom(requestHeaders) })
    }
    const code = formData.get("code")
    await signIn("credentials", { email, password, ...(typeof code === "string" && code.trim() ? { code: code.slice(0, 64) } : {}), redirect: false })
    // Logged in: from now on this browser's logins are counted on their own (lib/auth/device-cookie.ts).
    await rememberDevice(email)
  } catch (error) {
    if (error instanceof CredentialsSignin && error.code === "rate_limited") {
      return { error: "Too many login attempts. Please wait a few minutes and try again." }
    }
    if (error instanceof CredentialsSignin && error.code === "two_factor_required") return { needsCode: true }
    if (error instanceof CredentialsSignin && error.code === "two_factor_invalid") {
      return { needsCode: true, error: "That code didn't work. Enter the newest code from your app, or a recovery code." }
    }
    // Only reachable with the right password, so it reveals nothing about whether the address has an account.
    if (error instanceof CredentialsSignin && error.code === "two_factor_rate_limited") {
      return {
        needsCode: true,
        error: "Too many codes have been tried, so logging in with your password is paused for now. Please try again later, or choose a new password to start over.",
      }
    }
    if (error instanceof CredentialsSignin && error.code === "two_factor_unavailable") {
      return { error: "Two-step verification can't be checked right now, so logging in with a password is paused. Please try again later." }
    }
    if (error instanceof AuthError) return { error: "Wrong email or password." }
    console.error("Email sign-in failed:", error instanceof Error ? error.message : error)
    return { error: "Something went wrong. Please try again." }
  }

  // The browser navigates itself after refreshing its session, so the header and sync
  // see the new sign-in straight away (a server redirect would leave them showing "Log in").
  return { redirectTo: next }
}

export async function googleAuth(formData: FormData) {
  await signIn("google", { redirectTo: safeRedirect(formData.get("redirectTo")) })
}
