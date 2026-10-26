"use server"

import { headers } from "next/headers"

import { confirmEmail } from "@/lib/auth/verify"
import { verifyDeps } from "@/lib/auth/verify-server"
import { isDatabaseConfigured } from "@/lib/db/mongodb"
import { checkRateLimit } from "@/lib/rate-limit/server"

export type ConfirmState = { error?: string; done?: boolean }

/** The button on /verify-email: confirms the address the link was sent to. */
export async function confirmEmailAction(_previous: ConfirmState, formData: FormData): Promise<ConfirmState> {
  if (!isDatabaseConfigured()) return { error: "Accounts aren't available right now." }

  const decision = await checkRateLimit("verifyEmailSubmit", await headers())
  if (!decision.allowed) return { error: "Too many attempts. Please wait a few minutes and try again." }

  try {
    const result = await confirmEmail(formData.get("token"), verifyDeps)
    console.log(JSON.stringify({ event: "email_verified", ok: result.ok }))
    return result.ok ? { done: true } : { error: result.error }
  } catch (error) {
    console.error("Email confirmation failed:", error instanceof Error ? error.message : error)
    return { error: "Something went wrong. Please try again." }
  }
}
