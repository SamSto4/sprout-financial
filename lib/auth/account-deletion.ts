// Rules for deleting an account. Kept free of framework imports so they can be unit-tested with
// `node --test`; DELETE /api/account and lib/auth/users.ts apply them.
//
// Deleting an account removes the user, every synced chat and data key, and any pending reset
// links. Sessions are signed cookies the server can't delete, so a short record of when the
// account was deleted (keyed by a hash of the email, never the address) is kept until every
// session from before then has expired. The jwt callback ends those sessions the same way a
// password reset does, so another device can't stay signed in and re-upload the data.

/** Storage operations, supplied by the server (DELETE /api/account) or by a test. */
export type DeletionDeps = {
  /** Deletes every synced chat and data key for the email. */
  deleteData(email: string): Promise<void>
  /** Deletes the user and reset links, and records the deletion so older sessions end. */
  deleteUser(email: string): Promise<void>
}

/**
 * Deletes an account in an order that leaves nothing behind:
 * 1. Synced data. If this fails, the account still exists and the person can try again.
 * 2. The user, which also ends sessions and makes /api/account refuse new writes (requireUser).
 * 3. Synced data again, for a write another device made between steps 1 and 2.
 */
export async function deleteAccountEverywhere(email: string, deps: DeletionDeps): Promise<void> {
  await deps.deleteData(email)
  await deps.deleteUser(email)
  await deps.deleteData(email)
}

/** Sessions last at most 30 days (Auth.js default), so a deletion record is needed for 31. */
export const DELETION_RECORD_DAYS = 31

/** When the deletion record removes itself (TTL index in lib/db/mongodb.ts). */
export function deletionRecordExpiry(deletedAt: Date): Date {
  return new Date(deletedAt.getTime() + DELETION_RECORD_DAYS * 24 * 60 * 60 * 1000)
}

/**
 * True when the confirmation the person typed is their own email. Case and surrounding spaces
 * don't matter. Guards against deleting by accident, not against someone holding the session.
 */
export function confirmsDeletion(confirm: unknown, email: string): boolean {
  if (typeof confirm !== "string" || confirm.length > 254) return false
  const typed = confirm.trim().toLowerCase()
  return typed.length > 0 && typed === email.trim().toLowerCase()
}

/**
 * The time before which every session for this email must end: the later of the last password
 * reset and the last account deletion. Null when neither has happened.
 */
export function sessionsEndedAt(passwordChangedAt: Date | null | undefined, deletedAt: Date | null | undefined): Date | null {
  const times = [passwordChangedAt, deletedAt].filter(
    (time): time is Date => time instanceof Date && Number.isFinite(time.getTime())
  )
  if (times.length === 0) return null
  return new Date(Math.max(...times.map((time) => time.getTime())))
}
