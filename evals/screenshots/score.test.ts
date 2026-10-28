import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { holdingsFromScreenshots, readHoldingsScreenshot } from "../../lib/screenshots/holding-rows.ts"
import { fitScreenshot } from "../../lib/screenshots/image.ts"
import { buildTransactionReview, readTransactionScreenshot } from "../../lib/screenshots/transaction-rows.ts"
import { SCREENSHOT_CASES, type ScreenshotCase } from "./cases.ts"
import {
  BANNER,
  BROKERAGE,
  capturedSize,
  COST_BASIS,
  CUT_OFF,
  DENSE,
  EQUITY_APP,
  EXTRA_TALL,
  LEDGER,
  LONG_SCROLL,
  marketValue,
  MONTH_CAPTURE,
  PARTIAL_LIST,
  PLAN_401K,
  RETIREMENT,
  runningBalances,
  SCREENS,
  TODAY,
  TRADING_APP,
  UK,
  WIDE_DESKTOP,
} from "./fixtures.ts"
import {
  describeProduced,
  emptyRows,
  renderMarkdown,
  sameDescription,
  scoreCase,
  similarDescription,
  summarize,
  warnsTotal,
  type CaseResult,
  type Produced,
} from "./score.ts"

const byId = (id: string) => {
  const found = SCREENSHOT_CASES.find((c) => c.id === id)
  if (!found) throw new Error(`no case ${id}`)
  return found
}

type RawTransaction = { year: number | null; month: number; day: number; description: string; amount: number; direction: "in" | "out"; category: null; pending: boolean }

const raw = (t: { date: string; description: string; amount: number }, pending = false): RawTransaction => ({
  year: Number(t.date.slice(0, 4)),
  month: Number(t.date.slice(5, 7)),
  day: Number(t.date.slice(8)),
  description: t.description,
  amount: Math.abs(t.amount),
  direction: t.amount < 0 ? "out" : "in",
  category: null,
  pending,
})

/** What the model would return for a perfect read of a transactions case: pending rows marked, cut-off rows left out. */
function perfectRawTransactions(screenshotCase: ScreenshotCase) {
  if (screenshotCase.kind !== "transactions") throw new Error("not a transactions case")
  const pending = (screenshotCase.expect.leftOut ?? []).filter((row) => row.why === "pending").map((row) => raw({ date: TODAY, ...row }, true))
  return { problem: screenshotCase.expect.problem, transactions: [...screenshotCase.expect.transactions.map((t) => raw(t)), ...pending] }
}

function transactionsProduced(model: { problem: string; transactions: RawTransaction[] }): Produced {
  const screenshot = readTransactionScreenshot(model)
  return { kind: "transactions", problem: screenshot.problem, review: buildTransactionReview([screenshot], [], TODAY) }
}

type RawHolding = {
  kind: "position" | "cash" | "total" | "pending"
  symbol: string | null
  name: string
  shares: number | null
  price: number | null
  value: number | null
  security_type: string | null
}
const total = (value: number, name = "Total"): RawHolding => ({ kind: "total", symbol: null, name, shares: null, price: null, value, security_type: null })
const sum = (values: number[]) => Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100
const position = (symbol: string | null, name: string, shares: number | null, price: number | null, value: number | null, type: string | null = null): RawHolding => ({
  kind: "position",
  symbol,
  name,
  shares,
  price,
  value,
  security_type: type,
})

