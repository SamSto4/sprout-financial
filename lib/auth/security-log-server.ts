import "server-only"

import { headers } from "next/headers"
import { after } from "next/server"

import { siteUrl } from "@/lib/auth/reset"
import { securityNoticeEmail, type SecurityNoticeKind } from "@/lib/auth/security-email"
import {
  buildEventDoc,
  MAX_EVENTS_PER_TYPE,
  parseStoredEvent,
  readRequestContext,
  SECURITY_LOG_READ_LIMIT,
  summarizeEvents,
  trustLocationHeaders,
  type RequestContext,
  type SecurityActivity,
  type SecurityEvent,
  type SecurityEventDoc,
  type SecurityEventType,
} from "@/lib/auth/security-log"
import { findUserByEmail, normalizeEmail } from "@/lib/auth/users"
import { getDb, isDatabaseConfigured } from "@/lib/db/mongodb"
import { sendEmail } from "@/lib/email/send"
import { accountKey } from "@/lib/rate-limit/limits"
import { checkRateLimitFor } from "@/lib/rate-limit/server"

// The security activity log (lib/auth/security-log.ts) wired to MongoDB, the request and email.
// Collection `security_events`: one document per event (SecurityEventDoc). At most
// MAX_EVENTS_PER_TYPE per account and type, removed after 90 days by a TTL index
// (lib/db/mongodb.ts) and with the account (deleteAccountData in lib/db/account-data.ts).
//
// Everything here is best effort and runs after the response has been sent (next/server after()):
// it never throws to the caller and logs failures without the address. So recording can't slow
// down, change or break a login, and the reply never depends on whether an address has an account.

async function events() {
  return (await getDb()).collection<SecurityEventDoc>("security_events")
}

/** The context to keep for this request: the device, and where the host provides it, the rough place. */
export function requestContextFrom(requestHeaders: { get(name: string): string | null }): RequestContext {
  return readRequestContext(requestHeaders, { trustLocation: trustLocationHeaders(process.env) })
}

/** requestContextFrom for server actions and Auth.js events, which read the request with headers(). */
export async function currentRequestContext(): Promise<RequestContext> {
  try {
    return requestContextFrom(await headers())
  } catch {
    return {}
  }
}

/** One JSON log line with counts and kinds only: never the address, and never a driver message, which can quote a document. */
function logFailure(label: Record<string, string>, error: unknown) {
  const code = (error as { code?: unknown } | null)?.code
  console.error(
    JSON.stringify({
      ...label,
      outcome: "failed",
      error: error instanceof Error ? error.name : "unknown",
      ...(typeof code === "number" || typeof code === "string" ? { code } : {}),
    })
  )
}

/** Runs `task` after the response is sent; outside a request (a script), straight away. Never throws. */
function afterResponse(label: Record<string, string>, task: () => Promise<void>) {
  const guarded = () => task().catch((error: unknown) => logFailure(label, error))
  try {
    after(guarded)
  } catch {
    void guarded()
  }
}

/** Keeps the newest MAX_EVENTS_PER_TYPE of one type for one account. */
async function trim(userEmail: string, type: SecurityEventType) {
  const collection = await events()
  const overflow = await collection
    .find({ userEmail, type }, { projection: { _id: 1 } })
    .sort({ at: -1, _id: -1 })
    .skip(MAX_EVENTS_PER_TYPE)
    .toArray()
  if (overflow.length > 0) await collection.deleteMany({ _id: { $in: overflow.map((row) => row._id) } })
}

/**
 * Writes one event now. Never throws. For code that already runs after the response (inside an
 * after() callback); everything else uses recordSecurityEventLater. The caller must know the
 * account exists: no event is ever written for an address without one.
 */
export async function recordSecurityEvent(email: string, event: SecurityEvent): Promise<void> {
  if (!isDatabaseConfigured()) return
  const doc = buildEventDoc(email, event)
  if (!doc) return
  try {
    await (await events()).insertOne(doc)
    await trim(doc.userEmail, doc.type)
  } catch (error) {
    logFailure({ event: "security_log_write", type: doc.type }, error)
  }
}

/** An event without its time: the "later" helpers take the time when they're called. */
export type SecurityEventInput = Omit<SecurityEvent, "at">

/** Records an event after the response has been sent. The caller must know the account exists. */
export function recordSecurityEventLater(email: string, event: SecurityEventInput): void {
  if (!isDatabaseConfigured()) return
  const at = new Date()
  afterResponse({ event: "security_log_write", type: event.type }, () => recordSecurityEvent(email, { ...event, at }))
}

/**
 * A wrong password at login. Recorded only when the address has a password account, and that is
 * looked up after the response, so the reply and its timing are the same whether or not it does.
 */
export function recordWrongPasswordLater(email: string, context: RequestContext): void {
  if (!isDatabaseConfigured()) return
  const at = new Date()
  afterResponse({ event: "security_log_write", type: "password_wrong" }, async () => {
    const user = await findUserByEmail(email)
    if (!user?.passwordHash) return
    await recordSecurityEvent(user.email, { type: "password_wrong", at, ...context })
  })
}

/**
 * Emails the account's owner about a security change (lib/auth/security-email.ts), after the
 * response. Skipped when the account no longer exists or has had 10 of these in the last hour
 * (securityNotice limit); the change itself is never held up and stays in the log either way.
 */
export function sendSecurityNoticeLater(email: string, kind: SecurityNoticeKind, context: RequestContext): void {
  if (!isDatabaseConfigured()) return
  const at = new Date()
  afterResponse({ event: "security_notice", kind }, async () => {
    const user = await findUserByEmail(email)
    if (!user) return
    // Sent each time a code is refused, so it's kept to one a day per account (twoFactorLoginNotice).
    if (kind === "two_step_attempts") {
      const first = await checkRateLimitFor("twoFactorLoginNotice", accountKey(user.email))
      if (!first.allowed) return
    }
    const decision = await checkRateLimitFor("securityNotice", accountKey(user.email))
    if (!decision.allowed) {
      console.log(JSON.stringify({ event: "security_notice", kind, outcome: "limited" }))
      return
    }
    await sendEmail(
      securityNoticeEmail(user.email, { kind, at, context, base: siteUrl(process.env), hasPassword: Boolean(user.passwordHash) })
    )
    console.log(JSON.stringify({ event: "security_notice", kind, outcome: "sent" }))
  })
}

/** The Account page's list, newest first. Never throws: a database problem shows as "couldn't load". */
export async function getSecurityActivity(email: string, now: number = Date.now()): Promise<SecurityActivity> {
  if (!isDatabaseConfigured()) return { status: "ok", rows: [] }
  try {
    const rows = await (await events())
      .find({ userEmail: normalizeEmail(email) }, { projection: { _id: 0, userEmail: 0, expiresAt: 0 } })
      .sort({ at: -1, _id: -1 })
      .limit(SECURITY_LOG_READ_LIMIT)
      .toArray()
    const parsed = rows.map(parseStoredEvent).filter((event): event is SecurityEvent => event !== null)
    return { status: "ok", rows: summarizeEvents(parsed, now) }
  } catch (error) {
    logFailure({ event: "security_log_read" }, error)
    return { status: "unavailable" }
  }
}
