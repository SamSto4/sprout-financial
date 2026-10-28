// Copies saved to an account before card and account numbers were masked. The parsers mask them
// whenever they're read (parseSavedChats, parseImportedFinances), but sync uploads only what changed
// by version (a chat's updatedAt, an import's file and date; lib/sync/merge.ts), and masking changes
// no version, so the account's stored copy would keep the full numbers until that chat or import
// changed. GET /api/account writes the parsed copy back instead, using these to find which differ.
// Kept free of framework imports so it can be unit-tested with `node --test`.

import type { SavedChat } from "../chat/history.ts"

/** JSON with every object's keys sorted, so the order a database returns fields in doesn't count as a change. */
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    typeof item === "object" && item !== null && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : item
  )
}

/** Whether parsing changed a stored value (a masked number, a dropped field), so the parsed copy should replace it. */
export function changedByParsing(stored: unknown, parsed: unknown): boolean {
  return parsed !== null && parsed !== undefined && canonicalJson(stored) !== canonicalJson(parsed)
}

/** The parsed chats whose stored copy differs, to write back. Stored chats that didn't parse are left as they are. */
export function chatsChangedByParsing(stored: unknown[], parsed: SavedChat[]): SavedChat[] {
  const storedById = new Map<string, unknown>()
  for (const row of stored) {
    const id = typeof row === "object" && row !== null ? (row as { id?: unknown }).id : undefined
    if (typeof id === "string") storedById.set(id, row)
  }
  return parsed.filter((chat) => storedById.has(chat.id) && changedByParsing(storedById.get(chat.id), chat))
}
