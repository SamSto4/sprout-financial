// A budget month: the range of days one month's plan covers. "November" with a start day of 7 is
// Nov 7 – Dec 6: from the start day to the day before the same day next month. Start days 29–31
// fall on the last day of shorter months. Month keys stay "YYYY-MM"; the start day is stored per
// month (lib/finance/budget-history.ts), so changing it never moves an earlier month's range.
// Pure and tested: dates are "YYYY-MM-DD" strings, worked out in UTC, and nothing reads the clock.

export const DEFAULT_START_DAY = 1
export const MAX_START_DAY = 31

export type BudgetPeriod = {
  /** "YYYY-MM": the month the budget is named after (it starts in this month). */
  month: string
  /** 1 to 31, as chosen (before clamping to shorter months). */
  startDay: number
  /** First and last day, "YYYY-MM-DD", inclusive. */
  start: string
  end: string
  /** Number of days, 28 to 31. */
  days: number
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_MS = 86_400_000
/** Month keys have 4-digit years; a range is never allowed to run past this (dates beyond it can't be formatted). */
const LAST_DATE = "9999-12-31"
const pad = (n: number) => String(n).padStart(2, "0")

/** A whole day of the month, 1 to 31, or null. Strings, fractions and anything else are rejected. */
export function parseStartDay(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_START_DAY ? value : null
}

/** Days in a "YYYY-MM" month (leap-year rule, correct for every 4-digit year). */
export function daysInMonth(month: string): number {
  const [year, monthNumber] = month.split("-").map(Number)
  if (monthNumber === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28
  return [4, 6, 9, 11].includes(monthNumber) ? 30 : 31
}

/** "YYYY-MM-DD" for a day of `month`, clamped to the month (the 31st becomes the 30th in November). */
export function dateFor(month: string, day: number): string {
  const clamped = Math.min(Math.max(1, Math.round(day)), daysInMonth(month))
  return `${month}-${pad(clamped)}`
}

/** The month after "YYYY-MM". December 9999 gives "10000-01", which callers treat as "none". */
function nextMonthKey(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number)
  return monthNumber === 12 ? `${String(year + 1).padStart(4, "0")}-01` : `${month.slice(0, 4)}-${pad(monthNumber + 1)}`
}

function previousMonthKey(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number)
  return monthNumber === 1 ? `${String(year - 1).padStart(4, "0")}-12` : `${month.slice(0, 4)}-${pad(monthNumber - 1)}`
}

/** Milliseconds for a date at UTC midnight. setUTCFullYear, unlike Date.UTC, keeps years 0–99 as written. */
function toTime(date: string): number {
  const [year, month, day] = date.split("-").map(Number)
  const value = new Date(0)
  value.setUTCFullYear(year, month - 1, day)
  return value.getTime()
}

/** `date` moved by `days` (negative goes back), across months, years and leap days. */
export function addDays(date: string, days: number): string {
  const value = new Date(toTime(date) + Math.round(days) * DAY_MS)
  return `${String(value.getUTCFullYear()).padStart(4, "0")}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`
}

/** The range a month's budget covers. An invalid start day is read as the 1st. */
export function budgetPeriod(month: string, startDay: number): BudgetPeriod {
  const day = parseStartDay(startDay) ?? DEFAULT_START_DAY
  const start = dateFor(month, day)
  const next = nextMonthKey(month)
  const end = next.length > 7 ? LAST_DATE : addDays(dateFor(next, day), -1)
  return { month, startDay: day, start, end, days: Math.round((toTime(end) - toTime(start)) / DAY_MS) + 1 }
}

/** True for a real calendar date written "YYYY-MM-DD" ("2026-02-29" is not one). */
export function isRealDate(value: unknown): value is string {
  if (typeof value !== "string") return false
  const match = value.match(DATE_PATTERN)
  if (!match) return false
  const month = Number(match[2])
  const day = Number(match[3])
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(`${match[1]}-${match[2]}`)
}

/** True when `date` is a real date from `period.start` to `period.end`, both included. */
export function isInPeriod(date: unknown, period: BudgetPeriod): date is string {
  // Zero-padded "YYYY-MM-DD" strings compare in date order.
  return isRealDate(date) && date >= period.start && date <= period.end
}

/**
 * Where an entry on day `day` of the month belongs inside `period`: the date in the range with
 * exactly that day of the month; if there is none (a short month), the clamped day (the 31st
 * becomes Feb 28); failing both, the range's last day. Keeps rent "on the 1st" on the 1st.
 */
export function dateForDay(period: BudgetPeriod, day: number): string {
  const wanted = Math.min(MAX_START_DAY, Math.max(1, Math.round(day)))
  const months = [period.month, nextMonthKey(period.month)].filter((month) => month.length === 7)
  const inPeriod = (date: string) => date >= period.start && date <= period.end
  const exact = months
    .filter((month) => wanted <= daysInMonth(month))
    .map((month) => `${month}-${pad(wanted)}`)
    .find(inPeriod)
  return exact ?? months.map((month) => dateFor(month, wanted)).find(inPeriod) ?? period.end
}

/**
 * The budget month that `today` falls in, given each month's start day. That's the newest budget
 * that has started. If its range already ended (a later start day left a gap), it's the coming one.
 * Where two ranges overlap (an earlier start day), the newer month wins.
 */
export function currentBudgetMonth(today: string, startDayFor: (month: string) => number): string {
  const month = today.slice(0, 7)
  if (budgetPeriod(month, startDayFor(month)).start <= today) return month
  const previous = previousMonthKey(month)
  return today <= budgetPeriod(previous, startDayFor(previous)).end ? previous : month
}

/** "YYYY-MM-DD" for a Date in the viewer's local time (like monthKey). */
export function todayKey(date: Date): string {
  return `${String(date.getFullYear()).padStart(4, "0")}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