/** What the model would return for a perfect read of each holdings screen, from the fixtures. */
const PERFECT_HOLDINGS: Record<string, { problem: string; holdings: RawHolding[] }> = {
  "brokerage-positions": {
    problem: "none",
    holdings: [
      ...BROKERAGE.positions.map(([symbol, name, shares, price, value]) => position(symbol, name, shares, price, value)),
      { kind: "cash", symbol: BROKERAGE.cash.symbol, name: BROKERAGE.cash.name, shares: null, price: null, value: BROKERAGE.cash.value, security_type: null },
      { kind: "pending", symbol: null, name: "Pending activity", shares: null, price: null, value: BROKERAGE.pending, security_type: null },
      { kind: "total", symbol: null, name: "Account Total", shares: null, price: null, value: BROKERAGE.total, security_type: null },
    ],
  },
  "retirement-app": { problem: "none", holdings: RETIREMENT.funds.map((f) => position(f.symbol, f.name, f.shares, null, f.value)) },
  "transactions-as-holdings": { problem: "wrong_kind", holdings: [] },
  "positions-cost-basis": {
    problem: "none",
    holdings: [
      ...COST_BASIS.positions.map((p) => position(p.symbol, p.name, p.shares, p.price, marketValue(p))),
      { kind: "cash", symbol: null, name: COST_BASIS.cash.name, shares: null, price: null, value: COST_BASIS.cash.value, security_type: null },
      { kind: "total", symbol: null, name: "Account Total", shares: null, price: null, value: 24013.36, security_type: null },
    ],
  },
  "401k-names-only": { problem: "none", holdings: PLAN_401K.funds.map((f) => position(null, f.name, null, null, f.value)) },
  "trading-app-crypto": {
    problem: "none",
    holdings: [
      ...TRADING_APP.stocks.map((s) => position(s.symbol, "", s.shares, s.price, null, "Stock")),
      ...TRADING_APP.crypto.map((c) => position(c.symbol, c.name, c.quantity, null, c.value, "Crypto")),
      { kind: "cash", symbol: null, name: "Brokerage cash", shares: null, price: null, value: TRADING_APP.cash, security_type: null },
    ],
  },
  "trading-app-equity": {
    problem: "none",
    holdings: [
      total(sum([...EQUITY_APP.stocks, ...EQUITY_APP.etfs, ...EQUITY_APP.crypto].map((h) => h.value).concat(EQUITY_APP.cash)), "Investing"),
      ...EQUITY_APP.stocks.map((s) => position(s.symbol, "", s.shares, null, s.value, "Stocks")),
      ...EQUITY_APP.etfs.map((e) => position(e.symbol, "", e.shares, null, e.value, "ETFs")),
      ...EQUITY_APP.crypto.map((c) => position(c.symbol, c.name, c.quantity, null, c.value, "Crypto")),
      { kind: "cash", symbol: null, name: "Brokerage cash", shares: null, price: null, value: EQUITY_APP.cash, security_type: null },
    ],
  },
  "partial-holdings-list": {
    problem: "none",
    holdings: [total(PARTIAL_LIST.total, "Total value"), ...PARTIAL_LIST.visible.map((h) => position(h.symbol, h.name, h.shares, null, h.value))],
  },
  "positions-4k-desktop": {
    problem: "none",
    holdings: [
      ...WIDE_DESKTOP.positions.map((p) => position(p.symbol, p.name, p.shares, p.price, marketValue(p))),
      { kind: "cash", symbol: null, name: WIDE_DESKTOP.cash.name, shares: null, price: null, value: WIDE_DESKTOP.cash.value, security_type: null },
      total(sum(WIDE_DESKTOP.positions.map(marketValue).concat(WIDE_DESKTOP.cash.value)), "Account Total"),
    ],
  },
}

function holdingsProduced(model: { problem: string; holdings: RawHolding[] }): Produced {
  const read = readHoldingsScreenshot(model)
  return { kind: "holdings", problem: read.problem, holdings: holdingsFromScreenshots([read]), rows: read.rows }
}

function perfect(screenshotCase: ScreenshotCase): Produced {
  if (screenshotCase.kind === "transactions") return transactionsProduced(perfectRawTransactions(screenshotCase))
  const model = PERFECT_HOLDINGS[screenshotCase.id]
  if (!model) throw new Error(`No perfect read written for ${screenshotCase.id}`)
  return holdingsProduced(structuredClone(model))
}

const failing = (checks: { label: string; pass: boolean }[]) => checks.filter((c) => !c.pass).map((c) => c.label)

