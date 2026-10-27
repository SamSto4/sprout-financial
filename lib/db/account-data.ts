import "server-only"

import { MAX_SAVED_CHATS, type SavedChat } from "@/lib/chat/history"
import { getDb } from "@/lib/db/mongodb"
import { isDuplicateKeyError, saveIfNewer } from "@/lib/db/save-newer"

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
 * Creates one chat, or replaces it when the stored copy is older (by updatedAt), then keeps only
 * the newest MAX_SAVED_CHATS. A device can hold an old copy of a chat that another device has
 * added to since, for example one the account load left out (takeChatsWithinBytes), and its
 * upload must not undo that. "kept-newer" when the stored copy stays.
 */
export async function saveChat(userEmail: string, chat: SavedChat): Promise<"saved" | "kept-newer"> {
  const collection = await chats()
  const doc: ChatDoc = { ...chat, userEmail, chatId: chat.id }
  const outcome = await saveIfNewer({
    // updatedAt is an ISO timestamp (toISOString), so comparing the strings compares the times.
    replaceOlder: async () => (await collection.replaceOne({ userEmail, chatId: chat.id, updatedAt: { $lt: chat.updatedAt } }, doc)).matchedCount > 0,
    insert: async () => {
      try {
        // A copy: the driver adds an _id to the document it inserts, which a later replace can't carry.
        await collection.insertOne({ ...doc })
        return "inserted"
      } catch (error) {
        if (isDuplicateKeyError(error)) return "exists"
        throw error
      }
    },
  })
  if (outcome === "kept-newer") return outcome

  const overflow = await collection
    .find({ userEmail }, { projection: { chatId: 1 } })
    .sort({ updatedAt: -1 })
    .skip(MAX_SAVED_CHATS)
    .toArray()
  if (overflow.length > 0) {
    await collection.deleteMany({ userEmail, chatId: { $in: overflow.map((row) => row.chatId) } })
  }
  return outcome
}

export async function deleteChat(userEmail: string, chatId: string) {
  await (await chats()).deleteOne({ userEmail, chatId })
}

export async function getUserData(userEmail: string, key: DataKey): Promise<unknown> {
  const row = await (await data()).findOne({ userEmail, key })
  return row?.value ?? null
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
