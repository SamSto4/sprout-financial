"use server"

import { AuthError } from "next-auth"
import { headers } from "next/headers"

import { signIn } from "@/lib/auth/auth"
import { createUser, findUserByEmail } from "@/lib/auth/users"
import { safeRedirect, validateCredentials } from "@/lib/auth/validate"
import { isDatabaseConfigured } from "@/lib/db/mongodb"
import { checkRateLimit, limitMessage } from "@/lib/rate-limit/server"

/** On success, redirectTo is set; the form refreshes the session and then navigates there. */
export type AuthState = { error?: string; redirectTo?: string }

/** Logs in, or creates an account and logs in, depending on the form's intent. */
export async function emailAuth(_previous: AuthState, formData: FormData): Promise<AuthState> {
  if (!isDatabaseConfigured()) return { error: "Accounts aren't set up yet. Please try again later." }

  const credentials = validateCredentials(formData.get("email"), formData.get("password"))
  if (!credentials.ok) return { error: credentials.error }
  const { email, password } = credentials

  // Slows password guessing: a handful of attempts per visitor, then a short wait.
  const attempts = await checkRateLimit("login", await headers())
  if (!attempts.allowed) return { error: limitMessage(attempts) }

  const creating = formData.get("intent") === "signup"
  const next = safeRedirect(formData.get("redirectTo"))

  try {
    if (creating) {
      const existing = await findUserByEmail(email)
      if (existing) {
        return {
          error: existing.passwordHash
            ? "An account with this email already exists. Log in instead."
            : "This email signs in with Google. Use Continue with Google.",
        }
      }
      if (!(await createUser(email, password))) {
        return { error: "An account with this email already exists. Log in instead." }
      }
    }
    await signIn("credentials", { email, password, redirect: false })
  } catch (error) {
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
