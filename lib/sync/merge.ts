// How this browser's data and the account's data are combined on sign-in.
// Kept free of framework imports so it can be unit-tested with `node --test`.

import { MAX_SAVED_CHATS, type SavedChat } from "../chat/history.ts"
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

/** Chats that differ from what the server has (by last update), which need uploading. */
export function chatsToUpload(chats: SavedChat[], serverVersions: Map<string, string>): SavedChat[] {
  return chats.filter((chat) => serverVersions.get(chat.id) !== chat.updatedAt)
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
