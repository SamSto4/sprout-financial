// Shared browser-stored values. Each lives in localStorage on this device only.

import { parseStoredInsights, type StoredInsights } from "@/lib/ai/insights-format"
import { parseSavedChats, type SavedChat } from "@/lib/chat/history"
import { parseSavedBudgets, type SavedBudgets } from "@/lib/finance/budget-history"
import { parseImportedFinances, type ImportedFinances } from "@/lib/finance/transactions"
import { EMPTY_PROGRESS, parseProgress, PROGRESS_KEY, type CourseProgress } from "@/lib/learn/progress"
import { createStoredValue } from "@/lib/local-store"
import { parseProfile, type InvestorProfile } from "@/lib/plan/profile"
import { parsePortfolio, type Portfolio } from "@/lib/portfolio/holdings"

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
