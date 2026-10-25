"use server"

import { headers } from "next/headers"
import { after } from "next/server"

import { finishPasswordReset, siteUrl, startPasswordResetQuietly } from "@/lib/auth/reset"
import { resetDeps } from "@/lib/auth/reset-server"
import { normalizeEmail } from "@/lib/auth/users"
import { isDatabaseConfigured } from "@/lib/db/mongodb"
import { isEmailConfigured } from "@/lib/email/send"
import { checkRateLimit } from "@/lib/rate-limit/server"

export type ForgotState = { error?: string; sent?: boolean; email?: string }
export type ResetState = { error?: string; done?: boolean }

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TOO_MANY = "Too many reset requests. Please wait a while and try again."

/** Emails a reset link. Says the same thing whether or not the email has an account. */
export async function requestPasswordReset(_previous: ForgotState, formData: FormData): Promise<ForgotState> {
  if (!isDatabaseConfigured() || (process.env.NODE_ENV === "production" && !isEmailConfigured())) {
    return { error: "Password reset isn't available right now. Please try again later." }
  }
  const raw = formData.get("email")
  if (typeof raw !== "string" || raw.length > 254 || !EMAIL_PATTERN.test(raw.trim())) {
    return { error: "Enter a valid email address." }
  }
  const email = normalizeEmail(raw)

  const decision = await checkRateLimit("passwordResetRequest", await headers())
  if (!decision.allowed) return { error: TOO_MANY }

  // The lookup and the email run after the response is sent, and can't change it. Otherwise the
  // reply (an error, or simply a slower answer while an email is sent) would reveal whether the
  // address has an account.
  const base = siteUrl(process.env)
  after(async () => {
    const outcome = await startPasswordResetQuietly(email, base, resetDeps)
    // Outcome only, never the address.
    console.log(JSON.stringify({ event: "password_reset_request", outcome }))
  })
  return { sent: true, email }
}

export async function resetPassword(_previous: ResetState, formData: FormData): Promise<ResetState> {
  if (!isDatabaseConfigured()) return { error: "Password reset isn't available right now." }

  const decision = await checkRateLimit("passwordResetSubmit", await headers())
  if (!decision.allowed) return { error: TOO_MANY }

  try {
    const result = await finishPasswordReset(formData.get("token"), formData.get("password"), formData.get("confirm"), resetDeps)
    if (!result.ok) return { error: result.error }
    console.log(JSON.stringify({ event: "password_reset_done" }))
    return { done: true }
  } catch (error) {
    console.error("Password reset failed:", error instanceof Error ? error.message : error)
    return { error: "Something went wrong. Please try again." }
  }
}
