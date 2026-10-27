// Which account this browser's copy of the data belongs to. Sync writes a marker when it starts,
// and sign-out removes it with the data. A session can also end without the Sign out menu (the
// 30-day cap, a password reset or account deletion on another device, an expired cookie), which
// leaves the copy behind; the marker is how the next sign-in knows it isn't that person's.
// Pure, so `node --test` can load it.

export const SYNC_OWNER_KEY = "sprout-sync-owner"

/** Stored under SYNC_OWNER_KEY. `token` changes every time a sync starts, in any tab. */
export type SyncOwner = { email: string; token: string }

export function syncOwner(email: string, token: string): SyncOwner {
  return { email: email.toLowerCase(), token }
}

/**
 * What to do with the browser's copy when `email` signs in. No marker means it was never synced:
 * the visitor's own data from before signing in, merged into the account as always. A marker for
 * this account means it's theirs. Anything else (another account, or a marker that isn't one) is
 * discarded without uploading.
 */
export function localCopyAction(stored: unknown, email: string): "merge" | "discard" {
  if (stored === null || stored === undefined) return "merge"
  if (typeof stored !== "object") return "discard"
  const owner = (stored as Record<string, unknown>).email
  return typeof owner === "string" && owner.toLowerCase() === email.toLowerCase() ? "merge" : "discard"
}

/**
 * Whether the marker is still the one read before a wait. It changes when a sync starts in any tab,
 * so a different value means someone signed in meanwhile and the copy is theirs now.
 */
export function sameOwnerMarker(before: unknown, now: unknown): boolean {
  return before !== null && before !== undefined && JSON.stringify(before) === JSON.stringify(now)
}
