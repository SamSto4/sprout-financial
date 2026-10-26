// Saved monthly budgets for the dashboard's budget planner: one plan per calendar month, so a
// user's numbers are there every time they come back, and earlier months stay to look back on.
// Pure and tested; the date is always passed in.

import { BUDGET_ITEMS, type BudgetItem } from "./budget.ts"
import { moveSchedule, parseSchedule, totalPaychecks, type MonthSchedule } from "./cash-flow.ts"

/** Monthly amounts for each budget line (lib/finance/budget.ts). */
export type BudgetAmounts = Record<BudgetItem, number>

export type MonthBudget = BudgetAmounts & {
  income: number
  /** Dated paychecks and bills (lib/finance/cash-flow.ts). Absent when none were entered. */
  schedule?: MonthSchedule
  /** When this month's plan was last changed (ISO). */
  updatedAt: string
}

export type SavedBudgets = {
  /** When anything was last changed (ISO), used by account sync. */
  updatedAt: string
  /** Keyed by month, "YYYY-MM". */
  months: Record<string, MonthBudget>
}

export const EMPTY_BUDGETS: SavedBudgets = { updatedAt: "", months: {} }
/** Example numbers shown before anything is saved: 2,300 needs, 1,100 wants, 600 saved and invested. */
export const EXAMPLE_BUDGET = {
  income: 4000,
  needs: 1800,
  groceries: 500,
  recurring: 120,
  wants: 780,
  misc: 200,
  savings: 300,
  investments: 300,
} as const satisfies { income: number } & BudgetAmounts
/** Enough history for three years; older months are dropped. */
export const MAX_SAVED_MONTHS = 36
const MAX_AMOUNT = 10_000_000

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

export function isMonthKey(value: unknown): value is string {
  return typeof value === "string" && MONTH_PATTERN.test(value)
}

/** "YYYY-MM" for a date, in the viewer's local time. */
export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

/** The month `offset` months away from `month` (negative goes back). */
export function shiftMonth(month: string, offset: number): string {
  const [year, monthNumber] = month.split("-").map(Number)
  const index = year * 12 + (monthNumber - 1) + offset
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`
}

const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

export function monthLabel(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number)
  return `${monthNames[monthNumber - 1]} ${year}`
}

function amount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(MAX_AMOUNT, Math.max(0, value)) : null
}

/** `month` ("YYYY-MM") is needed to read the schedule: its dates must fall in that month. */
export function parseMonthBudget(raw: unknown, month?: string): MonthBudget | null {
  if (typeof raw !== "object" || raw === null) return null
  const record = raw as Record<string, unknown>
  const schedule = month && isMonthKey(month) ? parseSchedule(record.schedule, month) : null
  // With paychecks entered, income is always their total, so the two can't disagree.
  const income = schedule && schedule.paychecks.length > 0 ? totalPaychecks(schedule) : amount(record.income)
  // Needs, wants and savings are required (every saved month has them); lines added later
  // (groceries, recurring, misc, investments) count as 0 on months saved before they existed.
  if (income === null || ["needs", "wants", "savings"].some((key) => amount(record[key]) === null)) return null
  const amounts = Object.fromEntries(BUDGET_ITEMS.map((item) => [item, amount(record[item]) ?? 0])) as BudgetAmounts
  return {
    income,
    ...amounts,
    ...(schedule ? { schedule } : {}),
    updatedAt: typeof record.updatedAt === "string" && record.updatedAt.length <= 40 ? record.updatedAt : "",
  }
}

/** Keeps only well-formed months, newest MAX_SAVED_MONTHS of them. */
function trim(months: Record<string, MonthBudget>): Record<string, MonthBudget> {
  const keys = Object.keys(months).sort().slice(-MAX_SAVED_MONTHS)
  return Object.fromEntries(keys.map((key) => [key, months[key]]))
}

export function parseSavedBudgets(raw: unknown): SavedBudgets | null {
  if (typeof raw !== "object" || raw === null) return null
  const record = raw as Record<string, unknown>
  const months: Record<string, MonthBudget> = {}
  if (typeof record.months === "object" && record.months !== null && !Array.isArray(record.months)) {
    for (const [key, value] of Object.entries(record.months as Record<string, unknown>)) {
      const budget = isMonthKey(key) ? parseMonthBudget(value, key) : null
      if (budget) months[key] = budget
    }
  }
  return {
    updatedAt: typeof record.updatedAt === "string" && record.updatedAt.length <= 40 ? record.updatedAt : "",
    months: trim(months),
  }
}

export type BudgetView = BudgetAmounts & {
  income: number
  /**
   * "saved": this month's own plan. "carried": nothing saved for this month yet, so the latest
   * earlier month is shown as a starting point. "example": nothing saved at all.
   */
  source: "saved" | "carried" | "example"
  /** For "carried": the month the numbers come from. */
  fromMonth?: string
  /** Dated paychecks and bills; when carried, moved to the same days of this month. */
  schedule?: MonthSchedule
}

/** What to show for a month. */
export function budgetForMonth(saved: SavedBudgets | null, month: string): BudgetView {
  const months = saved?.months ?? {}
  const own = months[month]
  if (own) return { ...pick(own), source: "saved", ...(own.schedule ? { schedule: own.schedule } : {}) }
  const earlier = Object.keys(months)
    .filter((key) => key < month)
    .sort()
    .at(-1)
  if (earlier) {
    const schedule = months[earlier].schedule
    return { ...pick(months[earlier]), source: "carried", fromMonth: earlier, ...(schedule ? { schedule: moveSchedule(schedule, month) } : {}) }
  }
  return { ...EXAMPLE_BUDGET, source: "example" }
}

function pick(budget: MonthBudget): { income: number } & BudgetAmounts {
  return { income: budget.income, ...(Object.fromEntries(BUDGET_ITEMS.map((item) => [item, budget[item]])) as BudgetAmounts) }
}

/** Saves one month's plan. */
export function saveMonthBudget(
  saved: SavedBudgets | null,
  month: string,
  budget: Pick<MonthBudget, "income" | "schedule"> & Partial<BudgetAmounts>,
  now: Date
): SavedBudgets {
  if (!isMonthKey(month)) return saved ?? EMPTY_BUDGETS
  const stamp = now.toISOString()
  const clean = parseMonthBudget({ ...budget, updatedAt: stamp }, month)
  if (!clean) return saved ?? EMPTY_BUDGETS
  return { updatedAt: stamp, months: trim({ ...(saved?.months ?? {}), [month]: clean }) }
}

/** Removes one month's plan. */
export function clearMonthBudget(saved: SavedBudgets | null, month: string, now: Date): SavedBudgets {
  const months = { ...(saved?.months ?? {}) }
  delete months[month]
  return { updatedAt: now.toISOString(), months }
}

/** Months with a saved plan, newest first. */
export function savedMonths(saved: SavedBudgets | null): string[] {
  return Object.keys(saved?.months ?? {}).sort().reverse()
}

/** For account sync: every month from both sides, the more recently changed copy of each winning. */
export function mergeBudgets(local: SavedBudgets | null, remote: SavedBudgets | null): SavedBudgets | null {
  if (!local) return remote
  if (!remote) return local
  const months: Record<string, MonthBudget> = { ...remote.months }
  for (const [key, budget] of Object.entries(local.months)) {
    const other = months[key]
    if (!other || budget.updatedAt >= other.updatedAt) months[key] = budget
  }
  return {
    updatedAt: local.updatedAt >= remote.updatedAt ? local.updatedAt : remote.updatedAt,
    months: trim(months),
  }
}
