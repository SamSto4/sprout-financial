// How this browser's data and the account's data are combined on sign-in.
// Kept free of framework imports so it can be unit-tested with `node --test`.

import { MAX_SAVED_CHATS, parseChatVersions, type SavedChat } from "../chat/history.ts"
import type { ImportedFinances } from "../finance/transactions.ts"
import type { CourseProgress } from "../learn/progress.ts"

/** Union of both chat lists; when a chat exists in both, the more recently updated copy wins. */
export function mergeChats(local: SavedChat[], remote: SavedChat[]): SavedChat[] {
  const byId = new Map<string, SavedChat>()
  for (const chat of [...remote, ...local]) {
    const existing = byId.get(chat.id)
    if (!existing || chat.updatedAt > existing.updatedAt) byId.set(chat.id, chat)
  }
  return [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, MAX_SAVED_CHATS)
}

/**
 * Chats the server doesn't have, or has an older copy of (by last update), which need uploading.
 * A copy older than the server's is never sent: the server would keep its own anyway (saveChat
 * never replaces a newer copy), so sending it would only waste the upload.
 */
export function chatsToUpload(chats: SavedChat[], serverVersions: Map<string, string>): SavedChat[] {
  return chats.filter((chat) => {
    const server = serverVersions.get(chat.id)
    return server === undefined || chat.updatedAt > server
  })
}

/**
 * What the account holds, as id → last update, for deciding what to upload and delete after
 * sign-in: every chat GET /api/account sent (`loaded`), plus the chats it left out to stay under its
 * size limit (listed in its `chatVersions`) that this browser also has (`local`, after merging).
 * Those are then uploaded only if this browser's copy is newer, and deleted only if they're deleted
 * here. Left-out chats this browser doesn't have are left out of the map, so they're never deleted.
 */
export function serverChatVersions(loaded: SavedChat[], chatVersions: unknown, local: SavedChat[]): Map<string, string> {
  const versions = new Map(loaded.map((chat) => [chat.id, chat.updatedAt]))
  const held = new Set(local.map((chat) => chat.id))
  for (const { id, updatedAt } of parseChatVersions(chatVersions)) {
    if (held.has(id) && !versions.has(id)) versions.set(id, updatedAt)
  }
  return versions
}

/** Lessons finished anywhere count as finished; the best quiz score from either side is kept. */
export function mergeProgress(local: CourseProgress, remote: CourseProgress | null): CourseProgress {
  if (!remote) return local
  const quizScores = { ...remote.quizScores }
  for (const [slug, score] of Object.entries(local.quizScores)) {
    quizScores[slug] = Math.max(score, quizScores[slug] ?? 0)
  }
  return { completed: [...new Set([...remote.completed, ...local.completed])], quizScores }
}

/** The more recently imported file wins. */
export function mergeFinances(local: ImportedFinances | null, remote: ImportedFinances | null) {
  if (!local) return remote
  if (!remote) return local
  return local.importedAt > remote.importedAt ? local : remote
}

/** For the plan and portfolio: whichever copy was saved more recently wins. */
export function mergeNewest<T extends { updatedAt: string }>(local: T | null, remote: T | null): T | null {
  if (!local?.updatedAt) return remote ?? local
  if (!remote?.updatedAt) return local
  return local.updatedAt >= remote.updatedAt ? local : remote
}
