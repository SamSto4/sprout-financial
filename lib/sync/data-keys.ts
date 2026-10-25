// The names under which a signed-in user's data syncs (/api/account/data/[key]).
// Kept free of framework imports so it can be unit-tested with `node --test`.

export const DATA_KEYS = ["finances", "progress", "profile", "portfolio", "budget"] as const

export type DataKey = (typeof DATA_KEYS)[number]

/**
 * Exact names only. `key in someObject` would also accept inherited names such as "constructor"
 * or "toString" (CWE-1321), which let a request skip validation and store arbitrary JSON.
 */
export function isDataKey(key: unknown): key is DataKey {
  return typeof key === "string" && (DATA_KEYS as readonly string[]).includes(key)
}
