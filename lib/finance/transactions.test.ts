import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { detectColumns, importTransactionsFromCsv, parseAmount, parseCsv, parseDate } from "./csv.ts"
import {
  findTransactions,
  isLikelyTransfer,
  parseTransactionFilter,
  payeeName,
  summarizeTransactions,
  type Transaction,
} from "./transactions.ts"

describe("parseCsv", () => {
  it("handles quoted fields, doubled quotes, CRLF and a byte-order mark", () => {
    const rows = parseCsv('﻿Date,Description,Amount\r\n2026-01-02,"Coffee, ""large""",-4.50\r\n\r\n')
    assert.deepEqual(rows, [
      ["Date", "Description", "Amount"],
      ["2026-01-02", 'Coffee, "large"', "-4.50"],
    ])
  })

  it("detects semicolon-separated files", () => {
    assert.deepEqual(parseCsv("Date;Amount\n01.02.2026;-4,50"), [
      ["Date", "Amount"],
      ["01.02.2026", "-4,50"],
    ])
  })
})

describe("parseAmount", () => {
  it("reads common amount formats", () => {
    assert.equal(parseAmount("-45.10"), -45.1)
    assert.equal(parseAmount("$1,234.56"), 1234.56)
    assert.equal(parseAmount("(45.00)"), -45)
    assert.equal(parseAmount("45.00-"), -45)
    assert.equal(parseAmount("1.234,56"), 1234.56)
    assert.equal(parseAmount("12,50"), 12.5)
    assert.equal(parseAmount("1,234"), 1234)
  })

  it("returns null for cells without a number", () => {
    assert.equal(parseAmount(""), null)
    assert.equal(parseAmount("n/a"), null)
  })
})

describe("parseDate", () => {
  it("reads ISO, US, day-first and written dates", () => {
    assert.equal(parseDate("2026-03-05"), "2026-03-05")
    assert.equal(parseDate("2026-03-05T12:00:00Z"), "2026-03-05")
    assert.equal(parseDate("03/05/2026"), "2026-03-05")
    assert.equal(parseDate("3/5/26"), "2026-03-05")
    assert.equal(parseDate("05/03/2026", "dmy"), "2026-03-05")
    assert.equal(parseDate("Mar 5, 2026"), "2026-03-05")
    assert.equal(parseDate("5 March 2026"), "2026-03-05")
  })

  it("rejects impossible dates", () => {
    assert.equal(parseDate("2026-02-30"), null)
    assert.equal(parseDate("13/13/2026"), null)
    assert.equal(parseDate("yesterday"), null)
  })
})

describe("detectColumns", () => {
  it("prefers debit and credit columns over a loose amount match", () => {
    assert.deepEqual(detectColumns(["Posting Date", "Details", "Debit Amount", "Credit Amount"]), {
      date: 0,
      description: 1,
      debit: 2,
      credit: 3,
    })
  })

  it("returns null when a required column is missing", () => {
    assert.equal(detectColumns(["Date", "Amount"]), null)
  })
})

describe("importTransactionsFromCsv", () => {
  it("imports a signed amount file, newest first", () => {
    const result = importTransactionsFromCsv(
      "Date,Description,Amount,Category\n01/15/2026,Payroll,2500.00,Income\n01/03/2026,Grocer,-82.40,Groceries\n"
    )
    assert.ok(result.ok)
    assert.deepEqual(result.transactions, [
      { date: "2026-01-15", description: "Payroll", amount: 2500, category: "Income" },
      { date: "2026-01-03", description: "Grocer", amount: -82.4, category: "Groceries" },
    ])
    assert.equal(result.columns.category, "Category")
  })

  it("combines debit and credit columns and skips unreadable rows", () => {
    const result = importTransactionsFromCsv(
      "Account: 1234\nDate,Description,Debit,Credit\n2026-02-01,Rent,1200,\n2026-02-02,Refund,,15\nnot a date,Oops,5,\n"
    )
    assert.ok(result.ok)
    assert.deepEqual(
      result.transactions.map((t) => t.amount),
      [15, -1200]
    )
    assert.equal(result.skippedRows, 1)
  })

  it("uses a type column when every amount is positive", () => {
    const result = importTransactionsFromCsv(
      "Date,Description,Amount,Type\n2026-02-01,Cafe,4.5,Debit\n2026-02-02,Salary,900,Credit\n"
    )
    assert.ok(result.ok)
    assert.deepEqual(
      result.transactions.map((t) => t.amount),
      [900, -4.5]
    )
  })

  it("can flip signs for exports that show spending as positive", () => {
    const result = importTransactionsFromCsv("Date,Description,Amount\n2026-02-01,Cafe,4.5\n", { flipSigns: true })
    assert.ok(result.ok)
    assert.equal(result.transactions[0].amount, -4.5)
  })

  it("explains what's wrong with an unusable file", () => {
    const noColumns = importTransactionsFromCsv("foo,bar\n1,2\n")
    assert.equal(noColumns.ok, false)
    const noRows = importTransactionsFromCsv("Date,Description,Amount\n")
    assert.equal(noRows.ok, false)
  })
})

