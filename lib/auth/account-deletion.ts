// Rules for deleting an account. Kept free of framework imports so they can be unit-tested with
// `node --test`; DELETE /api/account and lib/auth/users.ts apply them.
//
// Deleting an account removes the user, every synced chat and data key, the security activity log
// and any pending reset links. Sessions are signed cookies the server can't delete, so a short
// record of when the account was deleted (keyed by a hash of the email, never the address) is kept
// until every session from before then has expired. The jwt callback ends those sessions the same way a
// password reset does, so another device can't stay signed in and re-upload the data.

/** Storage operations, supplied by the server (DELETE /api/account) or by a test. */
export type DeletionDeps = {
  /** Deletes every synced chat and data key, and the security activity log, for the email. */
  deleteData(email: string): Promise<void>
  /** Deletes the user and reset links, and records the deletion so older sessions end. */
  deleteUser(email: string): Promise<void>
}

/**
 * Deletes an account in an order that leaves nothing behind:
 * 1. Synced data. If this fails, the account still exists and the person can try again.
 * 2. The user, which also ends sessions and makes /api/account refuse new writes (requireUser).
 * 3. Synced data again, for a write another device made between steps 1 and 2.
 * Once step 2 has happened the account is gone and can't be retried, so a failure in step 3 is
 * reported in the result instead of thrown. Anything it missed is cleared when an account with
 * that email is next created (clearLeftoverData in lib/auth/users.ts).
 */
export async function deleteAccountEverywhere(email: string, deps: DeletionDeps): Promise<{ leftovers: boolean }> {
  await deps.deleteData(email)
  await deps.deleteUser(email)
  try {
    await deps.deleteData(email)
    return { leftovers: false }
  } catch {
    return { leftovers: true }
  }
}

/** Sessions last at most 30 days (Auth.js default), so a deletion record is needed for 31. */
export const DELETION_RECORD_DAYS = 31

/** When the deletion record removes itself (TTL index in lib/db/mongodb.ts). */
export function deletionRecordExpiry(deletedAt: Date): Date {
  return new Date(deletedAt.getTime() + DELETION_RECORD_DAYS * 24 * 60 * 60 * 1000)
}

/**
 * True when the confirmation the person typed is their own email. Case and surrounding spaces
 * don't matter. Guards against deleting by accident, not against someone holding the session; with
 * two-step verification on, checkDeletionCode does that.
 */
export function confirmsDeletion(confirm: unknown, email: string): boolean {
  if (typeof confirm !== "string" || confirm.length > 254) return false
  const typed = confirm.trim().toLowerCase()
  return typed.length > 0 && typed === email.trim().toLowerCase()
}

/**
 * The time before which every session for this email must end: the latest of the times given (the
 * last password reset, the last "Sign out everywhere" and the last account deletion). Missing and
 * unreadable times are ignored; null when none is left.
 */
export function sessionsEndedAt(...times: (Date | null | undefined)[]): Date | null {
  const valid = times.filter((time): time is Date => time instanceof Date && Number.isFinite(time.getTime()))
  if (valid.length === 0) return null
  return new Date(Math.max(...valid.map((time) => time.getTime())))
}

/** The longest code accepted in a deletion request (a recovery code has 16 characters plus dashes). */
const MAX_CODE_LENGTH = 64

/** What DELETE /api/account needs to check a two-step code; supplied by the route or by a test. */
export type DeletionCodeDeps = {
  /** Whether the account has two-step verification on. */
  twoFactorEnabled(email: string): Promise<boolean>
  /** Counts one try against the account's two-step limit; seconds to wait when it's used up, else null. */
  limited(email: string): Promise<number | null>
  /** Checks a code and uses it up when it's right (checkSecondFactor). */
  check(email: string, code: string): Promise<"ok" | "invalid" | "not-enabled" | "unavailable">
}

export type DeletionCodeOutcome =
  | { ok: true }
  | { ok: false; status: 403 | 429 | 503; error: string; needsCode?: true; retryAfterSeconds?: number }

/**
 * With two-step verification on, deleting the account also needs a current code from the app or a
 * recovery code (`code` in the request body), so someone who only holds a signed-in browser can't
 * wipe the account. Without it on, nothing more than the typed email is asked for. A missing code
 * isn't counted against the limit; every code that is checked is.
 */
export async function checkDeletionCode(email: string, body: unknown, deps: DeletionCodeDeps): Promise<DeletionCodeOutcome> {
  if (!(await deps.twoFactorEnabled(email))) return { ok: true }
  const code = body && typeof body === "object" ? (body as { code?: unknown }).code : undefined
  if (typeof code !== "string" || code.trim() === "" || code.length > MAX_CODE_LENGTH) {
    return { ok: false, status: 403, needsCode: true, error: "Enter a code from your authenticator app, or a recovery code." }
  }
  const wait = await deps.limited(email)
  if (wait !== null) {
    return { ok: false, status: 429, retryAfterSeconds: wait, error: "Too many codes tried. Please wait a few minutes and try again." }
  }
  const result = await deps.check(email, code)
  // Turned off in the meantime (which itself needed a code): nothing more to ask for.
  if (result === "ok" || result === "not-enabled") return { ok: true }
  if (result === "unavailable") {
    return { ok: false, status: 503, error: "Two-step verification can't be checked right now, so your account can't be deleted. Please try again later." }
  }
  return { ok: false, status: 403, needsCode: true, error: "That code didn't work. Use the newest code from your app, or a recovery code." }
}
