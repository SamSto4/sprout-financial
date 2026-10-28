import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { Transaction } from "../finance/transactions.ts"
import {
  addTransactions,
  buildTransactionReview,
  maskAccountNumbers,
  readTransactionScreenshot,
  resolveDate,
  type TransactionScreenshot,
} from "./transaction-rows.ts"

const row = (overrides: Record<string, unknown> = {}) => ({
  year: null,
  month: 10,
  day: 21,
  description: "Trader Joe's",
  amount: 54.2,
  direction: "out",
  category: null,
  pending: false,
  ...overrides,
})

const screenshot = (rows: unknown[]): TransactionScreenshot => readTransactionScreenshot({ problem: "none", transactions: rows })

describe("readTransactionScreenshot", () => {
  it("signs amounts by direction and keeps what the screen showed", () => {
    const result = readTransactionScreenshot({
      problem: "none",
      transactions: [row(), row({ description: "Payroll", amount: 2150, direction: "in", year: 2026, category: "Income" })],
    })
    assert.equal(result.problem, "none")
    assert.deepEqual(result.transactions, [
      { year: null, month: 10, day: 21, description: "Trader Joe's", amount: -54.2, category: null },
      { year: 2026, month: 10, day: 21, description: "Payroll", amount: 2150, category: "Income" },
    ])
  })

  it("leaves out pending rows and counts them", () => {
    const result = screenshot([row(), row({ pending: true })])
    assert.equal(result.transactions.length, 1)
    assert.equal(result.pending, 1)
  })

  it("drops rows with impossible values instead of guessing", () => {
    const result = screenshot([
      row({ month: 13 }),
      row({ day: 0 }),
      row({ amount: 0 }),
      row({ amount: "12.00" }),
      row({ direction: "sideways" }),
      row({ description: "   " }),
      row({ year: 1890 }),
      "not a row",
    ])
    assert.equal(result.transactions.length, 0)
    assert.equal(result.skipped, 8)
  })

  it("treats a negative amount as its size: the direction decides the sign", () => {
    assert.equal(screenshot([row({ amount: -20 })]).transactions[0].amount, -20)
  })

  it("passes a problem through when nothing was read, and ignores one when rows were", () => {
    assert.equal(readTransactionScreenshot({ problem: "not_financial", transactions: [] }).problem, "not_financial")
    assert.equal(readTransactionScreenshot({ problem: "unreadable", transactions: [row()] }).problem, "none")
    assert.equal(readTransactionScreenshot({ problem: "made-up", transactions: [] }).problem, "unreadable")
    assert.equal(readTransactionScreenshot(null).problem, "unreadable")
  })

  it("masks long account and card numbers in descriptions", () => {
    const result = screenshot([row({ description: "Transfer to acct 9988776655" }), row({ description: "Card 4417 2290 8831 0042 refund" })])
    assert.equal(result.transactions[0].description, "Transfer to acct ••••6655")
    assert.equal(result.transactions[1].description, "Card ••••0042 refund")
  })
})

describe("maskAccountNumbers", () => {
  it("leaves short numbers, store numbers and ISO dates alone", () => {
    assert.equal(maskAccountNumbers("Starbucks #12345 on 2026-10-21"), "Starbucks #12345 on 2026-10-21")
  })

  it("masks dashed and spaced numbers of eight digits or more", () => {
    assert.equal(maskAccountNumbers("Acct 1234-5678-9012"), "Acct ••••9012")
  })

  it("writes numbers that are already masked the same way", () => {
    assert.equal(maskAccountNumbers("CASH ADVANCE ACCT ****6655"), "CASH ADVANCE ACCT ••••6655")
    assert.equal(maskAccountNumbers("Transfer to XXXX 6655"), "Transfer to ••••6655")
    assert.equal(maskAccountNumbers("Checking ••4821"), "Checking ••••4821")
    assert.equal(maskAccountNumbers("Exxon 1234 and 3x 2024"), "Exxon 1234 and 3x 2024")
  })
})

describe("resolveDate", () => {
  it("uses the year on screen when there is one", () => {
    assert.deepEqual(resolveDate({ year: 2025, month: 3, day: 4 }, "2026-10-26"), { date: "2025-03-04", yearAssumed: false })
  })

  it("picks the most recent past date when the year isn't shown", () => {
    assert.deepEqual(resolveDate({ year: null, month: 10, day: 21 }, "2026-10-26"), { date: "2026-10-21", yearAssumed: true })
    assert.deepEqual(resolveDate({ year: null, month: 12, day: 30 }, "2027-01-05"), { date: "2026-12-30", yearAssumed: true })
    assert.deepEqual(resolveDate({ year: null, month: 10, day: 26 }, "2026-10-26"), { date: "2026-10-26", yearAssumed: true })
  })

  it("finds the last leap year for 29 February, and refuses impossible days", () => {
    assert.deepEqual(resolveDate({ year: null, month: 2, day: 29 }, "2026-10-26"), { date: "2024-02-29", yearAssumed: true })
    assert.equal(resolveDate({ year: 2026, month: 2, day: 29 }, "2026-10-26"), null)
    assert.equal(resolveDate({ year: null, month: 4, day: 31 }, "2026-10-26"), null)
  })
})

