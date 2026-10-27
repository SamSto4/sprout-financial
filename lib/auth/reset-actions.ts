"use server"

import { headers } from "next/headers"
import { after } from "next/server"

import { rememberDevice } from "@/lib/auth/device-server"
import { finishPasswordReset, siteUrl, startPasswordResetQuietly } from "@/lib/auth/reset"
import { resetDeps } from "@/lib/auth/reset-server"
import { recordSecurityEvent, recordSecurityEventLater, requestContextFrom, sendSecurityNoticeLater } from "@/lib/auth/security-log-server"
import { normalizeEmail } from "@/lib/auth/users"
import { isDatabaseConfigured } from "@/lib/db/mongodb"
import { isEmailConfigured } from "@/lib/email/send"
import { accountKey } from "@/lib/rate-limit/limits"
import { checkRateLimit, checkRateLimitFor } from "@/lib/rate-limit/server"

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

  // Per visitor only. The per-address limit and the site-wide total are counted in after(), so they
  // can't change the reply, and the total only for an email that will really be sent.
  const requestHeaders = await headers()
  const decision = await checkRateLimit("passwordResetRequest", requestHeaders)
  if (!decision.allowed) return { error: TOO_MANY }

  // The lookup and the email run after the response is sent, and can't change it. Otherwise the
  // reply (an error, or simply a slower answer while an email is sent) would reveal whether the
  // address has an account.
  const base = siteUrl(process.env)
  const context = requestContextFrom(requestHeaders)
  const at = new Date()
  after(async () => {
    // Checked here, after the reply, so the page looks the same whether or not this address is limited.
    const perAddress = await checkRateLimitFor("passwordResetAddress", accountKey(email))
    if (!perAddress.allowed) {
      console.log(JSON.stringify({ event: "password_reset_request", outcome: "address-limited" }))
      return
    }
    const outcome = await startPasswordResetQuietly(email, base, resetDeps)
    // Outcome only, never the address.
    console.log(JSON.stringify({ event: "password_reset_request", outcome }))
    // A link went to an existing password account: note it in that account's security log.
    if (outcome === "sent") await recordSecurityEvent(email, { type: "password_reset_requested", at, ...context })
  })
  return { sent: true, email }
}

export async function resetPassword(_previous: ResetState, formData: FormData): Promise<ResetState> {
  if (!isDatabaseConfigured()) return { error: "Password reset isn't available right now." }

  const requestHeaders = await headers()
  const decision = await checkRateLimit("passwordResetSubmit", requestHeaders)
  if (!decision.allowed) return { error: TOO_MANY }

  try {
    const result = await finishPasswordReset(formData.get("token"), formData.get("password"), formData.get("confirm"), resetDeps)
    if (!result.ok) return { error: result.error }
    console.log(JSON.stringify({ event: "password_reset_done" }))
    const context = requestContextFrom(requestHeaders)
    recordSecurityEventLater(result.email, { type: "password_changed", ...context })
    sendSecurityNoticeLater(result.email, "password_changed", context)
    // The reset link proved this browser belongs to the owner: its logins are now counted on their
    // own, so someone pausing the account's logins by guessing can't keep the owner out.
    await rememberDevice(result.email)
    return { done: true }
  } catch (error) {
    console.error("Password reset failed:", error instanceof Error ? error.message : error)
    return { error: "Something went wrong. Please try again." }
  }
}
