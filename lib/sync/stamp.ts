// The timestamp a save is stamped with, for account sync's "newest copy wins" rules.
// Kept free of framework imports so it can be unit-tested with `node --test`.

// The last time toISOString writes with a four-digit year. Later ones start with "+0", which
// sorts before every real stamp when compared as strings, as sync does.
const LAST_STAMP = Date.parse("9999-12-31T23:59:59.999Z")

/**
 * The stamp for a save replacing a copy stamped `previous`: now, or 1 ms after `previous` when
 * that's not earlier. Sync keeps whichever copy is stamped later, using each device's own clock,
 * so an edit of a copy saved by a device whose clock runs ahead would otherwise be stamped earlier
 * than the copy it replaces: never uploaded, and lost to the older copy on every merge until real
 * time caught up. A missing or unreadable `previous` gives now, and so does one so far ahead that
 * 1 ms more can't be written as a stamp.
 */
export function nextStamp(previous: string | null | undefined, now: Date): string {
  const after = previous ? Date.parse(previous) + 1 : Number.NaN
  return after > now.getTime() && after <= LAST_STAMP ? new Date(after).toISOString() : now.toISOString()
}
