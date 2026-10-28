"use server"

import { headers } from "next/headers"

import { signIn } from "@/lib/auth/auth"
import { rememberDevice } from "@/lib/auth/device-server"
import { recordSecurityEventLater, requestContextFrom } from "@/lib/auth/security-log-server"
import { confirmSignup } from "@/lib/auth/verify"
import { verifyDeps } from "@/lib/auth/verify-server"
import { isDatabaseConfigured } from "@/lib/db/mongodb"
import { checkRateLimit } from "@/lib/rate-limit/server"

/**
 * After success, redirectTo is set (logged in) or loggedIn is false (account made, log in by hand).
 * invalidLink: the link can't be used any more, so the page offers to sign up or log in instead.
 */
export type ConfirmState = { error?: string; invalidLink?: boolean; redirectTo?: string; created?: boolean }

/** The form on /verify-email: the link's token plus the password chosen at sign-up. */
export async function confirmSignupAction(_previous: ConfirmState, formData: FormData): Promise<ConfirmState> {
  if (!isDatabaseConfigured()) return { error: "Accounts aren't available right now." }

  // Per visitor: each try is a bcrypt check, and slows guessing the sign-up password of a link.
  const requestHeaders = await headers()
  const decision = await checkRateLimit("verifyEmailSubmit", requestHeaders)
  if (!decision.allowed) return { error: "Too many attempts. Please wait a few minutes and try again." }

  const password = formData.get("password")
  let email: string
  try {
    const result = await confirmSignup(formData.get("token"), password, verifyDeps)
    console.log(JSON.stringify({ event: "signup_confirmed", ok: result.ok }))
    if (!result.ok) return { error: result.error, invalidLink: result.invalidLink }
    email = result.email
    recordSecurityEventLater(email, { type: "account_created", method: "password", ...requestContextFrom(requestHeaders) })
  } catch (error) {
    console.error("Sign-up confirmation failed:", error instanceof Error ? error.message : error)
    return { error: "Something went wrong. Please try again." }
  }

  // The account exists now; logging in is a convenience; if it fails, the page links to log in.
  try {
    await signIn("credentials", { email, password, redirect: false })
    await rememberDevice(email)
    return { created: true, redirectTo: "/" }
  } catch {
    return { created: true }
  }
}
