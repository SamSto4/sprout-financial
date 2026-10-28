// Shared browser-stored values. Each lives in localStorage on this device only.

import { parseStoredInsights, type StoredInsights } from "@/lib/ai/insights-format"
import { parseSavedChats, type SavedChat } from "@/lib/chat/history"
import { parseSavedBudgets, type SavedBudgets } from "@/lib/finance/budget-history"
import { parseImportedFinances, type ImportedFinances } from "@/lib/finance/transactions"
import { EMPTY_PROGRESS, parseProgress, PROGRESS_KEY, setLessonComplete, type CourseProgress } from "@/lib/learn/progress"
import { createStoredValue } from "@/lib/local-store"
import { parseProfile, type InvestorProfile } from "@/lib/plan/profile"
import { parsePortfolio, type Portfolio } from "@/lib/portfolio/holdings"
import {
  parseProgressRemovals,
  recordNotDone,
  recordReset,
  type ProgressRemovals,
} from "@/lib/sync/progress-removals"

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

/**
 * What the person took away from their progress, so account sync can tell that from storage being
 * emptied (lib/sync/progress-removals.ts). Written only by the two helpers below; anything that
 * removes progress must go through them, or the removal won't reach the account.
 */
export const progressRemovalsStore = createStoredValue<ProgressRemovals | null>(
  "sprout-progress-removals",
  parseProgressRemovals,
  null
)

/** "Reset progress": clears every lesson and quiz score, on the account too when signed in. */
export function resetProgress() {
  progressRemovalsStore.set(recordReset(Date.now()))
  progressStore.set(EMPTY_PROGRESS)
}

export function markLessonNotDone(slug: string) {
  progressRemovalsStore.set(recordNotDone(progressRemovalsStore.get(), slug, Date.now()))
  progressStore.set(setLessonComplete(progressStore.get(), slug, false))
}

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

/** The investor profile from the My plan page (goals, risk quiz, emergency savings, debts). */
export const profileStore = createStoredValue<InvestorProfile | null>("sprout-profile", parseProfile, null)

/** Holdings from the Portfolio page. */
export const portfolioStore = createStoredValue<Portfolio | null>("sprout-portfolio", parsePortfolio, null)

/**
 * Whether the assistant gets the plan and portfolio with each question. Turned on when the user
 * saves their plan (they're filling it in to personalize the assistant), and switchable in the
 * assistant's sidebar.
 */
export const sharePlanStore = createStoredValue<boolean>("sprout-share-plan", (raw) => raw === true, false)

/** Monthly budgets from the dashboard's budget planner, one plan per month. */
export const budgetStore = createStoredValue<SavedBudgets | null>("sprout-budgets", parseSavedBudgets, null)

/**
 * A new value whenever this browser's copy of an account's data is cleared (clearLocalCopy in
 * lib/sync/account-sync.ts), seen by every tab. A page holding some of that data in memory, such
 * as the Assistant's open conversation, checks it before saving: anything from before a clear
 * belongs to the account that was cleared, and saving it would put it back with no owner tag
 * (lib/chat/open-chat.ts). Not a secret, and not synced.
 */
export const copyClearedStore = createStoredValue<string | null>(
  "sprout-copy-cleared",
  (raw) => (typeof raw === "string" && raw.length <= 64 ? raw : null),
  null
)
