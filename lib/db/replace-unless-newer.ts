// Saving a synced chat without ever replacing a newer copy of it.
// Kept free of framework imports so it can be unit-tested with `node --test`.

/** MongoDB's duplicate key error: an insert (or an upsert's insert) that hit a unique index. */
export function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === 11000
}

/**
 * Runs `replace`, a replaceOne whose filter matches only a stored copy last updated at or before
 * this one, and that inserts when `upsert` is true. When the stored copy is newer (another device
 * saved it after this browser loaded the account), the filter misses, the insert hits the unique
 * index, and nothing is written. The same error comes from two requests inserting one new chat at
 * once, so after it the replace is tried once more without inserting: it lands if the copy that won
 * is older. Returns whether this copy was stored.
 */
export async function replaceUnlessNewer(replace: (upsert: boolean) => Promise<{ matchedCount: number }>): Promise<boolean> {
  try {
    await replace(true)
    return true
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error
  }
  return (await replace(false)).matchedCount > 0
}