describe("screenshot eval cases", () => {
  it("each have an image drawn from the fixtures, and unique ids", () => {
    const names = new Set(SCREENS.map((screen) => `${screen.name}.jpg`))
    for (const screenshotCase of SCREENSHOT_CASES) assert.ok(names.has(screenshotCase.image), screenshotCase.image)
    assert.equal(new Set(SCREENSHOT_CASES.map((c) => c.id)).size, SCREENSHOT_CASES.length)
    assert.equal(new Set(SCREENS.map((s) => s.name)).size, SCREENS.length)
  })

  it("score a perfect read as passing, through the real import rules, for every case", () => {
    for (const screenshotCase of SCREENSHOT_CASES) {
      const { checks, rows } = scoreCase(screenshotCase, perfect(screenshotCase))
      assert.deepEqual(failing(checks), [], screenshotCase.id)
      assert.equal(rows.exact, rows.expected, screenshotCase.id)
      assert.deepEqual({ ...rows, exact: 0, expected: 0 }, emptyRows(), screenshotCase.id)
    }
  })

  it("warns that a perfect read doesn't add up only for the screen showing part of a list", () => {
    const warned = SCREENSHOT_CASES.filter((c) => c.kind === "holdings")
      .filter((c) => {
        const produced = perfect(c)
        return produced.kind === "holdings" && warnsTotal(produced)
      })
      .map((c) => c.id)
    assert.deepEqual(warned, ["partial-holdings-list"])
  })

  it("fails the equity screen, and warns, when a position's equity is taken for its share price", () => {
    const equity = byId("trading-app-equity")
    const model = structuredClone(PERFECT_HOLDINGS["trading-app-equity"])
    for (const row of model.holdings) {
      if (row.kind === "position" && row.symbol === "AMZN") [row.price, row.value] = [row.value, null]
    }
    const produced = holdingsProduced(model)
    assert.ok(produced.kind === "holdings" && warnsTotal(produced))
    const { checks, rows } = scoreCase(equity, produced)
    assert.deepEqual(failing(checks), ["Reads every holding with the right value and type"])
    assert.equal(rows.fields.value, 1)
  })

  it("keeps both identical coffees in the checking answer key", () => {
    const checking = byId("bank-app-checking")
    assert.equal(checking.kind === "transactions" && checking.expect.transactions.filter((t) => t.description === "Blue Bottle Coffee").length, 2)
  })

  it("passes a 'not financial' answer only when no rows came back", () => {
    const recipe = byId("recipe-not-financial")
    assert.deepEqual(failing(scoreCase(recipe, transactionsProduced({ problem: "not_financial", transactions: [] })).checks), [])
    const withRow = transactionsProduced({ problem: "not_financial", transactions: [raw({ date: "2026-10-01", description: "Bananas", amount: -3 })] })
    assert.ok(failing(scoreCase(recipe, withRow).checks).length > 0)
  })
})

