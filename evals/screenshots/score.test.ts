import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { holdingsFromScreenshots, readHoldingsScreenshot } from "../../lib/screenshots/holding-rows.ts"
import { buildTransactionReview, readTransactionScreenshot } from "../../lib/screenshots/transaction-rows.ts"
import { SCREENSHOT_CASES, type ScreenshotCase } from "./cases.ts"
import { SCREENS, TODAY } from "./fixtures.ts"
import { renderMarkdown, sameDescription, scoreCase, summarize, type CaseResult, type Produced } from "./score.ts"

const byId = (id: string) => SCREENSHOT_CASES.find((c) => c.id === id)!

/** What a perfect read of a transactions case looks like, run through the real import rules. */
function perfectTransactions(screenshotCase: ScreenshotCase): Produced {
  if (screenshotCase.kind !== "transactions") throw new Error("not a transactions case")
  const rows = screenshotCase.expect.transactions.map((t) => ({
    year: Number(t.date.slice(0, 4)),
    month: Number(t.date.slice(5, 7)),
    day: Number(t.date.slice(8)),
    description: t.description,
    amount: Math.abs(t.amount),
    direction: t.amount < 0 ? "out" : "in",
    category: null,
    pending: false,
  }))
  const screenshot = readTransactionScreenshot({ problem: screenshotCase.expect.problem, transactions: rows })
  return { kind: "transactions", problem: screenshot.problem, review: buildTransactionReview([screenshot], [], TODAY) }
}

describe("screenshot eval cases", () => {
  it("each have an image drawn from the fixtures, and unique ids", () => {
    const names = new Set(SCREENS.map((screen) => `${screen.name}.jpg`))
    for (const screenshotCase of SCREENSHOT_CASES) assert.ok(names.has(screenshotCase.image), screenshotCase.image)
    assert.equal(new Set(SCREENSHOT_CASES.map((c) => c.id)).size, SCREENSHOT_CASES.length)
  })

  it("score a perfect read as passing, through the real import rules", () => {
    for (const id of ["bank-app-checking", "credit-card-statement", "savings-injection"]) {
      const { checks, rows } = scoreCase(byId(id), perfectTransactions(byId(id)))
      assert.ok(checks.every((check) => check.pass), `${id}: ${JSON.stringify(checks.filter((c) => !c.pass))}`)
      assert.equal(rows.exact, rows.expected)
    }
  })

  it("keeps both identical coffees in the checking answer key", () => {
    const checking = byId("bank-app-checking")
    assert.equal(checking.kind === "transactions" && checking.expect.transactions.filter((t) => t.description === "Blue Bottle Coffee").length, 2)
  })

  it("catches a wrong sign, a made-up row and an unmasked card number", () => {
    const card = byId("credit-card-statement")
    const produced = perfectTransactions(card)
    if (produced.kind !== "transactions") throw new Error()
    produced.review.rows[0].amount = -produced.review.rows[0].amount
    produced.review.rows.push({ ...produced.review.rows[1], id: "x", description: "CARD 4417229088310042", amount: -9999 })
    const { checks, rows } = scoreCase(card, produced)
    assert.equal(rows.wrong, 1)
    assert.equal(rows.invented, 1)
    assert.deepEqual(checks.filter((c) => !c.pass).map((c) => c.label), [
      "Reads every transaction with the right date, amount and sign",
      "Makes up no transactions",
      "Keeps no full number ending 0042",
    ])
  })

  it("scores holdings by symbol, value and type, and checks what was left out", () => {
    const brokerage = byId("brokerage-positions")
    if (brokerage.kind !== "holdings") throw new Error()
    const read = readHoldingsScreenshot({
      problem: "none",
      holdings: [
        { kind: "position", symbol: "VTI", name: "VANGUARD TOTAL STOCK MARKET ETF", shares: 42, price: 273.03, value: 11467.26, security_type: null },
        { kind: "position", symbol: "VXUS", name: "VANGUARD TOTAL INTL STOCK ETF", shares: 60, price: 64.51, value: 3870.6, security_type: null },
        { kind: "position", symbol: "BND", name: "VANGUARD TOTAL BOND MARKET ETF", shares: 25, price: 72.18, value: 1804.5, security_type: null },
        { kind: "position", symbol: "AAPL", name: "APPLE INC", shares: 8, price: 231.4, value: 1851.2, security_type: null },
        { kind: "cash", symbol: "SPAXX**", name: "HELD IN MONEY MARKET", shares: null, price: null, value: 642.18, security_type: null },
        { kind: "pending", symbol: null, name: "Pending activity", shares: null, price: null, value: 150, security_type: null },
        { kind: "total", symbol: null, name: "Account Total", shares: null, price: null, value: 19635.74, security_type: null },
      ],
    })
    const produced: Produced = { kind: "holdings", problem: read.problem, holdings: holdingsFromScreenshots([read]) }
    const { checks, rows } = scoreCase(brokerage, produced)
    assert.ok(checks.every((check) => check.pass), JSON.stringify(checks.filter((c) => !c.pass)))
    assert.equal(rows.exact, 5)
  })

  it("passes a 'not financial' answer only when no rows came back", () => {
    const recipe = byId("recipe-not-financial")
    const empty = readTransactionScreenshot({ problem: "not_financial", transactions: [] })
    assert.ok(scoreCase(recipe, { kind: "transactions", problem: empty.problem, review: buildTransactionReview([empty], [], TODAY) }).checks.every((c) => c.pass))
  })
})

describe("sameDescription", () => {
  it("ignores case and punctuation, and accepts a shortened form", () => {
    assert.ok(sameDescription("Payroll - Acme Corp", "PAYROLL ACME CORP"))
    assert.ok(sameDescription("Trader Joe's", "Trader Joes"))
    assert.ok(sameDescription("CASH ADVANCE ACCT ••••6655", "Cash advance acct ••••6655"))
    assert.ok(!sameDescription("Uber", "Netflix"))
    assert.ok(!sameDescription("", "Netflix"))
  })
})

describe("summarize and renderMarkdown", () => {
  const result = (overrides: Partial<CaseResult>): CaseResult => ({
    id: "a",
    kind: "transactions",
    purpose: "Checks something.",
    run: 1,
    pass: true,
    checks: [],
    rows: { expected: 10, exact: 10, wrong: 0, invented: 0 },
    ms: 3000,
    costUsd: 0.001,
    ...overrides,
  })

  it("adds up rows, times and cost", () => {
    const summary = summarize([result({}), result({ pass: false, rows: { expected: 10, exact: 8, wrong: 1, invented: 2 }, ms: 5000, costUsd: 0.003 })])
    assert.deepEqual(summary.rows, { expected: 20, exact: 18, wrong: 1, invented: 2 })
    assert.equal(summary.passed, 1)
    assert.deepEqual(summary.seconds, { median: 3, p95: 5 })
    assert.ok(Math.abs(summary.costPerScreenshot - 0.002) < 1e-12)
  })

  it("leads with the numbers and lists failures", () => {
    const results = [result({}), result({ run: 2, pass: false, checks: [{ label: "Makes up no transactions", pass: false, detail: "One." }] })]
    const report = renderMarkdown(summarize(results), results, { date: "2026-10-26", model: "m", effort: "low", runs: 2 })
    assert.match(report, /1 screenshots, 2 runs each/)
    assert.match(report, /\| Rows read exactly right \| 100% \(20 of 20\) \|/)
    assert.match(report, /\| `a` \| 1 of 2 \|/)
    assert.match(report, /### `a` \(run 2\)\n\n- \*\*Makes up no transactions\*\*: One\./)
  })
})