const sample: Transaction[] = [
  { date: "2026-01-01", description: "ACME PAYROLL", amount: 3000 },
  { date: "2026-01-02", description: "Rent", amount: -1200, category: "Housing" },
  { date: "2026-01-05", description: "NETFLIX.COM 866", amount: -15.49, category: "Subscriptions" },
  { date: "2026-01-09", description: "Transfer to Savings", amount: -500 },
  { date: "2026-02-01", description: "ACME PAYROLL", amount: 3000 },
  { date: "2026-02-02", description: "Rent", amount: -1200, category: "Housing" },
  { date: "2026-02-05", description: "NETFLIX.COM 866", amount: -15.49, category: "Subscriptions" },
  { date: "2026-02-14", description: "POS STARBUCKS #1234", amount: -6.25, category: "Dining" },
  { date: "2026-03-01", description: "ACME PAYROLL", amount: 3000 },
  { date: "2026-03-02", description: "Rent", amount: -1200, category: "Housing" },
  { date: "2026-03-05", description: "NETFLIX.COM 999", amount: -15.49, category: "Subscriptions" },
]

describe("summarizeTransactions", () => {
  it("totals income and spending, leaving transfers out", () => {
    const summary = summarizeTransactions(sample)!
    assert.deepEqual(summary.period, { from: "2026-01-01", to: "2026-03-05", months: 3 })
    assert.deepEqual(summary.totals, { income: 9000, spending: 3652.72, net: 5347.28 })
    assert.deepEqual(summary.monthlyAverage, { income: 3000, spending: 1217.57, net: 1782.43 })
    assert.equal(summary.savingsRate, 0.594)
    assert.deepEqual(summary.likelyTransfers, { count: 1, moneyIn: 0, moneyOut: 500 })
  })

  it("finds regular payments and top categories", () => {
    const summary = summarizeTransactions(sample)!
    assert.deepEqual(
      summary.regularPayments.map((p) => [p.payee, p.typicalAmount, p.sameAmountEachTime]),
      [
        ["Rent", 1200, true],
        ["Netflix Com", 15.49, true],
      ]
    )
    assert.equal(summary.topCategories[0].category, "Housing")
    assert.equal(summary.largestExpenses[0].amount, -1200)
  })

  it("returns null for no transactions", () => {
    assert.equal(summarizeTransactions([]), null)
  })
})

describe("transaction helpers", () => {
  it("groups payee variants", () => {
    assert.equal(payeeName("POS STARBUCKS #1234 SEATTLE WA"), "Starbucks Seattle Wa")
    assert.equal(payeeName("SQ *BLUE BOTTLE"), "Blue Bottle")
    assert.equal(payeeName("CITY POWER & LIGHT"), "City Power Light")
  })

  it("spots likely transfers", () => {
    assert.equal(isLikelyTransfer({ date: "2026-01-01", description: "Online Transfer to SAV", amount: -5 }), true)
    assert.equal(isLikelyTransfer({ date: "2026-01-01", description: "PAYMENT - THANK YOU", amount: 50 }), true)
    assert.equal(isLikelyTransfer({ date: "2026-01-01", description: "Groceries", amount: -5 }), false)
  })

  it("validates filters from the model", () => {
    assert.deepEqual(parseTransactionFilter({}), { limit: 25 })
    assert.deepEqual(parseTransactionFilter({ query: " rent ", month: "2026-02", kind: "spending", limit: 500 }), {
      query: "rent",
      month: "2026-02",
      kind: "spending",
      limit: 50,
    })
    assert.equal(parseTransactionFilter({ month: "Feb" }), null)
    assert.equal(parseTransactionFilter({ kind: "all" }), null)
  })

  it("finds matching transactions, newest first", () => {
    const result = findTransactions(sample, { query: "netflix", limit: 2 })
    assert.equal(result.matched, 3)
    assert.equal(result.shown, 2)
    assert.equal(result.netTotal, -46.47)
    assert.equal(result.transactions[0].date, "2026-03-05")
  })
})