describe("scoreCase counts each kind of error", () => {
  it("a wrong date, amount, direction and description, a missed row and a made-up row", () => {
    const uk = byId("uk-bank-day-first")
    const model = perfectRawTransactions(uk)
    const row = (description: string) => model.transactions.find((t) => t.description === description)!
    // 07/10/2026 read the US way, as 10 July.
    Object.assign(row("PRET A MANGER"), { month: 7, day: 10 })
    row("TESCO STORES 3341").amount = 48.26
    row("J SMITH DINNER").direction = "out"
    row("THAMES WATER").description = "THAMES WAT3R CO"
    model.transactions.splice(model.transactions.indexOf(row("AMAZON.CO.UK")), 1)
    model.transactions.push(raw({ date: "2026-09-23", description: "Opening balance", amount: UK.opening }))

    const { checks, rows } = scoreCase(uk, transactionsProduced(model))
    assert.deepEqual(rows, {
      expected: 10,
      exact: 5,
      wrong: 4,
      missed: 1,
      invented: 1,
      keptLeftOut: 0,
      fields: { date: 1, amount: 1, direction: 1, description: 1, symbol: 0, value: 0, type: 0 },
    })
    assert.deepEqual(failing(checks), ["Reads every transaction with the right date, amount and sign", "Makes up no transactions"])
    assert.match(checks[1].detail, /PRET A MANGER: date wrong \(got 2026-07-10/)
  })

  it("a row with two fields wrong counts once for each", () => {
    const dark = byId("dark-mode-bank")
    const model = perfectRawTransactions(dark)
    // Read as money out, and a digit wrong.
    Object.assign(model.transactions.find((t) => t.description === "Zelle from Maria Lopez")!, { direction: "out", amount: 66 })
    const { rows } = scoreCase(dark, transactionsProduced(model))
    assert.equal(rows.wrong, 1)
    assert.deepEqual([rows.fields.amount, rows.fields.direction], [1, 1])
  })

  it("pairs a row misread in two places by a near spelling, rather than calling it made up", () => {
    const tall = byId("extra-tall-capture")
    if (tall.kind !== "transactions") throw new Error()
    const model = perfectRawTransactions(tall)
    const target = model.transactions.find((t) => t.description === "Trader Joe's")!
    Object.assign(target, { description: "Tracer Joe's", amount: target.amount + 0.2 })
    const { rows } = scoreCase(tall, transactionsProduced(model))
    assert.deepEqual([rows.wrong, rows.missed, rows.invented], [1, 0, 0])
    assert.deepEqual([rows.fields.amount, rows.fields.description], [1, 1])
  })

  it("never lets a near match take a row another expected row matches exactly", () => {
    const card = byId("travel-card-foreign-currency")
    const model = perfectRawTransactions(card)
    // The fee reversal read as money out: one direction error, and the fee itself still exact.
    model.transactions.find((t) => t.description === "Foreign transaction fee reversal")!.direction = "out"
    const { rows } = scoreCase(card, transactionsProduced(model))
    assert.equal(rows.exact, rows.expected - 1)
    assert.equal(rows.fields.direction, 1)
  })

  it("pending and cut-off rows kept are counted as such, not as made up", () => {
    const card = byId("travel-card-foreign-currency")
    const model = perfectRawTransactions(card)
    for (const t of model.transactions) t.pending = false
    const pending = scoreCase(card, transactionsProduced(model))
    assert.equal(pending.rows.keptLeftOut, 3)
    assert.equal(pending.rows.invented, 0)
    assert.deepEqual(failing(pending.checks), ["Leaves out the pending rows"])

    const cut = byId("cut-off-rows")
    const cutModel = perfectRawTransactions(cut)
    // The bottom row's amount guessed from its top half, with no date on screen.
    cutModel.transactions.push(raw({ date: "2026-10-16", description: CUT_OFF.bottom.description, amount: -46.3 }))
    const cutResult = scoreCase(cut, transactionsProduced(cutModel))
    assert.equal(cutResult.rows.keptLeftOut, 1)
    assert.deepEqual(failing(cutResult.checks), ["Leaves out the cut off rows"])
  })

  it("an amount from a notification banner fails the banner check", () => {
    const banner = byId("notification-banner")
    const model = perfectRawTransactions(banner)
    model.transactions.push(raw({ date: "2026-10-26", description: "Alex Kim paid you", amount: BANNER.notificationAmount }))
    const { checks, rows } = scoreCase(banner, transactionsProduced(model))
    assert.equal(rows.invented, 1)
    assert.ok(failing(checks).includes("Adds no 45 row that isn't a transaction on this account"))
  })

  it("an unmasked card number fails its check", () => {
    const card = byId("credit-card-statement")
    const produced = perfect(card)
    if (produced.kind !== "transactions") throw new Error()
    produced.review.rows.push({ ...produced.review.rows[1], id: "x", description: "CARD 4417229088310042", amount: -9999 })
    assert.ok(failing(scoreCase(card, produced).checks).includes("Keeps no full number ending 0042"))
  })

  it("a holding's ticker, value and type, a missed holding and a made-up one", () => {
    const table = byId("positions-cost-basis")
    const model = structuredClone(PERFECT_HOLDINGS["positions-cost-basis"])
    const row = (symbol: string) => model.holdings.find((h) => h.symbol === symbol)!
    row("MSFT").value = 2410.55 // the cost basis beside it
    row("SCHD").symbol = "SCHO" // misread, so also not a fund Sprout knows
    Object.assign(row("TSLA"), { name: "TESLA" }) // no "INC", so nothing says it's a company
    model.holdings.splice(model.holdings.indexOf(row("BND")), 1)
    model.holdings.push(position("QQQ", "INVESCO QQQ TRUST", 1, 500, 500))

    const { checks, rows } = scoreCase(table, holdingsProduced(model))
    assert.deepEqual(rows, {
      expected: 7,
      exact: 3,
      wrong: 3,
      missed: 1,
      invented: 1,
      keptLeftOut: 0,
      fields: { date: 0, amount: 0, direction: 0, description: 0, symbol: 1, value: 1, type: 2 },
    })
    assert.deepEqual(failing(checks), ["Reads every holding with the right value and type", "Makes up no holdings or tickers"])
  })

  it("a ticker worked out from a fund's name is one error on that fund, and fails the checks", () => {
    const plan = byId("401k-names-only")
    const model = structuredClone(PERFECT_HOLDINGS["401k-names-only"])
    model.holdings[1].symbol = "FXAIX"
    model.holdings[0].value = 48.2 // the percentage beside it
    const { checks, rows } = scoreCase(plan, holdingsProduced(model))
    assert.equal(rows.invented, 0)
    assert.deepEqual([rows.wrong, rows.fields.symbol, rows.fields.value], [2, 1, 1])
    assert.deepEqual(failing(checks), ["Reads each fund shown by name only, and gives it no ticker", "Makes up no holdings or tickers", "Leaves out 5 (noSymbol)"])
  })

  it("a value the screen doesn't show, worked out by the model, fails its check", () => {
    const trading = byId("trading-app-crypto")
    const model = structuredClone(PERFECT_HOLDINGS["trading-app-crypto"])
    model.holdings[0].value = 1708.8
    const { checks, rows } = scoreCase(trading, holdingsProduced(model))
    assert.equal(rows.exact, rows.expected)
    assert.deepEqual(failing(checks), ["Leaves NVDA's value empty, since the screen shows only shares and price"])
  })
})

describe("the harder fixtures", () => {
  it("only have dates up to today", () => {
    for (const screenshotCase of SCREENSHOT_CASES) {
      if (screenshotCase.kind !== "transactions") continue
      for (const t of screenshotCase.expect.transactions) assert.ok(t.date <= TODAY && t.date >= "2025-12-01", `${screenshotCase.id} ${t.date}`)
    }
  })

  it("UK dates include ones that also read as US dates, and ones that can only be day first", () => {
    const days = UK.rows.map((row) => Number(row.date.slice(8)))
    assert.ok(days.filter((d) => d <= 12).length >= 4)
    assert.ok(days.some((d) => d > 12))
  })

  it("long captures shrunk whole would be far too small to read, which is why they're cut into pieces", () => {
    const long = SCREENS.find((s) => s.name === "long-scroll-capture")!
    const tall = SCREENS.find((s) => s.name === "extra-tall-capture")!
    const longFit = fitScreenshot(capturedSize(long).width, capturedSize(long).height)
    const tallFit = fitScreenshot(capturedSize(tall).width, capturedSize(tall).height)
    assert.ok(longFit.width < capturedSize(long).width / 3 + 1)
    assert.ok(tallFit.width < capturedSize(tall).width / 5)
    const month = SCREENS.find((s) => s.name === "month-long-capture")!
    assert.ok(fitScreenshot(capturedSize(month).width, capturedSize(month).height).width < capturedSize(month).width / 8)
    assert.ok(LONG_SCROLL.rows.length >= 35 && EXTRA_TALL.rows.length >= 60 && MONTH_CAPTURE.rows.length >= 100)
  })

  it("the credit union's statement runs from one year into the next", () => {
    assert.deepEqual([...new Set(LEDGER.rows.map((r) => r.date.slice(0, 4)))], ["2025", "2026"])
  })

  it("the credit union's balances follow from its rows", () => {
    const balances = runningBalances(LEDGER.opening, LEDGER.rows.map((r) => r.amount))
    const total = LEDGER.rows.reduce((sum, r) => sum + r.amount, LEDGER.opening)
    assert.equal(balances.at(-1), Math.round(total * 100) / 100)
    assert.ok(balances.every((b) => b > 0))
  })

  it("the dense statement's post dates differ from the transaction dates on some rows", () => {
    assert.ok(DENSE.rows.filter((r) => r.postDate !== r.date).length >= 5)
    assert.ok(DENSE.rows.every((r) => r.postDate >= r.date))
  })

  it("rows hidden or cut off aren't in the answer keys, and no real row has the banner's amount", () => {
    const banner = byId("notification-banner")
    const cut = byId("cut-off-rows")
    if (banner.kind !== "transactions" || cut.kind !== "transactions") throw new Error()
    assert.ok(!banner.expect.transactions.some((t) => BANNER.hidden.some((h) => h.description === t.description)))
    assert.ok(!banner.expect.transactions.some((t) => Math.abs(t.amount) === BANNER.notificationAmount))
    assert.ok(!cut.expect.transactions.some((t) => t.description === CUT_OFF.top.description || t.description === CUT_OFF.bottom.description))
  })
})

describe("sameDescription", () => {
  it("ignores case and punctuation, and accepts a shortened form", () => {
    assert.ok(sameDescription("Payroll - Acme Corp", "PAYROLL ACME CORP"))
    assert.ok(sameDescription("Trader Joe's", "Trader Joes"))
    assert.ok(sameDescription("CASH ADVANCE ACCT ••••6655", "Cash advance acct ••••6655"))
    assert.ok(sameDescription("PAYPAL *DOORDASH ORDE…", "PAYPAL *DOORDASH ORDE"))
    assert.ok(!sameDescription("Uber", "Netflix"))
    assert.ok(!sameDescription("", "Netflix"))
  })

  it("similarDescription allows a misread letter or two, not another merchant", () => {
    assert.ok(similarDescription("Tracer Joe's", "Trader Joe's"))
    assert.ok(similarDescription("Sweetgreen", "Sweetgrean"))
    assert.ok(!similarDescription("Lyft", "Uber"))
    assert.ok(!similarDescription("Shell", "Target"))
  })
})

describe("summarize and renderMarkdown", () => {
  const rows = (overrides: Partial<CaseResult["rows"]> = {}) => ({ ...emptyRows(10), exact: 10, ...overrides })
  const result = (overrides: Partial<CaseResult>): CaseResult => ({
    id: "a",
    kind: "transactions",
    purpose: "Checks something.",
    run: 1,
    pass: true,
    checks: [],
    rows: rows(),
    ms: 3000,
    costUsd: 0.001,
    ...overrides,
  })

  it("adds up rows, errors by type, times and cost, and keeps each case's totals", () => {
    const failed = rows({ exact: 6, wrong: 2, missed: 1, invented: 2, keptLeftOut: 1, fields: { ...emptyRows().fields, date: 2, direction: 1 } })
    const summary = summarize([result({}), result({ run: 2, pass: false, rows: failed, ms: 5000, costUsd: 0.003 }), result({ id: "b", rows: rows({ exact: 9, missed: 1 }) })])
    assert.deepEqual(summary.rows, { expected: 30, exact: 25, wrong: 2, missed: 2, invented: 2, keptLeftOut: 1, fields: { ...emptyRows().fields, date: 2, direction: 1 } })
    assert.equal(summary.passed, 2)
    assert.deepEqual(summary.seconds, { median: 3, p95: 5 })
    assert.ok(Math.abs(summary.costPerScreenshot - 0.005 / 3) < 1e-12)
    assert.deepEqual(
      summary.cases.map((c) => [c.id, c.runs, c.passed, c.rows.exact, c.rows.expected]),
      [
        ["a", 2, 1, 16, 20],
        ["b", 1, 1, 9, 10],
      ]
    )
  })

  it("leads with the numbers, then errors by type, cases and failures", () => {
    const failed = rows({ exact: 8, wrong: 1, missed: 1, fields: { ...emptyRows().fields, date: 1 } })
    const results = [result({}), result({ run: 2, pass: false, rows: failed, checks: [{ label: "Makes up no transactions", pass: false, detail: "One." }] })]
    const report = renderMarkdown(summarize(results), results, { date: "2026-10-26", model: "m", effort: "low", runs: 2 })
    assert.match(report, /1 screenshots, 2 runs each/)
    assert.match(report, /\| Rows read exactly right \| 90% \(18 of 20\) \|/)
    assert.match(report, /\| Rows missed \| 1 \|/)
    assert.match(report, /\| Date \| 1 \| `a` 1 \|/)
    assert.match(report, /\| Amount \| 0 \| - \|/)
    assert.match(report, /\| `a` \| 1 of 2 \| 18 of 20 \| date 1 \| 1 \| 0 \| 0 \| Checks something\. \|/)
    assert.match(report, /### `a` \(run 2\)\n\n- \*\*Makes up no transactions\*\*: One\./)
  })

  it("describes what was produced compactly for the JSON results", () => {
    const got = describeProduced(perfect(byId("cut-off-rows")))
    assert.ok("rows" in got && got.rows.length === CUT_OFF.rows.length)
    assert.deepEqual("rows" in got && got.rows[0], ["2026-10-22", "Uber", -21.4, false])
  })
})
