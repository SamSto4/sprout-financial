// Shared browser-stored values. Each lives in localStorage on this device only.
// Relative imports, so lib/stores.test.ts can load it under `node --test`.

import { parseStoredInsights, type StoredInsights } from "./ai/insights-format.ts"
import { parseSavedChats, type SavedChat } from "./chat/history.ts"
import { parseSavedBudgets, type SavedBudgets } from "./finance/budget-history.ts"
import { parseImportedFinances, type ImportedFinances } from "./finance/transactions.ts"
import { EMPTY_PROGRESS, parseProgress, PROGRESS_KEY, type CourseProgress } from "./learn/progress.ts"
import { createStoredValue, isUndecided, readStored, removeStored, writeStored, type StoredValue } from "./local-store.ts"
import {
  EMPTY_PROFILE,
  parseProfile,
  parseSharingReason,
  stampProfile,
  type InvestorProfile,
  type ProfileSource,
  type SharingReason,
} from "./plan/profile.ts"
import { parsePortfolio, type Portfolio } from "./portfolio/holdings.ts"

export { isUndecided }

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

const PROFILE_KEY = "sprout-profile"

/** The investor profile from the My plan page (goals, risk quiz, emergency savings, debts). */
export const profileStore = createStoredValue<InvestorProfile | null>(PROFILE_KEY, parseProfile, null)

/** Holdings from the Portfolio page. */
export const portfolioStore = createStoredValue<Portfolio | null>("sprout-portfolio", parsePortfolio, null)

// The assistant's switches for the plan ("About you") and the portfolio. Per device and never
// synced (AGENTS.md section 8): a new device is undecided until its owner answers there.
const SHARE_PLAN_KEY = "sprout-share-plan"
const SHARE_PORTFOLIO_KEY = "sprout-share-portfolio"
/** Set once the portfolio switch has been split from the plan switch on this device. */
const SHARE_SPLIT_KEY = "sprout-share-split"

/**
 * One-time move to the split switches, run the first time any sharing switch is read or changed on
 * a device, and when sync starts (migrateSharing), before an account's plan is merged in:
 * - The portfolio switch starts with the plan switch's value, so nothing changes for people who
 *   already chose; after that they're separate.
 * - A stored "off" with no plan on the device becomes undecided. Before About you, sign-out cleared
 *   the plan and stored "off", and the next first save turned sharing on whatever the switch said,
 *   so that "off" never meant a choice. Kept, it would hide the banner from the next sign-in.
 */
function splitSharing() {
  if (readStored(SHARE_SPLIT_KEY) !== null) return
  const plan = readStored(SHARE_PLAN_KEY)
  if (plan !== null && readStored(SHARE_PORTFOLIO_KEY) === null) writeStored(SHARE_PORTFOLIO_KEY, plan === true)
  if (plan === false && !parseProfile(readStored(PROFILE_KEY))?.updatedAt) removeStored(SHARE_PLAN_KEY)
  writeStored(SHARE_SPLIT_KEY, true)
}

/** Runs the one-time move to the split switches now (account sync calls it before merging). */
export function migrateSharing() {
  splitSharing()
}

/**
 * Whether answers on this device use About you (the plan, finished lessons and what they want help
 * with): true or false once chosen, null while this device hasn't been asked (a new device, or
 * after sign-out), when the page shows its one-tap banner. Set it to null to forget the choice.
 */
export const sharePlanChoiceStore = createStoredValue<boolean | null>(
  SHARE_PLAN_KEY,
  (raw) => {
    if (raw === false && readStored(SHARE_SPLIT_KEY) === null) {
      splitSharing()
      raw = readStored(SHARE_PLAN_KEY)
    }
    return raw === true ? true : raw === false ? false : null
  },
  null
)

