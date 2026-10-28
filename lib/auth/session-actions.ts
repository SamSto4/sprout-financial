"use server"

import { currentRequestContext, recordSecurityEvent } from "@/lib/auth/security-log-server"
import { currentUserEmail } from "@/lib/auth/session"
import { accountExists, revokeAllSessions } from "@/lib/auth/users"
import { isDatabaseConfigured } from "@/lib/db/mongodb"
import { accountKey } from "@/lib/rate-limit/limits"
import { checkRateLimitFor, limitMessage } from "@/lib/rate-limit/server"

export type SignOutEverywhereResult = { ok: true } | { ok: false; error: string }

const FAILED = "Couldn't sign you out everywhere just now. Please try again."

/**
 * The Account page's "Sign out everywhere", for every kind of account (it's the only way for a
 * Google-only account, which has no password to reset). Ends every session that began before now,
 * this one included: the browser then signs itself out. Recorded in the security log before
 * replying, so it's listed when the person logs in again.
 */
export async function signOutEverywhere(): Promise<SignOutEverywhereResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: FAILED }
  try {
    const email = await currentUserEmail()
    if (!email || !(await accountExists(email))) return { ok: false, error: "You're not signed in any more. Log in again." }
    const decision = await checkRateLimitFor("sessionRevoke", accountKey(email))
    if (!decision.allowed) return { ok: false, error: limitMessage(decision) }
    if (!(await revokeAllSessions(email))) return { ok: false, error: FAILED }
    await recordSecurityEvent(email, { type: "signed_out_everywhere", at: new Date(), ...(await currentRequestContext()) })
    return { ok: true }
  } catch (error) {
    console.error(JSON.stringify({ event: "sign_out_everywhere", outcome: "failed", error: error instanceof Error ? error.name : "unknown" }))
    return { ok: false, error: FAILED }
  }
}
