// Transactions imported from a CSV file, and the deterministic summaries the assistant reads.
// The model quotes these numbers instead of doing the arithmetic itself.
// Kept free of framework imports so it can be unit-tested with `node --test`.

import { maskAccountNumbers } from "./mask.ts"

/** One transaction. Positive amounts are money in, negative amounts are money out. */
export type Transaction = {
  date: string // YYYY-MM-DD
  description: string
  amount: number
  category?: string
}

/** What the browser keeps after an import. */
export type ImportedFinances = {
  fileName: string
  importedAt: string
  transactions: Transaction[]
}

export const MAX_TRANSACTIONS = 2000
export const MAX_DESCRIPTION_LENGTH = 120
export const MAX_CATEGORY_LENGTH = 60
const MAX_ABS_AMOUNT = 1_000_000_000

const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

export function round2(value: number) {
  return Math.round(value * 100) / 100
}

/**
 * Reads transactions from untrusted input (a request body or browser storage).
 * Invalid entries are dropped rather than failing the whole list; at most MAX_TRANSACTIONS are kept.
 */
export function parseTransactions(raw: unknown): Transaction[] {
  if (!Array.isArray(raw)) return []

  const transactions: Transaction[] = []
  for (const item of raw) {
    if (transactions.length >= MAX_TRANSACTIONS) break
    if (typeof item !== "object" || item === null) continue

    const { date, description, amount, category } = item as Record<string, unknown>
    if (typeof date !== "string" || !DATE_PATTERN.test(date)) continue
    if (typeof description !== "string") continue
    if (typeof amount !== "number" || !Number.isFinite(amount) || Math.abs(amount) > MAX_ABS_AMOUNT) continue

    // Masked here as well as at import, so copies saved before masking existed (in this browser or
    // the account) are masked the next time they're read or synced.
    const cleanDescription = cleanTransactionText(description, MAX_DESCRIPTION_LENGTH) || "(no description)"
    const cleanCategory = typeof category === "string" ? cleanTransactionText(category, MAX_CATEGORY_LENGTH) : ""

    transactions.push({
      date,
      description: cleanDescription,
      amount: round2(amount),
      ...(cleanCategory ? { category: cleanCategory } : {}),
    })
  }
  return transactions
}

export function parseImportedFinances(raw: unknown): ImportedFinances | null {
  if (typeof raw !== "object" || raw === null) return null
  const { fileName, importedAt, transactions } = raw as Record<string, unknown>
  const parsed = parseTransactions(transactions)
  if (parsed.length === 0) return null
  return {
    fileName: typeof fileName === "string" ? fileName.slice(0, 120) : "transactions.csv",
    // A date like every other synced timestamp: short, so a crafted value can't fill the account.
    importedAt: isTimestamp(importedAt) ? importedAt : new Date(0).toISOString(),
    transactions: parsed,
  }
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length <= 40 && !Number.isNaN(Date.parse(value))
}

function collapse(text: string) {
  return text.replace(/\s+/g, " ").trim()
}

/**
 * A description or category as it's kept: whitespace collapsed, account and card numbers masked
 * to their last four digits, at most `maxLength` characters. The text is cut to twice the limit
 * first, because masking is slow on very long input (this runs on request bodies too).
 */
export function cleanTransactionText(text: string, maxLength: number): string {
  return maskAccountNumbers(collapse(text.slice(0, maxLength * 2))).slice(0, maxLength)
}

// Money moving between the user's own accounts isn't income or spending. These are best guesses.
const TRANSFER_DESCRIPTION =
  /\b(transfer|xfer)\b|payment\s*-?\s*thank\s*you|credit card payment|card payment|autopay payment/i
const TRANSFER_CATEGORY = /transfer|credit card payment/i

export function isLikelyTransfer(transaction: Transaction) {
  return (
    TRANSFER_DESCRIPTION.test(transaction.description) ||
    TRANSFER_CATEGORY.test(transaction.category ?? "")
  )
}

// Card processors and banks prefix descriptions with codes like "POS" or "SQ *".
const DESCRIPTION_PREFIX = /^(pos|purchase|debit|card|checkcard|ach|sq|tst|visa|web|online)\s+/

