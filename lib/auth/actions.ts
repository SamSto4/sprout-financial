"use server"

import { AuthError, CredentialsSignin } from "next-auth"
import { headers } from "next/headers"

import { signIn } from "@/lib/auth/auth"
import { createUser, findUserByEmail } from "@/lib/auth/users"
import { safeRedirect, validateCredentials } from "@/lib/auth/validate"
import { isDatabaseConfigured } from "@/lib/db/mongodb"
import { checkRateLimit, limitMessage } from "@/lib/rate-limit/server"

/** On success, redirectTo is set; the form refreshes the session and then navigates there. */
export type AuthState = { error?: string; redirectTo?: string }

// One message whichever way the email is already in use (password or Google), so sign-up says as
// little as possible about which addresses have accounts. Sign-up can't hide it completely without
// email verification: a new address gets an account and an existing one doesn't.
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
      const signups = await checkRateLimit("signup", await headers())
      if (!signups.allowed) return { error: limitMessage(signups) }

      if (await findUserByEmail(email)) return { error: EMAIL_TAKEN }
      if (!(await createUser(email, password))) return { error: EMAIL_TAKEN }
    }
    await signIn("credentials", { email, password, redirect: false })
  } catch (error) {
    if (error instanceof CredentialsSignin && error.code === "rate_limited") {
      return { error: "Too many login attempts. Please wait a few minutes and try again." }
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
