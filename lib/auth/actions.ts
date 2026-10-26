"use server"

import { AuthError, CredentialsSignin } from "next-auth"
import { headers } from "next/headers"
import { after } from "next/server"

import { signIn } from "@/lib/auth/auth"
import { siteUrl } from "@/lib/auth/reset"
import { createUser, findUserByEmail, normalizeEmail } from "@/lib/auth/users"
import { safeRedirect, validateCredentials } from "@/lib/auth/validate"
import { sendVerification, startSignupQuietly, verificationRequired } from "@/lib/auth/verify"
import { verifyDeps } from "@/lib/auth/verify-server"
import { isDatabaseConfigured } from "@/lib/db/mongodb"
import { checkRateLimit, limitMessage } from "@/lib/rate-limit/server"

/**
 * On success, redirectTo is set; the form refreshes the session and then navigates there.
 * After a sign-up that needs confirming, checkEmail is the address the link went to.
 */
export type AuthState = { error?: string; redirectTo?: string; checkEmail?: string }

// Only used when email verification is off (see verificationRequired): one message whichever way
// the email is already in use, though a new address still gets an account and an existing one doesn't.
const EMAIL_TAKEN = "We couldn't create an account with that email. If it's yours, log in instead."

/** Logged in with the right password to an unconfirmed account: send a fresh link and say so. */
async function unverifiedLogin(email: string): Promise<AuthState> {
  let outcome: "sent" | "limited" | "failed"
  try {
    outcome = await sendVerification(normalizeEmail(email), siteUrl(process.env), verifyDeps)
  } catch (error) {
    console.error("Couldn't send a confirmation email:", error instanceof Error ? error.message : error)
    outcome = "failed"
  }
  console.log(JSON.stringify({ event: "verification_resend", outcome }))
  if (outcome === "sent") {
    return { error: `Confirm your email first. We've sent a new link to ${email}. It works for 24 hours.` }
  }
  if (outcome === "limited") {
    return { error: "Confirm your email first. We've already sent you several links; check your inbox and spam folder, or try again in an hour." }
  }
  return { error: "Confirm your email first. We couldn't send a new link just now; please try again in a few minutes." }
}

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
      const signups = await checkRateLimit("signup", await headers())
      if (!signups.allowed) return { error: limitMessage(signups) }

      if (verificationRequired(process.env)) {
        // Everything else happens after the reply is sent, and the reply is the same whether the
        // address is new or taken: the email itself says which. So this form no longer reveals who
        // has an account, by its answer or by how long it takes.
        const base = siteUrl(process.env)
        const address = normalizeEmail(email)
        after(async () => {
          const outcome = await startSignupQuietly(address, password, base, verifyDeps)
          console.log(JSON.stringify({ event: "signup", outcome }))
        })
        return { checkEmail: email }
      }
      console.warn("Email verification is off: set RESEND_API_KEY and EMAIL_FROM to require it.")
      if (await findUserByEmail(email)) return { error: EMAIL_TAKEN }
      if (!(await createUser(email, password))) return { error: EMAIL_TAKEN }
    }
    await signIn("credentials", { email, password, redirect: false })
  } catch (error) {
    if (error instanceof CredentialsSignin && error.code === "rate_limited") {
      return { error: "Too many login attempts. Please wait a few minutes and try again." }
    }
    if (error instanceof CredentialsSignin && error.code === "unverified") return unverifiedLogin(email)
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
