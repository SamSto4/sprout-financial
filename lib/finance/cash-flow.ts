// Dated paychecks and bills for one month of the budget planner, and the day-by-day running
// balance they add up to. Answers "will I have enough when each bill is due?" for people whose
// pay doesn't land on the same day every month.
// Pure and tested: dates are "YYYY-MM-DD" strings, and nothing reads the clock.

import { BUDGET_ITEMS, type BudgetItem } from "./budget.ts"

export type Paycheck = { id: string; date: string; amount: number; label: string }
export type Bill = { id: string; date: string; amount: number; label: string; category: BudgetItem }

/** The dated part of a month's plan. Absent on months saved before dates existed. */
export type MonthSchedule = {
  /** Cash on hand on the 1st, before anything below comes in or goes out. */
  startingBalance: number
  paychecks: Paycheck[]
  bills: Bill[]
}

export const EMPTY_SCHEDULE: MonthSchedule = { startingBalance: 0, paychecks: [], bills: [] }
export const MAX_PAYCHECKS = 12
export const MAX_BILLS = 40
const MAX_AMOUNT = 10_000_000
const MAX_LABEL = 60
const ID_PATTERN = /^[a-z0-9-]{1,40}$/
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/** Days in a "YYYY-MM" month. */
export function daysInMonth(month: string): number {
  const [year, monthNumber] = month.split("-").map(Number)
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
}

/** The day of the month for a date in `month`, or null when the date is malformed or in another month. */
export function dayInMonth(date: unknown, month: string): number | null {
  if (typeof date !== "string") return null
  const match = date.match(DATE_PATTERN)
  if (!match || `${match[1]}-${match[2]}` !== month) return null
  const day = Number(match[3])
  return day >= 1 && day <= daysInMonth(month) ? day : null
}

export function dateFor(month: string, day: number): string {
  const clamped = Math.min(Math.max(1, Math.round(day)), daysInMonth(month))
  return `${month}-${String(clamped).padStart(2, "0")}`
}

function amount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(Math.min(MAX_AMOUNT, Math.max(0, value)) * 100) / 100 : null
}

/**
 * Cut to length before anything else, so a huge label in a crafted request costs nothing to read.
 * Only leading spaces are dropped: this runs on every keystroke, and trimming the end would eat
 * the space someone just typed ("Car payment" became "Carpayment"). Cuts by character, so an
 * emoji is never split in half.
 */
function label(value: unknown): string {
  if (typeof value !== "string") return ""
  const short = value.slice(0, MAX_LABEL * 4).replace(/\s+/g, " ").trimStart()
  return Array.from(short).slice(0, MAX_LABEL).join("")
}

/** Ids are kept when well-formed and unused; anything else gets a fresh one, so no two entries share an id. */
function uniqueId(value: unknown, prefix: "p" | "b", used: Set<string>): string {
  if (typeof value === "string" && ID_PATTERN.test(value) && !used.has(value)) {
    used.add(value)
    return value
  }
  let n = used.size + 1
  while (used.has(`${prefix}-${n}`)) n++
  used.add(`${prefix}-${n}`)
  return `${prefix}-${n}`
}

/**
 * Validates a month's schedule from storage, sync or the browser. Entries dated outside the month,
 * or with no usable amount, are dropped; lists are capped. Null when there's nothing to keep.
 */
export function parseSchedule(raw: unknown, month: string): MonthSchedule | null {
  if (typeof raw !== "object" || raw === null) return null
  const record = raw as Record<string, unknown>
  const list = (value: unknown) => (Array.isArray(value) ? value : [])
  const used = new Set<string>()

  const paychecks: Paycheck[] = []
  list(record.paychecks).slice(0, MAX_PAYCHECKS).forEach((item) => {
    if (typeof item !== "object" || item === null) return
    const entry = item as Record<string, unknown>
    const value = amount(entry.amount)
    if (value === null || dayInMonth(entry.date, month) === null) return
    paychecks.push({ id: uniqueId(entry.id, "p", used), date: entry.date as string, amount: value, label: label(entry.label) })
  })

  const bills: Bill[] = []
  list(record.bills).slice(0, MAX_BILLS).forEach((item) => {
    if (typeof item !== "object" || item === null) return
    const entry = item as Record<string, unknown>
    const value = amount(entry.amount)
    if (value === null || dayInMonth(entry.date, month) === null) return
    const category = BUDGET_ITEMS.includes(entry.category as BudgetItem) ? (entry.category as BudgetItem) : "needs"
    bills.push({ id: uniqueId(entry.id, "b", used), date: entry.date as string, amount: value, label: label(entry.label), category })
  })

  const startingBalance = amount(record.startingBalance) ?? 0
  if (paychecks.length === 0 && bills.length === 0 && startingBalance === 0) return null
  return { startingBalance, paychecks, bills }
}

