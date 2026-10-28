import "server-only"

import { MAX_SAVED_CHATS, type SavedChat } from "@/lib/chat/history"
import { getDb } from "@/lib/db/mongodb"
import { replaceUnlessNewer } from "@/lib/db/replace-unless-newer"

// Everything a signed-in user syncs. Every query filters by userEmail, so one user can never
// read or change another's rows, whatever ids the browser sends.

type ChatDoc = SavedChat & { userEmail: string; chatId: string }
export type DataKey = "finances" | "progress" | "profile" | "portfolio" | "budget"
type DataDoc = { userEmail: string; key: DataKey; value: unknown; updatedAt: Date }

async function chats() {
  return (await getDb()).collection<ChatDoc>("chats")
}

async function data() {
  return (await getDb()).collection<DataDoc>("user_data")
}

/** The security activity log (lib/auth/security-log-server.ts). Named here so deleting an account clears it. */
async function securityEvents() {
  return (await getDb()).collection<{ userEmail: string }>("security_events")
}

export async function listChats(userEmail: string): Promise<SavedChat[]> {
  const rows = await (await chats())
    .find({ userEmail }, { projection: { _id: 0, userEmail: 0, chatId: 0 } })
    .sort({ updatedAt: -1 })
    .limit(MAX_SAVED_CHATS)
    .toArray()
  return rows as SavedChat[]
}

/**
 * Creates or replaces one chat, then keeps only the newest MAX_SAVED_CHATS. A stored copy updated
 * later than this one is kept instead (lib/db/replace-unless-newer.ts): a browser holding an old
 * copy, such as one GET /api/account left out of a long list, can't overwrite another device's
 * newer messages. Returns whether this copy was stored.
 */
export async function saveChat(userEmail: string, chat: SavedChat): Promise<boolean> {
  const collection = await chats()
  const doc: ChatDoc = { ...chat, userEmail, chatId: chat.id }
  // updatedAt is an ISO timestamp (toISOString), so comparing the strings compares the times.
  const saved = await replaceUnlessNewer((upsert) =>
    collection.replaceOne({ userEmail, chatId: chat.id, updatedAt: { $lte: chat.updatedAt } }, doc, { upsert })
  )

  const overflow = await collection
    .find({ userEmail }, { projection: { chatId: 1 } })
    .sort({ updatedAt: -1 })
    .skip(MAX_SAVED_CHATS)
    .toArray()
  if (overflow.length > 0) {
    await collection.deleteMany({ userEmail, chatId: { $in: overflow.map((row) => row.chatId) } })
  }
  return saved
}

/**
 * Replaces a stored chat with its parsed copy (masked; lib/sync/clean-copies.ts), only while the
 * stored copy is still the version that was read: never over a newer one, never bringing back a
 * deleted one.
 */
export async function rewriteChat(userEmail: string, chat: SavedChat) {
  await (await chats()).replaceOne({ userEmail, chatId: chat.id, updatedAt: chat.updatedAt }, { ...chat, userEmail, chatId: chat.id })
}

export async function deleteChat(userEmail: string, chatId: string) {
  await (await chats()).deleteOne({ userEmail, chatId })
}

export async function getUserData(userEmail: string, key: DataKey): Promise<unknown> {
  const row = await (await data()).findOne({ userEmail, key })
  return row?.value ?? null
}

/** One stored value with when it was saved, for rewriteUserData. */
export async function getUserDataRow(userEmail: string, key: DataKey): Promise<{ value: unknown; updatedAt: Date | null } | null> {
  const row = await (await data()).findOne({ userEmail, key })
  return row ? { value: row.value ?? null, updatedAt: row.updatedAt ?? null } : null
}

/**
 * Replaces a stored value with its parsed copy (masked; lib/sync/clean-copies.ts), only while it's
 * still the one saved at `savedAt`, so an upload from another device in the meantime is kept.
 * updatedAt stays as it was.
 */
export async function rewriteUserData(userEmail: string, key: DataKey, savedAt: Date | null, value: unknown) {
  const sameVersion = savedAt ? { updatedAt: savedAt } : { updatedAt: { $exists: false } }
  await (await data()).updateOne({ userEmail, key, ...sameVersion }, { $set: { value } })
}

export async function setUserData(userEmail: string, key: DataKey, value: unknown) {
  await (await data()).updateOne({ userEmail, key }, { $set: { value, updatedAt: new Date() } }, { upsert: true })
}

/**
 * Deletes every synced chat and data key, and the security activity log, for the account (part of
 * deleting the account, and of starting a new one empty: clearLeftoverData in lib/auth/users.ts).
 */
export async function deleteAccountData(userEmail: string) {
  await Promise.all([
    (await chats()).deleteMany({ userEmail }),
    (await data()).deleteMany({ userEmail }),
    (await securityEvents()).deleteMany({ userEmail }),
  ])
}

export async function deleteUserData(userEmail: string, key: DataKey) {
  await (await data()).deleteOne({ userEmail, key })
}
