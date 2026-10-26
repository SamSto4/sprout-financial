import "server-only"

import { MAX_SAVED_CHATS, type SavedChat } from "@/lib/chat/history"
import { getDb } from "@/lib/db/mongodb"

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

export async function listChats(userEmail: string): Promise<SavedChat[]> {
  const rows = await (await chats())
    .find({ userEmail }, { projection: { _id: 0, userEmail: 0, chatId: 0 } })
    .sort({ updatedAt: -1 })
    .limit(MAX_SAVED_CHATS)
    .toArray()
  return rows as SavedChat[]
}

/** Creates or replaces one chat, then keeps only the newest MAX_SAVED_CHATS. */
export async function saveChat(userEmail: string, chat: SavedChat) {
  const collection = await chats()
  await collection.replaceOne({ userEmail, chatId: chat.id }, { ...chat, userEmail, chatId: chat.id }, { upsert: true })

  const overflow = await collection
    .find({ userEmail }, { projection: { chatId: 1 } })
    .sort({ updatedAt: -1 })
    .skip(MAX_SAVED_CHATS)
    .toArray()
  if (overflow.length > 0) {
    await collection.deleteMany({ userEmail, chatId: { $in: overflow.map((row) => row.chatId) } })
  }
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

/** Deletes every synced chat and data key for the account (part of deleting the account). */
export async function deleteAccountData(userEmail: string) {
  await Promise.all([(await chats()).deleteMany({ userEmail }), (await data()).deleteMany({ userEmail })])
}

export async function deleteUserData(userEmail: string, key: DataKey) {
  await (await data()).deleteOne({ userEmail, key })
}
