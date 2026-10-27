// Kept free of framework imports so it can be unit-tested with `node --test`.

/**
 * Saves a copy of something that's edited on several devices (a chat) only if it's newer than the
 * stored one, by its last update. Two steps, because a filter on the last update can't also
 * create a missing document: replace a stored copy older than this one; failing that, insert it,
 * which a unique index refuses when a copy already exists. If one was created in between (another
 * request for the same chat), it may be the older of the two, so the replace is tried once more.
 * "kept-newer": the stored copy is as new or newer and stays as it is.
 */
export async function saveIfNewer({
  replaceOlder,
  insert,
}: {
  /** Replaces the stored copy if it's older than this one; true when it did. */
  replaceOlder: () => Promise<boolean>
  /** Creates it; "exists" when a copy is already stored (MongoDB's duplicate key error, 11000). */
  insert: () => Promise<"inserted" | "exists">
}): Promise<"saved" | "kept-newer"> {
  if (await replaceOlder()) return "saved"
  if ((await insert()) === "inserted") return "saved"
  return (await replaceOlder()) ? "saved" : "kept-newer"
}

/** MongoDB's error for a write a unique index refused. */
export function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === 11000
}
