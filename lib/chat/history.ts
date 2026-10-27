// Saved conversations. They live in the user's browser; recent ones are sent along with each
// question so the assistant can look back at them with its search_past_chats tool.
// Kept free of framework imports so it can be unit-tested with `node --test`.

import { compactArtifacts } from "../ai/artifacts.ts"
import type { ChatMessage } from "./validate.ts"

export type SavedChat = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messages: ChatMessage[]
}

/** A trimmed copy of a saved chat, as sent to the server for the assistant to search. */
export type PastChat = {
  id: string
  title: string
  updatedAt: string
  messages: ChatMessage[]
}

export const MAX_SAVED_CHATS = 50
export const MAX_CONTEXT_CHATS = 20
export const MAX_CONTEXT_MESSAGE_LENGTH = 1500
export const MAX_CONTEXT_CHAT_LENGTH = 8000
const MAX_ID_LENGTH = 64
const MAX_TITLE_LENGTH = 80
const MAX_STORED_MESSAGES = 200
/**
 * Most characters of message text one chat may sync to an account (PUT /api/account/chats/[id]).
 * The chat API refuses histories over 150,000 characters (MAX_TOTAL_LENGTH in validate.ts), so a
 * real chat is at most that plus one final reply, about 220,000. Without a cap, each of a user's 50
 * synced chats could be ~4 MB (the request body limit), letting a few throwaway accounts fill the
 * database for everyone (CWE-770).
 */
export const MAX_SYNCED_CHAT_LENGTH = 300_000

/**
 * Most bytes GET /api/account sends. Vercel refuses a function response over 4.5 MB, and 50 chats
 * at MAX_SYNCED_CHAT_LENGTH would be far more, so the oldest chats are left out to stay under it.
 */
export const MAX_ACCOUNT_LOAD_BYTES = 4_000_000

/** The size of a value as JSON on the wire (UTF-8 bytes, not characters). */
export function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value) ?? "").length
}

/**
 * The newest chats (the list is newest first) whose JSON array fits in `maxBytes`. It stops at the
 * first chat that doesn't fit, so only the oldest are ever left out; `truncated` says whether any
 * were. Left-out chats stay on the server untouched: the browser never hears of them, so it
 * neither merges nor deletes them.
 */
export function takeChatsWithinBytes(chats: SavedChat[], maxBytes: number): { chats: SavedChat[]; truncated: boolean } {
  let used = 2 // [ and ]
  for (let index = 0; index < chats.length; index++) {
    used += jsonBytes(chats[index]) + (index > 0 ? 1 : 0)
    if (used > maxBytes) return { chats: chats.slice(0, index), truncated: true }
  }
  return { chats, truncated: false }
}

/** Total characters of message text in a chat, compared against MAX_SYNCED_CHAT_LENGTH. */
export function chatTextLength(chat: Pick<SavedChat, "messages">): number {
  return chat.messages.reduce((total, message) => total + message.content.length, 0)
}

export function newChatId() {
  // crypto.randomUUID is missing on plain-http LAN addresses, so don't depend on it.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** The first question, shortened, names the chat. */
export function chatTitle(messages: ChatMessage[]) {
  const first = messages.find((message) => message.role === "user")?.content.replace(/\s+/g, " ").trim()
  if (!first) return "New chat"
  return first.length > 60 ? `${first.slice(0, 57).trimEnd()}…` : first
}

function parseMessages(raw: unknown, maxLength: number): ChatMessage[] | null {
  if (!Array.isArray(raw)) return null
  const messages: ChatMessage[] = []
  for (const item of raw.slice(0, MAX_STORED_MESSAGES)) {
    if (typeof item !== "object" || item === null) continue
    const { role, content } = item as Record<string, unknown>
    if ((role !== "user" && role !== "assistant") || typeof content !== "string" || !content.trim()) continue
    messages.push({ role, content: shorten(content, maxLength) })
  }
  return messages.length > 0 ? messages : null
}

function shorten(text: string, maxLength: number) {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text
}

function isShortString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength
}

function newestFirst<T extends { updatedAt: string }>(a: T, b: T) {
  return b.updatedAt.localeCompare(a.updatedAt)
}

/** Reads saved chats from browser storage, dropping anything malformed. */
export function parseSavedChats(raw: unknown): SavedChat[] {
  if (!Array.isArray(raw)) return []
  const chats: SavedChat[] = []
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue
    const { id, title, createdAt, updatedAt, messages } = item as Record<string, unknown>
    if (!isShortString(id, MAX_ID_LENGTH) || !isShortString(updatedAt, 40)) continue
    const parsed = parseMessages(messages, Number.POSITIVE_INFINITY)
    if (!parsed) continue
    chats.push({
      id,
      title: isShortString(title, MAX_TITLE_LENGTH) ? title : chatTitle(parsed),
      createdAt: isShortString(createdAt, 40) ? createdAt : updatedAt,
      updatedAt,
      messages: parsed,
    })
  }
  return chats.sort(newestFirst).slice(0, MAX_SAVED_CHATS)
}

