// Shared browser-stored values. Each lives in localStorage on this device only.

import { parseStoredInsights, type StoredInsights } from "@/lib/ai/insights-format"
import { parseSavedChats, type SavedChat } from "@/lib/chat/history"
import { parseImportedFinances, type ImportedFinances } from "@/lib/finance/transactions"
import { EMPTY_PROGRESS, parseProgress, PROGRESS_KEY, type CourseProgress } from "@/lib/learn/progress"
import { createStoredValue } from "@/lib/local-store"

export const FINANCES_KEY = "sprout-finances"

export const chatsStore = createStoredValue<SavedChat[]>("sprout-chats", parseSavedChats, [])

/** Saves chats, dropping the oldest ones if browser storage is full. */
export function saveChats(chats: SavedChat[]) {
  let kept = chats
  while (!chatsStore.set(kept) && kept.length > 1) kept = kept.slice(0, -1)
}

/** Whether the assistant may look back at past chats. On unless turned off. */
export const memoryStore = createStoredValue<boolean>("sprout-chat-memory", (raw) => raw !== false, true)

export const financesStore = createStoredValue<ImportedFinances | null>(FINANCES_KEY, parseImportedFinances, null)

export const progressStore = createStoredValue<CourseProgress>(
  PROGRESS_KEY,
  (raw) => parseProgress(raw),
  EMPTY_PROGRESS
)

export const insightsStore = createStoredValue<StoredInsights | null>("sprout-insights", parseStoredInsights, null)

/**
 * Whether the Assistant page sends the imported transactions with each question. Off until the
 * user turns it on, imports from the Assistant, or asks it for tips on their finances.
 */
export const shareFinancesStore = createStoredValue<boolean>("sprout-share-finances", (raw) => raw === true, false)

/** Removes the imported file and anything derived from it. */
export function clearFinances() {
  financesStore.set(null)
  insightsStore.set(null)
  shareFinancesStore.set(false)
}

/** Identifies an imported file, so results made from an older import aren't shown for a new one. */
export function financesKey(finances: ImportedFinances) {
  return `${finances.fileName}|${finances.importedAt}|${finances.transactions.length}`
}
