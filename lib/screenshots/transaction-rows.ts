// Transactions read from a screenshot of a bank or card app: the JSON shape Claude must return,
// the checks on what comes back, and the rules that turn it into transactions the dashboard can
// add (dates, signs, duplicates). The model only transcribes; every decision here is code.
// Pure and tested with `node --test`.

import {
  MAX_CATEGORY_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  parseTransactions,
  round2,
  type ImportedFinances,
  type Transaction,
} from "../finance/transactions.ts"
import { maskAccountNumbers } from "../finance/mask.ts"
import { SCREENSHOT_PROBLEMS, type ScreenshotProblem } from "./image.ts"

// Shared with the CSV import (lib/finance/mask.ts); re-exported for holding-rows.ts and the tests.
export { maskAccountNumbers }

/** More than any one screen of a statement holds; anything past it is ignored. */
export const MAX_ROWS_PER_SCREENSHOT = 150
const MAX_ABS_AMOUNT = 1_000_000_000

const nullable = (type: "integer" | "string") => ({ anyOf: [{ type }, { type: "null" }] })

/** JSON schema for structured output. There is no field for an account number, so none comes back. */
export const TRANSACTION_SCREENSHOT_SCHEMA = {
  type: "object",
  properties: {
    problem: {
      type: "string",
      enum: [...SCREENSHOT_PROBLEMS],
      description:
        "none: it shows transactions. not_financial: it isn't a bank, card or budgeting screen. wrong_kind: it's financial but shows investment holdings or balances, not transactions. unreadable: too blurry, small or cut off to read.",
    },
    transactions: {
      type: "array",
      description: "Every transaction visible, top to bottom. Empty when problem isn't none.",
      items: {
        type: "object",
        properties: {
          year: { ...nullable("integer"), description: "The year if the screen shows it for this row (or in a header above it); otherwise null. Never guess." },
          month: { type: "integer", description: "1 to 12." },
          day: { type: "integer", description: "1 to 31." },
          description: { type: "string", description: "The merchant or description as shown." },
          amount: { type: "number", description: "The amount as a positive number, without currency symbols." },
          direction: {
            type: "string",
            enum: ["in", "out"],
            description: "out: money leaving the account (purchases, bills, withdrawals, fees). in: money arriving (pay, refunds, deposits). On a credit card, purchases are out and payments to the card are in.",
          },
          category: { ...nullable("string"), description: "A category only if the screen shows one for this row; otherwise null." },
          pending: { type: "boolean", description: "True if the row is marked pending or not yet posted." },
        },
        required: ["year", "month", "day", "description", "amount", "direction", "category", "pending"],
        additionalProperties: false,
      },
    },
  },
  required: ["problem", "transactions"],
  additionalProperties: false,
}

/** One transaction as read from a screenshot, checked, before its date is settled. */
export type ScreenshotTransaction = {
  year: number | null
  month: number
  day: number
  description: string
  /** Signed: negative for money out, as everywhere else in the app. */
  amount: number
  category: string | null
}

export type TransactionScreenshot = {
  problem: ScreenshotProblem
  transactions: ScreenshotTransaction[]
  /** Pending rows, left out because their amount can still change. */
  pending: number
  /** Rows that weren't usable (no date, no amount, impossible values). */
  skipped: number
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? maskAccountNumbers(value.replace(/\s+/g, " ").trim()).slice(0, maxLength) : ""
}

const isWhole = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max

/** Checks the model's answer for one screenshot. Never throws; anything malformed is dropped. */
export function readTransactionScreenshot(raw: unknown): TransactionScreenshot {
  const empty: TransactionScreenshot = { problem: "unreadable", transactions: [], pending: 0, skipped: 0 }
  if (typeof raw !== "object" || raw === null) return empty
  const { problem, transactions } = raw as Record<string, unknown>
  const result: TransactionScreenshot = {
    problem: (SCREENSHOT_PROBLEMS as readonly unknown[]).includes(problem) ? (problem as ScreenshotProblem) : "unreadable",
    transactions: [],
    pending: 0,
    skipped: 0,
  }
  if (!Array.isArray(transactions)) return result

  for (const item of transactions.slice(0, MAX_ROWS_PER_SCREENSHOT)) {
    const row = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>
    if (row.pending === true) {
      result.pending++
      continue
    }
    const description = cleanText(row.description, MAX_DESCRIPTION_LENGTH)
    const amount = typeof row.amount === "number" ? Math.abs(row.amount) : Number.NaN
    if (
      !isWhole(row.month, 1, 12) ||
      !isWhole(row.day, 1, 31) ||
      !(row.year === null || isWhole(row.year, 1990, 2100)) ||
      !(amount > 0 && amount <= MAX_ABS_AMOUNT) ||
      (row.direction !== "in" && row.direction !== "out") ||
      !description
    ) {
      result.skipped++
      continue
    }
    result.transactions.push({
      year: row.year as number | null,
      month: row.month,
      day: row.day,
      description,
      amount: row.direction === "out" ? -round2(amount) : round2(amount),
      category: cleanText(row.category, MAX_CATEGORY_LENGTH) || null,
    })
  }
  // A screenshot the model calls a problem, but that still yielded rows, is worth showing.
  if (result.transactions.length > 0) result.problem = "none"
  return result
}

function isoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCMonth() !== month - 1) return null // 31 April, 29 February in a common year
  return date.toISOString().slice(0, 10)
}

/**
 * The full date for a row. Without a year on screen, it's the most recent such day that isn't
 * after today: a screenshot of recent activity shows the past, so "Dec 30" seen on 5 January is
 * last year's. `today` is YYYY-MM-DD in the user's own time zone.
 */
export function resolveDate(row: Pick<ScreenshotTransaction, "year" | "month" | "day">, today: string): { date: string; yearAssumed: boolean } | null {
  if (row.year !== null) {
    const date = isoDate(row.year, row.month, row.day)
    return date ? { date, yearAssumed: false } : null
  }
  const thisYear = Number(today.slice(0, 4))
  for (let year = thisYear; year >= thisYear - 4; year--) {
    const date = isoDate(year, row.month, row.day)
    if (date && date <= today) return { date, yearAssumed: true }
  }
  return null
}

/** A row in the review table: the user can untick it or correct it before anything is saved. */
export type ReviewTransaction = Transaction & {
  id: string
  yearAssumed: boolean
  /** Same day and amount as a transaction already saved, but described differently. */
  maybeDuplicate: boolean
  include: boolean
}

export type TransactionReview = {
  rows: ReviewTransaction[]
  /** Exact repeats, of a saved transaction or of a row in another screenshot, left out. */
  duplicates: number
  pending: number
  skipped: number
}

/** The same transaction written the same way: day, amount to the cent, and description letters. */
function exactKey(transaction: Transaction) {
  return `${transaction.date}|${Math.round(transaction.amount * 100)}|${transaction.description.toLowerCase().replace(/[^a-z0-9]/g, "")}`
}
const dayAndAmount = (transaction: Transaction) => `${transaction.date}|${Math.round(transaction.amount * 100)}`

/**
 * Builds the review table from several screenshots. Screenshots of a scrolling list overlap, so a
 * row counts as new only beyond the copies already seen: two identical coffees in one screenshot
 * are two coffees, but the same two showing again in the next screenshot are the same two.
 */
export function buildTransactionReview(screenshots: TransactionScreenshot[], existing: Transaction[], today: string): TransactionReview {
  const seen = new Map<string, number>()
  const count = (key: string) => seen.set(key, (seen.get(key) ?? 0) + 1)
  existing.forEach((transaction) => count(exactKey(transaction)))
  const savedDayAndAmount = new Set(existing.map(dayAndAmount))

  const review: TransactionReview = { rows: [], duplicates: 0, pending: 0, skipped: 0 }
  screenshots.forEach((screenshot, index) => {
    review.pending += screenshot.pending
    review.skipped += screenshot.skipped
    // Copies available to match in this screenshot: everything saved or in earlier screenshots.
    const available = new Map(seen)
    screenshot.transactions.forEach((row, rowIndex) => {
      const resolved = resolveDate(row, today)
      if (!resolved) {
        review.skipped++
        return
      }
      const transaction: Transaction = {
        date: resolved.date,
        description: row.description,
        amount: row.amount,
        ...(row.category ? { category: row.category } : {}),
      }
      const key = exactKey(transaction)
      const left = available.get(key) ?? 0
      if (left > 0) {
        available.set(key, left - 1)
        review.duplicates++
        return
      }
      count(key)
      const maybeDuplicate = savedDayAndAmount.has(dayAndAmount(transaction))
      review.rows.push({ ...transaction, id: `${index}-${rowIndex}`, yearAssumed: resolved.yearAssumed, maybeDuplicate, include: !maybeDuplicate })
    })
  })
  review.rows.sort((a, b) => b.date.localeCompare(a.date))
  return review
}

// How the dashboard names the data: "Screenshots" alone, or "chase.csv + screenshots".
const SCREENSHOT_LABEL = "Screenshots"
const SCREENSHOT_SUFFIX = " + screenshots"

/**
 * Adds reviewed transactions to what's saved. Checked by parseTransactions like any import, after
 * sorting newest first, so its cap keeps the most recent. A new importedAt means an old AI review
 * isn't shown for the changed data.
 */
export function addTransactions(existing: ImportedFinances | null, added: Transaction[], now: string): ImportedFinances {
  const transactions = parseTransactions([...(existing?.transactions ?? []), ...parseTransactions(added)].sort((a, b) => b.date.localeCompare(a.date)))
  const name = existing?.fileName
  const fileName = !name ? SCREENSHOT_LABEL : name === SCREENSHOT_LABEL || name.endsWith(SCREENSHOT_SUFFIX) ? name : `${name.slice(0, 100)}${SCREENSHOT_SUFFIX}`
  return { fileName, importedAt: now, transactions }
}