describe("buildTransactionReview", () => {
  const today = "2026-10-26"
  const coffee = row({ description: "Blue Bottle", amount: 6.5 })

  it("keeps two identical purchases in one screenshot, but not their repeat in the next", () => {
    const review = buildTransactionReview([screenshot([coffee, coffee, row()]), screenshot([coffee, coffee, row({ day: 19 })])], [], today)
    assert.equal(review.rows.filter((r) => r.description === "Blue Bottle").length, 2)
    assert.equal(review.rows.length, 4)
    assert.equal(review.duplicates, 2)
  })

  it("adds a third copy when a later screenshot shows one more than before", () => {
    const review = buildTransactionReview([screenshot([coffee]), screenshot([coffee, coffee])], [], today)
    assert.equal(review.rows.filter((r) => r.description === "Blue Bottle").length, 2)
    assert.equal(review.duplicates, 1)
  })

  it("leaves out what's already saved, and flags same-day same-amount rows described differently", () => {
    const saved: Transaction[] = [
      { date: "2026-10-21", description: "Trader Joe's", amount: -54.2 },
      { date: "2026-10-20", description: "UBER *TRIP HELP.UBER.COM", amount: -18.4 },
    ]
    const review = buildTransactionReview([screenshot([row(), row({ day: 20, description: "Uber", amount: 18.4 }), row({ day: 18, description: "Shell", amount: 40 })])], saved, today)
    assert.equal(review.duplicates, 1)
    const uber = review.rows.find((r) => r.description === "Uber")!
    assert.equal(uber.maybeDuplicate, true)
    assert.equal(uber.include, false, "a likely duplicate starts unticked")
    const shell = review.rows.find((r) => r.description === "Shell")!
    assert.equal(shell.include, true)
    assert.equal(shell.date, "2026-10-18")
    assert.equal(shell.yearAssumed, true)
  })

  it("lists rows newest first, with unique ids, and adds up what was left out", () => {
    const first = screenshot([row({ day: 3 }), row({ pending: true }), row({ month: 0 })])
    const review = buildTransactionReview([first, screenshot([row({ day: 9, description: "Rent", amount: 1400 })])], [], today)
    assert.deepEqual(review.rows.map((r) => r.date), ["2026-10-09", "2026-10-03"])
    assert.equal(new Set(review.rows.map((r) => r.id)).size, 2)
    assert.equal(review.pending, 1)
    assert.equal(review.skipped, 1)
  })
})

describe("addTransactions", () => {
  const added: Transaction[] = [{ date: "2026-10-21", description: "Trader Joe's", amount: -54.2 }]

  it("starts a list called Screenshots when nothing was imported", () => {
    const result = addTransactions(null, added, "2026-10-26T10:00:00.000Z")
    assert.equal(result.fileName, "Screenshots")
    assert.equal(result.importedAt, "2026-10-26T10:00:00.000Z")
    assert.deepEqual(result.transactions, added)
  })

  it("adds to an existing import, newest first, and names it once", () => {
    const existing = { fileName: "chase.csv", importedAt: "2026-10-01T00:00:00.000Z", transactions: [{ date: "2026-10-25", description: "Rent", amount: -1400 }, { date: "2026-09-01", description: "Pay", amount: 3000 }] }
    const once = addTransactions(existing, added, "2026-10-26T10:00:00.000Z")
    assert.equal(once.fileName, "chase.csv + screenshots")
    assert.deepEqual(once.transactions.map((t) => t.date), ["2026-10-25", "2026-10-21", "2026-09-01"])
    assert.equal(addTransactions(once, added, "2026-10-27T10:00:00.000Z").fileName, "chase.csv + screenshots")
  })

  it("is stamped later than the import it adds to, even one from a clock running ahead", () => {
    const existing = { fileName: "chase.csv", importedAt: "2026-10-26T12:00:00.000Z", transactions: [] }
    assert.equal(addTransactions(existing, added, "2026-10-26T10:00:00.000Z").importedAt, "2026-10-26T12:00:00.001Z")
  })

  it("checks added rows like any import", () => {
    const result = addTransactions(null, [...added, { date: "21/10/2026", description: "Bad date", amount: -1 }], "2026-10-26T10:00:00.000Z")
    assert.equal(result.transactions.length, 1)
  })
})
