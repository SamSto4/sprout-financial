// The landing page's "Your account has been deleted" notice. Account deletion sends the browser to
// /?account=deleted, but anyone can type that address, so the notice also needs a short-lived
// mark that this tab really deleted an account: set in sessionStorage just before signing out
// (components/delete-account-form.tsx) and read by components/home/deleted-notice.tsx.
// Storage is passed in, so this can be unit-tested with `node --test`.

export const DELETED_NOTICE_KEY = "sprout-account-deleted"
/** How long after a deletion the notice can show: long enough for the sign-out redirect, and a refresh. */
export const DELETED_NOTICE_MS = 5 * 60_000

/** This tab's sessionStorage, or null where it's blocked (or on the server). */
export function tabStorage(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

type Writable = Pick<Storage, "setItem">
type Readable = Pick<Storage, "getItem">

/** Called once the account is gone, before signing out. Storage can be blocked: then no notice shows. */
export function markAccountDeleted(storage: Writable | null, now: number): void {
  try {
    storage?.setItem(DELETED_NOTICE_KEY, String(now))
  } catch {
    // Blocked or full storage: the notice is a courtesy, so nothing else changes.
  }
}

/** True only if this tab deleted an account in the last few minutes (and the clock hasn't gone backwards). */
export function recentlyDeletedHere(storage: Readable | null, now: number): boolean {
  let raw: string | null = null
  try {
    raw = storage?.getItem(DELETED_NOTICE_KEY) ?? null
  } catch {
    return false
  }
  if (raw === null || !/^\d{1,16}$/.test(raw)) return false
  const age = now - Number(raw)
  return age >= 0 && age <= DELETED_NOTICE_MS
}
