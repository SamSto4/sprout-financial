import "server-only"

import { currentUserEmail } from "@/lib/auth/session"
import { accountExists } from "@/lib/auth/users"
import { isDatabaseConfigured } from "@/lib/db/mongodb"
import { readJsonBody } from "@/lib/http/body"
import { accountKey } from "@/lib/rate-limit/limits"
import { checkRateLimitFor, limitMessage } from "@/lib/rate-limit/server"

/** The signed-in user's email, or the error response to return instead. */
export async function requireUser(): Promise<{ email: string } | { response: Response }> {
  if (!isDatabaseConfigured()) {
    return { response: Response.json({ error: "Accounts aren't set up on this server." }, { status: 503 }) }
  }
  const email = await currentUserEmail()
  if (!email) return { response: Response.json({ error: "Log in to sync your data." }, { status: 401 }) }
  // A deleted account's session can outlive the deletion for up to a minute (the jwt check is
  // cached), so confirm the account still exists before reading or writing its data. Otherwise
  // another device still signed in could re-upload what was just deleted.
  try {
    if (!(await accountExists(email))) {
      return { response: Response.json({ error: "This account no longer exists. Log in again." }, { status: 401 }) }
    }
  } catch (error) {
    console.error("Couldn't check the account:", error instanceof Error ? error.message : error)
    return { response: Response.json({ error: "Couldn't reach your account just now." }, { status: 503 }) }
  }
  return { email }
}

/**
 * The 429 to return when this account is syncing faster than its allowance, or null to carry on.
 * Counted per account (not per IP address), so it holds wherever the requests come from.
 */
export async function syncLimitResponse(email: string, policy: "accountSync" | "accountLoad"): Promise<Response | null> {
  const decision = await checkRateLimitFor(policy, accountKey(email))
  if (decision.allowed) return null
  return Response.json(
    { error: limitMessage(decision) },
    { status: 429, headers: { "Retry-After": String(decision.retryAfterSeconds), "Cache-Control": "no-store" } }
  )
}

/**
 * The most a sync request may send: well above the largest real chat (MAX_SYNCED_CHAT_LENGTH
 * characters) or data value (2,000 transactions, 36 budget months), well below what would let one
 * request tie up the server.
 */
export const MAX_SYNC_BODY_BYTES = 2 * 1024 * 1024

/** Reads a JSON body of at most `maxBytes`. Returns the value, or the error response to send instead. */
export async function readBody(
  request: Request,
  maxBytes: number = MAX_SYNC_BODY_BYTES
): Promise<{ value: unknown } | { response: Response }> {
  const body = await readJsonBody(request, maxBytes)
  if (body.ok) return { value: body.value }
  return body.reason === "too-large"
    ? { response: Response.json({ error: "That's too much data to sync at once." }, { status: 413 }) }
    : { response: Response.json({ error: "That data couldn't be read." }, { status: 400 }) }
}
