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

function label(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, MAX_LABEL) : ""
}

function id(value: unknown, fallback: string): string {
  return typeof value === "string" && ID_PATTERN.test(value) ? value : fallback
}

/**
 * Validates a month's schedule from storage, sync or the browser. Entries dated outside the month,
 * or with no usable amount, are dropped; lists are capped. Null when there's nothing to keep.
 */
export function parseSchedule(raw: unknown, month: string): MonthSchedule | null {
  if (typeof raw !== "object" || raw === null) return null
  const record = raw as Record<string, unknown>
  const list = (value: unknown) => (Array.isArray(value) ? value : [])

  const paychecks: Paycheck[] = []
  list(record.paychecks).slice(0, MAX_PAYCHECKS).forEach((item, index) => {
    if (typeof item !== "object" || item === null) return
    const entry = item as Record<string, unknown>
    const value = amount(entry.amount)
    if (value === null || dayInMonth(entry.date, month) === null) return
    paychecks.push({ id: id(entry.id, `p-${index + 1}`), date: entry.date as string, amount: value, label: label(entry.label) })
  })

  const bills: Bill[] = []
  list(record.bills).slice(0, MAX_BILLS).forEach((item, index) => {
    if (typeof item !== "object" || item === null) return
    const entry = item as Record<string, unknown>
    const value = amount(entry.amount)
    if (value === null || dayInMonth(entry.date, month) === null) return
    const category = BUDGET_ITEMS.includes(entry.category as BudgetItem) ? (entry.category as BudgetItem) : "needs"
    bills.push({ id: id(entry.id, `b-${index + 1}`), date: entry.date as string, amount: value, label: label(entry.label), category })
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

export function totalPaychecks(schedule: MonthSchedule | null | undefined): number {
  return Math.round((schedule?.paychecks ?? []).reduce((sum, paycheck) => sum + paycheck.amount, 0) * 100) / 100
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

export type Shortfall = {
  /** The bill that takes the balance below zero. */
  bill: TimelineEvent
  /** How far below zero the balance goes on that day. */
  short: number
  /** The next paycheck after the bill, if there is one this month. */
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
  /** Each time the balance first drops below zero (once per dip). */
  shortfalls: Shortfall[]
}

const cents = (value: number) => Math.round(value * 100) / 100

/**
 * The month day by day. On a day with both, paychecks count first: direct deposits usually arrive
 * by morning, before bills are taken. A shortfall is recorded each time the balance goes from
 * zero or more to below zero, so a dip that lasts several bills is reported once.
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

  for (const event of events) {
    const before = balance
    balance = cents(balance + (event.kind === "paycheck" ? event.amount : -event.amount))
    const entry: TimelineEvent = { ...event, balance }
    timeline.push(entry)
    if (!lowest || balance < lowest.balance) lowest = { balance, date: event.date }
    if (event.kind === "bill" && balance < 0 && before >= 0) shortfalls.push({ bill: entry, short: cents(-balance), nextPaycheck: null })
  }

  // Each shortfall's deepest point before the next paycheck, and that paycheck.
  for (const shortfall of shortfalls) {
    const start = timeline.indexOf(shortfall.bill)
    for (const event of timeline.slice(start + 1)) {
      if (event.kind === "paycheck") {
        shortfall.nextPaycheck = event
        break
      }
      shortfall.short = Math.max(shortfall.short, cents(-event.balance))
    }
  }

  const moneyIn = totalPaychecks(schedule)
  const billsOut = cents(schedule.bills.reduce((sum, bill) => sum + bill.amount, 0))
  return { events: timeline, moneyIn, billsOut, endBalance: cents(schedule.startingBalance + moneyIn - billsOut), lowest, shortfalls }
}