/** Adds or replaces a chat, keeping the list newest first and within MAX_SAVED_CHATS. */
export function upsertChat(chats: SavedChat[], chat: SavedChat): SavedChat[] {
  return [chat, ...chats.filter((existing) => existing.id !== chat.id)].sort(newestFirst).slice(0, MAX_SAVED_CHATS)
}

/**
 * The recent chats to send with a question, minus the open one. Long messages are shortened
 * and each chat is capped, so the request stays small however much has been saved.
 */
export function toPastChats(chats: SavedChat[], excludeId: string): PastChat[] {
  return chats
    .filter((chat) => chat.id !== excludeId)
    .slice(0, MAX_CONTEXT_CHATS)
    .map((chat) => {
      const messages: ChatMessage[] = []
      let budget = MAX_CONTEXT_CHAT_LENGTH
      for (const message of chat.messages) {
        if (budget <= 0) break
        // Charts and tables become short notes, so their JSON doesn't fill the budget.
        const content = shorten(compactArtifacts(message.content), Math.min(MAX_CONTEXT_MESSAGE_LENGTH, budget))
        messages.push({ role: message.role, content })
        budget -= content.length
      }
      return { id: chat.id, title: chat.title, updatedAt: chat.updatedAt, messages }
    })
}

/** Reads past chats from a request body. Malformed entries are dropped and sizes are capped. */
export function parsePastChats(raw: unknown): PastChat[] {
  if (!Array.isArray(raw)) return []
  const chats: PastChat[] = []
  for (const item of raw.slice(0, MAX_CONTEXT_CHATS)) {
    if (typeof item !== "object" || item === null) continue
    const { id, title, updatedAt, messages } = item as Record<string, unknown>
    if (!isShortString(id, MAX_ID_LENGTH) || !isShortString(updatedAt, 40)) continue
    const parsed = parseMessages(messages, MAX_CONTEXT_MESSAGE_LENGTH)
    if (!parsed) continue

    const capped: ChatMessage[] = []
    let budget = MAX_CONTEXT_CHAT_LENGTH
    for (const message of parsed) {
      if (budget <= 0) break
      capped.push(message)
      budget -= message.content.length
    }
    chats.push({
      id,
      title: isShortString(title, MAX_TITLE_LENGTH) ? title : chatTitle(parsed),
      updatedAt,
      messages: capped,
    })
  }
  return chats
}

const STOP_WORDS = new Set([
  "the", "and", "for", "you", "your", "that", "this", "with", "what", "how", "was", "were", "are",
  "did", "does", "about", "from", "have", "has", "had", "can", "could", "would", "should", "our",
  "we", "me", "my", "i", "a", "an", "to", "of", "in", "on", "is", "it", "be", "or", "do", "told",
  "said", "talked", "discussed", "last", "time", "before", "earlier", "chat", "conversation",
])

function searchTerms(query: string) {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9$%]+/)
    .filter((term) => term.length >= 2 && !STOP_WORDS.has(term))
  return [...new Set(terms)]
}

export type PastChatMatch = {
  chatId: string
  title: string
  date: string
  role: ChatMessage["role"]
  excerpt: string
}

/** Keyword search over past chats: messages matching the most query words come first. */
export function searchPastChats(chats: PastChat[], query: string, limit = 8): PastChatMatch[] {
  const terms = searchTerms(query)
  if (terms.length === 0) return []

  const scored: { score: number; updatedAt: string; match: PastChatMatch }[] = []
  for (const chat of chats) {
    const titleText = chat.title.toLowerCase()
    for (const message of chat.messages) {
      const text = message.content.toLowerCase()
      const hits = terms.filter((term) => text.includes(term))
      if (hits.length === 0) continue

      const titleHits = terms.filter((term) => titleText.includes(term)).length
      const index = text.indexOf(hits[0])
      const start = Math.max(0, index - 150)
      const end = Math.min(message.content.length, index + 350)
      scored.push({
        score: hits.length * 2 + titleHits,
        updatedAt: chat.updatedAt,
        match: {
          chatId: chat.id,
          title: chat.title,
          date: chat.updatedAt.slice(0, 10),
          role: message.role,
          excerpt: `${start > 0 ? "…" : ""}${message.content.slice(start, end).trim()}${end < message.content.length ? "…" : ""}`,
        },
      })
    }
  }

  return scored
    .sort((a, b) => b.score - a.score || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit)
    .map((entry) => entry.match)
}
