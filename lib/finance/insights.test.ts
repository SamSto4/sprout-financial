import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import { importTransactionsFromCsv } from "./csv.ts"
import { analyzeSpending, partialMonths } from "./insights.ts"
import type { Transaction } from "./transactions.ts"

describe("partialMonths", () => {
  it("flags a late start and an early end", () => {
    const partial = partialMonths([
      { date: "2026-01-12", description: "A", amount: -5 },
      { date: "2026-02-15", description: "B", amount: -5 },
      { date: "2026-03-10", description: "C", amount: -5 },
    ])
    assert.deepEqual([...partial].sort(), ["2026-01", "2026-03"])
  })

  it("treats a file covering whole months as complete", () => {
    assert.equal(
      partialMonths([
        { date: "2026-01-02", description: "A", amount: -5 },
        { date: "2026-02-27", description: "B", amount: -5 },
      ]).size,
      0
    )
  })
})

describe("analyzeSpending", () => {
  const month = (m: string, extra: Transaction[] = []): Transaction[] => [
    { date: `2026-${m}-01`, description: "Payroll", amount: 3000 },
    { date: `2026-${m}-02`, description: "Rent", amount: -1000, category: "Housing" },
    { date: `2026-${m}-03`, description: "Streamflix", amount: -15, category: "Subscriptions" },
    ...extra,
  ]

  it("compares the latest full month with earlier ones", () => {
    const transactions = [
      ...month("01", [{ date: "2026-01-10", description: "Cafe", amount: -100, category: "Dining" }]),
      ...month("02", [{ date: "2026-02-10", description: "Cafe", amount: -100, category: "Dining" }]),
      ...month("03", [
        { date: "2026-03-10", description: "Cafe", amount: -250, category: "Dining" },
        { date: "2026-03-28", description: "Cafe", amount: -50, category: "Dining" },
      ]),
    ]
    const trends = analyzeSpending(transactions)!
    assert.deepEqual(trends.fullMonths, ["2026-01", "2026-02", "2026-03"])
    assert.equal(trends.groupedBy, "category")
    assert.deepEqual(trends.spendingChange, {
      from: "2026-01",
      to: "2026-03",
      fromAmount: 1115,
      toAmount: 1315,
      change: 200,
      changePercent: 0.179,
    })
    assert.deepEqual(trends.biggestChanges, [
      { name: "Dining", latestMonth: 300, earlierAverage: 100, change: 200, changePercent: 2 },
    ])
    assert.deepEqual(trends.fixedPayments.map((s) => [s.payee, s.yearly]), [
      ["Rent", 12000],
      ["Streamflix", 180],
    ])
    assert.equal(trends.highestSpendingMonth?.month, "2026-03")
  })

  it("skips month comparisons without two full months", () => {
    const trends = analyzeSpending(month("01"))!
    assert.equal(trends.spendingChange, null)
    assert.deepEqual(trends.biggestChanges, [])
  })

  it("finds small purchases that add up in the sample file", () => {
    const result = importTransactionsFromCsv(readFileSync("public/sample-transactions.csv", "utf8"))
    assert.ok(result.ok)
    const trends = analyzeSpending(result.transactions)!
    assert.equal(trends.fullMonths.length, 4)
    const coffee = trends.smallFrequentPurchases.find((entry) => entry.payee === "Corner Coffee")
    assert.ok(coffee)
    assert.equal(coffee.count, 24)
    assert.equal(coffee.perMonth, Math.round((coffee.total / 4) * 100) / 100)
  })

  it("returns null without transactions", () => {
    assert.equal(analyzeSpending([]), null)
  })
})
