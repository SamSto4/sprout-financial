// Spending trends for the dashboard's AI insights. Everything here is computed in code, so the
// model only explains and prioritises numbers it's given, never calculates them itself.
// Kept free of framework imports so it can be unit-tested with `node --test`.

import { isLikelyTransfer, payeeName, round2, summarizeTransactions, type Transaction } from "./transactions.ts"

// Small changes aren't worth pointing out.
const MIN_NOTABLE_AMOUNT = 20
const SMALL_PURCHASE_LIMIT = 20
const MIN_SMALL_PURCHASES = 6

function monthOf(date: string) {
  return date.slice(0, 7)
}

/**
 * Months that look incomplete: the first month if the data starts after the 5th, and the last
 * month if it ends before the 25th. Comparing a partial month with a full one would mislead.
 */
export function partialMonths(transactions: Transaction[]): Set<string> {
  const partial = new Set<string>()
  if (transactions.length === 0) return partial
  const dates = transactions.map((transaction) => transaction.date).sort()
  const first = dates[0]
  const last = dates[dates.length - 1]
  if (Number(first.slice(8, 10)) > 5) partial.add(monthOf(first))
  if (Number(last.slice(8, 10)) < 25) partial.add(monthOf(last))
  return partial
}

export type SpendingTrends = {
  /** Months treated as complete, oldest first. */
  fullMonths: string[]
  partialMonths: string[]
  /** "category" when the file has categories, otherwise spending is grouped by payee. */
  groupedBy: "category" | "payee"
  /** Total spending, first full month compared with the latest full month. */
  spendingChange: {
    from: string
    to: string
    fromAmount: number
    toAmount: number
    change: number
    changePercent: number | null
  } | null
  /** Groups whose latest full month differs most from their average in earlier full months. */
  biggestChanges: {
    name: string
    latestMonth: number
    earlierAverage: number
    change: number
    changePercent: number | null
  }[]
  /** Same-amount payments seen in most months (bills, rent, subscriptions), with their yearly cost. */
  fixedPayments: { payee: string; monthly: number; yearly: number }[]
  /** Frequent purchases under $20 that add up. */
  smallFrequentPurchases: { payee: string; count: number; total: number; perMonth: number }[]
  highestSpendingMonth: { month: string; spending: number } | null
}

export function analyzeSpending(transactions: Transaction[]): SpendingTrends | null {
  const summary = summarizeTransactions(transactions)
  if (!summary) return null

  const partial = partialMonths(transactions)
  const fullMonths = summary.months.map((month) => month.month).filter((month) => !partial.has(month))
  const spending = transactions.filter((transaction) => transaction.amount < 0 && !isLikelyTransfer(transaction))
  const groupedBy = spending.some((transaction) => transaction.category) ? "category" : "payee"
  const groupOf = (transaction: Transaction) =>
    groupedBy === "category" ? (transaction.category ?? "Uncategorized") : payeeName(transaction.description)

  // Spending per group per month.
  const byGroup = new Map<string, Map<string, number>>()
  for (const transaction of spending) {
    const group = groupOf(transaction)
    const months = byGroup.get(group) ?? new Map<string, number>()
    const month = monthOf(transaction.date)
    months.set(month, (months.get(month) ?? 0) - transaction.amount)
    byGroup.set(group, months)
  }

  const monthTotal = (month: string) => summary.months.find((entry) => entry.month === month)?.spending ?? 0

  let spendingChange: SpendingTrends["spendingChange"] = null
  const biggestChanges: SpendingTrends["biggestChanges"] = []

  if (fullMonths.length >= 2) {
    const from = fullMonths[0]
    const to = fullMonths[fullMonths.length - 1]
    const fromAmount = monthTotal(from)
    const toAmount = monthTotal(to)
    spendingChange = {
      from,
      to,
      fromAmount: round2(fromAmount),
      toAmount: round2(toAmount),
      change: round2(toAmount - fromAmount),
      changePercent: fromAmount > 0 ? Math.round(((toAmount - fromAmount) / fromAmount) * 1000) / 1000 : null,
    }

    const earlier = fullMonths.slice(0, -1)
    for (const [name, months] of byGroup) {
      const latestMonth = months.get(to) ?? 0
      const earlierAverage = earlier.reduce((sum, month) => sum + (months.get(month) ?? 0), 0) / earlier.length
      if (Math.max(latestMonth, earlierAverage) < MIN_NOTABLE_AMOUNT) continue
      const change = latestMonth - earlierAverage
      if (Math.abs(change) < MIN_NOTABLE_AMOUNT) continue
      biggestChanges.push({
        name,
        latestMonth: round2(latestMonth),
        earlierAverage: round2(earlierAverage),
        change: round2(change),
        changePercent: earlierAverage > 0 ? Math.round((change / earlierAverage) * 1000) / 1000 : null,
      })
    }
    biggestChanges.sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
  }

  const small = new Map<string, { count: number; total: number }>()
  for (const transaction of spending) {
    if (-transaction.amount >= SMALL_PURCHASE_LIMIT) continue
    const payee = payeeName(transaction.description)
    const entry = small.get(payee) ?? { count: 0, total: 0 }
    entry.count += 1
    entry.total -= transaction.amount
    small.set(payee, entry)
  }

  const highest = [...summary.months].filter((month) => !partial.has(month.month)).sort((a, b) => b.spending - a.spending)[0]

  return {
    fullMonths,
    partialMonths: [...partial].sort(),
    groupedBy,
    spendingChange,
    biggestChanges: biggestChanges.slice(0, 6),
    fixedPayments: summary.regularPayments
      .filter((payment) => payment.sameAmountEachTime)
      .map((payment) => ({
        payee: payment.payee,
        monthly: payment.typicalAmount,
        yearly: round2(payment.typicalAmount * 12),
      })),
    smallFrequentPurchases: [...small]
      .filter(([, entry]) => entry.count >= MIN_SMALL_PURCHASES)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 5)
      .map(([payee, entry]) => ({
        payee,
        count: entry.count,
        total: round2(entry.total),
        perMonth: round2(entry.total / summary.period.months),
      })),
    highestSpendingMonth: highest ? { month: highest.month, spending: highest.spending } : null,
  }
}