/** Groups variants like "STARBUCKS #1234 SEATTLE" and "Starbucks #88 Seattle" under one payee. */
export function payeeName(description: string) {
  let key = description
    .toLowerCase()
    .replace(/[^a-z&' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  while (DESCRIPTION_PREFIX.test(key)) key = key.replace(DESCRIPTION_PREFIX, "")
  key = key
    .split(" ")
    .filter((word) => /[a-z]/.test(word))
    .slice(0, 3)
    .join(" ")
  if (!key) return collapse(description) || "(no description)"
  return key.replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
}

function monthOf(date: string) {
  return date.slice(0, 7)
}

/** Every calendar month from the first to the last, inclusive, as YYYY-MM. */
function monthsBetween(first: string, last: string) {
  const months: string[] = []
  let [year, month] = first.split("-").map(Number)
  const [endYear, endMonth] = last.split("-").map(Number)
  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push(`${year}-${String(month).padStart(2, "0")}`)
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
  return months
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export type FinanceSummary = {
  transactionCount: number
  period: { from: string; to: string; months: number }
  /** Spending is reported as a positive number. Likely transfers are excluded. */
  totals: { income: number; spending: number; net: number }
  monthlyAverage: { income: number; spending: number; net: number }
  /** Share of income left over (net / income), or null without income. */
  savingsRate: number | null
  months: { month: string; income: number; spending: number; net: number }[]
  topCategories: { category: string; spending: number; share: number }[]
  topPayees: { payee: string; spending: number; count: number }[]
  /** Payees charged in most months: bills, subscriptions and regular habits. */
  regularPayments: { payee: string; typicalAmount: number; monthsSeen: number; sameAmountEachTime: boolean }[]
  largestExpenses: Transaction[]
  /** 3 and 6 months of average spending: a common emergency fund range. */
  emergencyFund: { threeMonths: number; sixMonths: number }
  likelyTransfers: { count: number; moneyIn: number; moneyOut: number }
  notes: string[]
}

export function summarizeTransactions(transactions: Transaction[]): FinanceSummary | null {
  if (transactions.length === 0) return null

  const dates = transactions.map((t) => t.date).sort()
  const from = dates[0]
  const to = dates[dates.length - 1]
  const calendar = monthsBetween(monthOf(from), monthOf(to))

  const byMonth = new Map(calendar.map((month) => [month, { income: 0, spending: 0 }]))
  const byCategory = new Map<string, number>()
  const byPayee = new Map<string, { spending: number; count: number; amounts: number[]; months: Set<string> }>()
  const transfers = { count: 0, moneyIn: 0, moneyOut: 0 }
  const expenses: Transaction[] = []
  let income = 0
  let spending = 0

  for (const transaction of transactions) {
    if (isLikelyTransfer(transaction)) {
      transfers.count += 1
      if (transaction.amount >= 0) transfers.moneyIn += transaction.amount
      else transfers.moneyOut -= transaction.amount
      continue
    }

    const month = byMonth.get(monthOf(transaction.date))!
    if (transaction.amount >= 0) {
      income += transaction.amount
      month.income += transaction.amount
      continue
    }

    const spent = -transaction.amount
    spending += spent
    month.spending += spent
    expenses.push(transaction)

    if (transaction.category) {
      byCategory.set(transaction.category, (byCategory.get(transaction.category) ?? 0) + spent)
    }

    const payee = payeeName(transaction.description)
    const entry = byPayee.get(payee) ?? { spending: 0, count: 0, amounts: [], months: new Set<string>() }
    entry.spending += spent
    entry.count += 1
    entry.amounts.push(spent)
    entry.months.add(monthOf(transaction.date))
    byPayee.set(payee, entry)
  }

  const monthCount = calendar.length
  const net = income - spending
  // With only one or two months of data, a payee has to show up in each of them.
  const regularThreshold = Math.min(3, monthCount)

  const notes: string[] = []
  if (monthCount > 1) {
    notes.push("The first and last months may be partial, which pulls monthly averages down.")
  } else {
    notes.push("Less than two months of data, so averages may not reflect a typical month.")
  }
  if (transfers.count > 0) {
    notes.push(
      `${transfers.count} transactions look like transfers between accounts or card payments and are left out of income and spending.`
    )
  }
  if (income === 0) {
    notes.push("No income was found. The file may only cover a spending account or credit card.")
  }
  if (byCategory.size === 0) {
    notes.push("The file has no categories, so spending is grouped by payee only.")
  }

  return {
    transactionCount: transactions.length,
    period: { from, to, months: monthCount },
    totals: { income: round2(income), spending: round2(spending), net: round2(net) },
    monthlyAverage: {
      income: round2(income / monthCount),
      spending: round2(spending / monthCount),
      net: round2(net / monthCount),
    },
    savingsRate: income > 0 ? Math.round((net / income) * 1000) / 1000 : null,
    months: calendar.map((month) => {
      const totals = byMonth.get(month)!
      return {
        month,
        income: round2(totals.income),
        spending: round2(totals.spending),
        net: round2(totals.income - totals.spending),
      }
    }),
    topCategories: [...byCategory]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([category, total]) => ({
        category,
        spending: round2(total),
        share: spending > 0 ? Math.round((total / spending) * 1000) / 1000 : 0,
      })),
    topPayees: [...byPayee]
      .sort((a, b) => b[1].spending - a[1].spending)
      .slice(0, 10)
      .map(([payee, entry]) => ({ payee, spending: round2(entry.spending), count: entry.count })),
    regularPayments: monthCount < 2
      ? []
      : [...byPayee]
          .filter(([, entry]) => entry.months.size >= regularThreshold)
          .map(([payee, entry]) => {
            const typical = median(entry.amounts)
            return {
              payee,
              typicalAmount: round2(typical),
              monthsSeen: entry.months.size,
              sameAmountEachTime: entry.amounts.every((amount) => Math.abs(amount - typical) <= typical * 0.05),
            }
          })
          .sort((a, b) => b.typicalAmount - a.typicalAmount)
          .slice(0, 12),
    largestExpenses: [...expenses].sort((a, b) => a.amount - b.amount).slice(0, 5),
    emergencyFund: {
      threeMonths: round2((spending / monthCount) * 3),
      sixMonths: round2((spending / monthCount) * 6),
    },
    likelyTransfers: {
      count: transfers.count,
      moneyIn: round2(transfers.moneyIn),
      moneyOut: round2(transfers.moneyOut),
    },
    notes,
  }
}

export type TransactionFilter = {
  query?: string
  category?: string
  month?: string
  kind?: "income" | "spending"
  limit: number
}

export const MAX_FILTER_RESULTS = 50

/** Validates find_transactions input from the model. Returns null when it's unusable. */
export function parseTransactionFilter(input: unknown): TransactionFilter | null {
  if (typeof input !== "object" || input === null) return { limit: 25 }
  const { query, category, month, kind, limit } = input as Record<string, unknown>

  const filter: TransactionFilter = { limit: 25 }
  if (query !== undefined) {
    if (typeof query !== "string" || query.length > 80) return null
    if (query.trim()) filter.query = query.trim()
  }
  if (category !== undefined) {
    if (typeof category !== "string" || category.length > MAX_CATEGORY_LENGTH) return null
    if (category.trim()) filter.category = category.trim()
  }
  if (month !== undefined) {
    if (typeof month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null
    filter.month = month
  }
  if (kind !== undefined) {
    if (kind !== "income" && kind !== "spending") return null
    filter.kind = kind
  }
  if (limit !== undefined) {
    if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1) return null
    filter.limit = Math.min(limit, MAX_FILTER_RESULTS)
  }
  return filter
}

export function findTransactions(transactions: Transaction[], filter: TransactionFilter) {
  const query = filter.query?.toLowerCase()
  const category = filter.category?.toLowerCase()

  const matches = transactions.filter((transaction) => {
    if (query && !transaction.description.toLowerCase().includes(query)) return false
    if (category && transaction.category?.toLowerCase() !== category) return false
    if (filter.month && monthOf(transaction.date) !== filter.month) return false
    if (filter.kind === "income" && transaction.amount < 0) return false
    if (filter.kind === "spending" && transaction.amount >= 0) return false
    return true
  })

  return {
    matched: matches.length,
    netTotal: round2(matches.reduce((sum, transaction) => sum + transaction.amount, 0)),
    shown: Math.min(matches.length, filter.limit),
    transactions: [...matches].sort((a, b) => b.date.localeCompare(a.date)).slice(0, filter.limit),
  }
}

/** How many months of average spending a savings balance would cover. */
export function monthsCovered(saved: number, monthlySpending: number) {
  if (!(monthlySpending > 0) || !(saved > 0)) return 0
  return Math.round((saved / monthlySpending) * 10) / 10
}