/**
 * Moves a schedule to another month, keeping each entry's day of the month (the 31st becomes the
 * last day of a shorter month). Used when a new month starts from the previous month's plan.
 */
export function moveSchedule(schedule: MonthSchedule, toMonth: string): MonthSchedule {
  const move = <T extends { date: string }>(entry: T): T => ({ ...entry, date: dateFor(toMonth, Number(entry.date.slice(8, 10))) })
  return { startingBalance: schedule.startingBalance, paychecks: schedule.paychecks.map(move), bills: schedule.bills.map(move) }
}

/** The month's paychecks added up, capped like any other amount. */
export function totalPaychecks(schedule: MonthSchedule | null | undefined): number {
  const total = (schedule?.paychecks ?? []).reduce((sum, paycheck) => sum + paycheck.amount, 0)
  return Math.min(MAX_AMOUNT, Math.round(total * 100) / 100)
}

export type TimelineEvent = {
  date: string
  kind: "paycheck" | "bill"
  id: string
  label: string
  amount: number
  category?: BudgetItem
  /** Cash left right after this event. */
  balance: number
}

/**
 * A stretch of the month with the balance below zero: from the bill that takes it under, until a
 * paycheck brings it back to zero or more (a paycheck too small to do that doesn't end it).
 */
export type Shortfall = {
  /** The bill that takes the balance below zero. */
  bill: TimelineEvent
  /** Every bill due while the balance is below zero, starting with `bill`. */
  bills: TimelineEvent[]
  /** The deepest the balance goes during the stretch, as a positive amount. */
  short: number
  /** The paycheck that brings the balance back to zero or more; null if none does this month. */
  nextPaycheck: TimelineEvent | null
}

export type CashFlow = {
  events: TimelineEvent[]
  moneyIn: number
  billsOut: number
  /** Starting balance + paychecks − bills. */
  endBalance: number
  /** The lowest the balance goes after any event, and when. Null with no events. */
  lowest: { balance: number; date: string } | null
  /** Each stretch below zero (see Shortfall). */
  shortfalls: Shortfall[]
}

const cents = (value: number) => Math.round(value * 100) / 100

/**
 * The month day by day. On a day with both, paychecks count first: direct deposits usually arrive
 * by morning, before bills are taken.
 */
export function buildCashFlow(schedule: MonthSchedule): CashFlow {
  const events = [
    ...schedule.paychecks.map((paycheck) => ({ date: paycheck.date, kind: "paycheck" as const, id: paycheck.id, label: paycheck.label, amount: paycheck.amount })),
    ...schedule.bills.map((bill) => ({ date: bill.date, kind: "bill" as const, id: bill.id, label: bill.label, amount: bill.amount, category: bill.category })),
  ].sort((a, b) => a.date.localeCompare(b.date) || (a.kind === b.kind ? 0 : a.kind === "paycheck" ? -1 : 1))

  let balance = schedule.startingBalance
  let lowest: CashFlow["lowest"] = null
  const timeline: TimelineEvent[] = []
  const shortfalls: Shortfall[] = []
  let current: Shortfall | null = null

  for (const event of events) {
    balance = cents(balance + (event.kind === "paycheck" ? event.amount : -event.amount))
    const entry: TimelineEvent = { ...event, balance }
    timeline.push(entry)
    if (!lowest || balance < lowest.balance) lowest = { balance, date: event.date }

    if (balance < 0) {
      if (!current && event.kind === "bill") {
        current = { bill: entry, bills: [], short: 0, nextPaycheck: null }
        shortfalls.push(current)
      }
      if (current) {
        if (event.kind === "bill") current.bills.push(entry)
        current.short = Math.max(current.short, cents(-balance))
      }
    } else if (current) {
      // Back to zero or more: this paycheck ends the stretch.
      current.nextPaycheck = entry
      current = null
    }
  }

  const moneyIn = totalPaychecks(schedule)
  const billsOut = cents(schedule.bills.reduce((sum, bill) => sum + bill.amount, 0))
  return { events: timeline, moneyIn, billsOut, endBalance: cents(schedule.startingBalance + moneyIn - billsOut), lowest, shortfalls }
}