/**
 * Why About you is on or off here (SharingReason): "choice" once the banner or a switch set it,
 * else the source of the save that turned it on, null while undecided or when it was set before
 * this was kept. Sign-in sets a device back to undecided when only a topic or Remember turned it
 * on and the account brings details this browser didn't have (asksAgainAfterMerge in
 * lib/sync/profile-merge.ts). Per device, never synced, forgotten with the choice.
 */
export const sharePlanReasonStore = createStoredValue<SharingReason | null>("sprout-share-plan-reason", parseSharingReason, null)

/**
 * The same switch as a plain on/off: on only when chosen. Turned on by the first save on an
 * undecided device (saveProfile), and switchable in About you. Setting it is a choice (the banner
 * or a switch), and recorded as one.
 */
export const sharePlanStore: StoredValue<boolean> = {
  key: SHARE_PLAN_KEY,
  get: () => sharePlanChoiceStore.get() === true,
  getServer: () => false,
  set(next: boolean) {
    splitSharing()
    sharePlanReasonStore.set("choice")
    return sharePlanChoiceStore.set(next)
  },
  subscribe: (listener: () => void) => sharePlanChoiceStore.subscribe(listener),
}

/** Forgets this device's About you choice and why it was made, so the page asks again (sign-out). */
export function resetPlanSharing() {
  splitSharing()
  sharePlanReasonStore.set(null)
  sharePlanChoiceStore.set(null)
}

/**
 * Whether the assistant gets the holdings from the Portfolio page. Separate from About you, so
 * saving something about yourself never starts sending holdings. Turned on by the Portfolio
 * page's "ask the assistant" buttons, and switchable in the assistant's sidebar.
 */
export const sharePortfolioStore = createStoredValue<boolean>(
  SHARE_PORTFOLIO_KEY,
  (raw) => {
    if (raw !== null) return raw === true
    splitSharing()
    return readStored(SHARE_PORTFOLIO_KEY) === true
  },
  false
)

/** Whether About you includes the lessons finished on this device. On unless "Don't use these". */
export const shareLessonsStore = createStoredValue<boolean>("sprout-share-lessons", (raw) => raw !== false, true)

/**
 * Saves the profile from any page or card: stamps when each changed field was set and where
 * from (stampProfile). If this device hasn't chosen yet and had no plan before this save, it then
 * turns About you on, since saving the first details is a choice to use them; it says so in a
 * receipt. A device that already holds a plan (synced from the account) stays undecided, so the
 * one-tap banner is the only way to start sending it, and an explicit "off" is never overridden.
 * A removal (Clear, Undo) passes `mayTurnOn: false`: taking something away never gives consent.
 * What turned it on is recorded (sharePlanReasonStore), so sign-in can tell a tap from a plan.
 * Returns whether this save turned it on, so the page can say "Answers on this device now use
 * About you".
 */
export function saveProfile(
  next: InvestorProfile,
  via: ProfileSource = "plan",
  at = new Date().toISOString(),
  { mayTurnOn = true }: { mayTurnOn?: boolean } = {}
): { sharingTurnedOn: boolean } {
  splitSharing()
  const previous = profileStore.get()
  profileStore.set(stampProfile(previous, next, via, at))
  // A My plan save while a topic or Remember had turned it on: the person is now sharing a plan
  // they typed here, so it no longer counts as only a tap's consent.
  const reason = sharePlanReasonStore.get()
  if (via === "plan" && sharePlanChoiceStore.get() === true && reason !== null && reason !== "choice") {
    sharePlanReasonStore.set(via)
  }
  if (!mayTurnOn || previous?.updatedAt || !isUndecided(sharePlanChoiceStore)) return { sharingTurnedOn: false }
  sharePlanReasonStore.set(via)
  sharePlanChoiceStore.set(true)
  return { sharingTurnedOn: true }
}

/** Saves some fields on top of the stored profile (or an empty one): a focus chip, a remembered country. */
export function updateProfile(patch: Partial<InvestorProfile>, via: ProfileSource, at?: string) {
  return saveProfile({ ...(profileStore.get() ?? EMPTY_PROFILE), ...patch }, via, at)
}

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
