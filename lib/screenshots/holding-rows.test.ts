import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { checkHoldingsAddUp, holdingsFromScreenshots, readHoldingsScreenshot, totalsThatDontAddUp } from "./holding-rows.ts"

const position = (overrides: Record<string, unknown> = {}) => ({
  kind: "position",
  symbol: "VTI",
  name: "Vanguard Total Stock Market ETF",
  shares: 12.5,
  price: 273.03,
  value: 3412.88,
  security_type: "ETF",
  ...overrides,
})

const read = (holdings: Record<string, unknown>[]) => readHoldingsScreenshot({ problem: "none", holdings })

describe("readHoldingsScreenshot", () => {
  it("reads positions with their numbers", () => {
    const result = read([position()])
    assert.equal(result.problem, "none")
    assert.deepEqual(result.rows, [
      { symbol: "VTI", name: "Vanguard Total Stock Market ETF", quantity: 12.5, price: 273.03, value: 3412.88, securityType: "ETF" },
    ])
  })

  it("passes a problem through when no position was read", () => {
    assert.equal(readHoldingsScreenshot({ problem: "wrong_kind", holdings: [] }).problem, "wrong_kind")
    assert.equal(readHoldingsScreenshot({ problem: "none", holdings: [position({ kind: "total", symbol: null })] }).problem, "none")
    assert.equal(readHoldingsScreenshot({ problem: "nonsense", holdings: [] }).problem, "unreadable")
    assert.equal(readHoldingsScreenshot("text").problem, "unreadable")
  })

  it("turns non-numbers into missing values rather than zeros", () => {
    const [row] = read([position({ shares: "12.5", value: Number.NaN })]).rows
    assert.equal(row.quantity, null)
    assert.equal(row.value, null)
  })

  it("masks account numbers that end up in a name", () => {
    const [row] = read([position({ kind: "cash", symbol: null, name: "Cash sweep 12345678901" })]).rows
    assert.equal(row.name, "Cash sweep ••••8901")
  })
})

describe("holdingsFromScreenshots", () => {
  it("applies the CSV rules: totals and pending skipped, cash filed as cash, classes guessed", () => {
    const result = holdingsFromScreenshots([
      read([
        position(),
        position({ symbol: "AAPL", name: "Apple Inc", shares: 10, price: 230, value: 2300, security_type: "Stock" }),
        position({ kind: "cash", symbol: null, name: "Cash & sweep", shares: null, price: null, value: 812.4, security_type: null }),
        position({ kind: "total", symbol: null, name: "Account total", value: 6525.28 }),
        position({ kind: "pending", symbol: null, name: "Pending activity", value: 120 }),
      ]),
    ])
    assert.deepEqual(
      result.holdings.map((h) => [h.symbol, h.assetClass, h.value]),
      [
        ["VTI", "us-stocks", 3412.88],
        ["AAPL", "single-stock", 2300],
        ["CASH", "cash", 812.4],
      ]
    )
    assert.equal(result.skipped.totals, 1)
    assert.equal(result.skipped.pending, 1)
  })

  it("counts a position seen again in a later screenshot once", () => {
    const result = holdingsFromScreenshots([read([position(), position({ symbol: "BND", name: "Vanguard Total Bond", value: 900 })]), read([position()])])
    assert.equal(result.holdings.find((h) => h.symbol === "VTI")!.value, 3412.88)
    assert.equal(result.repeated, 1)
  })

  it("adds the same fund with a different value: another account", () => {
    const result = holdingsFromScreenshots([read([position()]), read([position({ shares: 5, value: 1365.15 })])])
    assert.equal(result.holdings.find((h) => h.symbol === "VTI")!.value, 4778.03)
    assert.equal(result.combined, 1)
    assert.equal(result.repeated, 0)
  })

  it("files holdings by the section heading the model copies into security_type", () => {
    // The prompt asks for the type from the row or its section heading (a trading app's "Stocks",
    // "Crypto"); a heading naming both stocks and funds says nothing, so the name decides.
    const result = holdingsFromScreenshots([
      read([
        position({ symbol: "SOL", name: "Solana", shares: 6.2, price: null, value: 1104.22, security_type: "Crypto" }),
        position({ symbol: "NVDA", name: "", shares: 12, price: 142.4, value: null, security_type: "Stocks" }),
        position({ symbol: "XYZQ", name: "Example Growth ETF", shares: 2, price: 50, value: 100, security_type: "Stocks & ETFs" }),
      ]),
    ])
    assert.deepEqual(
      result.holdings.map((h) => [h.symbol, h.assetClass, h.value]),
      [
        ["NVDA", "single-stock", 1708.8],
        ["SOL", "crypto", 1104.22],
        ["XYZQ", "other", 100],
      ]
    )
  })

  it("works a value out from shares and price, and skips positions without a ticker", () => {
    const result = holdingsFromScreenshots([
      read([position({ shares: 10, price: 230.5, value: null }), position({ symbol: null, name: "AAPL Jan 2027 250 Call", value: 400, security_type: "Option" })]),
    ])
    assert.equal(result.holdings[0].value, 2305)
    assert.equal(result.skipped.noSymbol, 1)
  })
})

describe("checkHoldingsAddUp", () => {
  const total = (value: number | null) => position({ kind: "total", symbol: null, name: "Account total", shares: null, price: null, value, security_type: null })
  const cash = (value: number) => position({ kind: "cash", symbol: null, name: "Cash", shares: null, price: null, value, security_type: null })

  it("adds up when the rows, with any worked out from shares and price, match the screen's total", () => {
    const result = checkHoldingsAddUp(read([total(4605.4), position({ shares: 10, price: 230.5, value: null }), position({ symbol: "BND", shares: 30, price: 72.4, value: 2172 }), cash(128.4)]))
    assert.deepEqual(result, { status: "adds-up", sum: 4605.4, total: 4605.4 })
  })

  it("allows for rounding on screen and for a total with or without pending activity", () => {
    assert.equal(checkHoldingsAddUp(read([total(3415), position()])).status, "adds-up")
    const pending = position({ kind: "pending", symbol: null, name: "Pending activity", shares: null, price: null, value: 150, security_type: null })
    assert.equal(checkHoldingsAddUp(read([position(), pending, total(3562.88)])).status, "adds-up")
    assert.equal(checkHoldingsAddUp(read([position(), pending, total(3412.88)])).status, "adds-up")
  })

  it("differs when a share price was taken for the position's value", () => {
    // A trading app shows 12 shares and a $142.40 price, and the total counts 12 x 142.40.
    const result = checkHoldingsAddUp(read([total(2008.8), position({ symbol: "NVDA", shares: 12, price: null, value: 142.4 }), cash(300)]))
    assert.deepEqual(result, { status: "differs", sum: 442.4, total: 2008.8 })
  })

  it("differs when a row's shares times price isn't its value, even if the total matches", () => {
    assert.equal(checkHoldingsAddUp(read([total(3412.88), position({ shares: 12.5, price: 27.3, value: 3412.88 })])).status, "differs")
  })

  it("compares with the nearest of several totals", () => {
    assert.deepEqual(checkHoldingsAddUp(read([total(90000), total(3412.88), position()])), { status: "adds-up", sum: 3412.88, total: 3412.88 })
  })

  it("differs when a position was read with shares but neither a price nor a value", () => {
    const result = checkHoldingsAddUp(read([total(5584.88), position(), position({ symbol: "BND", shares: 30, price: null, value: null })]))
    assert.deepEqual(result, { status: "differs", sum: 3412.88, total: 5584.88 })
  })

  it("can't check a screen without a total", () => {
    assert.deepEqual(checkHoldingsAddUp(read([position()])), { status: "unchecked" })
    assert.deepEqual(checkHoldingsAddUp(read([total(null), position()])), { status: "unchecked" })
  })
})

describe("totalsThatDontAddUp", () => {
  const total = (value: number) => position({ kind: "total", symbol: null, name: "Account value", shares: null, price: null, value, security_type: null })
  const stock = (symbol: string, value: number) => position({ symbol, name: symbol, shares: null, price: null, value, security_type: "Stock" })

  it("warns about part of a list under its account total, and about a read over the total, without changing a value", () => {
    // Only some positions are visible: the rows come to $40,000 of a $100,000 account.
    const partial = read([total(100000), stock("AAA", 25000), stock("BBB", 15000)])
    assert.deepEqual(totalsThatDontAddUp([partial]), [{ index: 0, total: 100000 }])
    // A digit misread on the same screen: $112,000 against $100,000.
    const over = read([total(100000), stock("AAA", 97000), stock("BBB", 15000)])
    assert.deepEqual(totalsThatDontAddUp([over]), [{ index: 0, total: 100000 }])
    assert.deepEqual(
      holdingsFromScreenshots([partial]).holdings.map((h) => [h.symbol, h.value]),
      [
        ["AAA", 25000],
        ["BBB", 15000],
      ]
    )
  })

  it("says nothing when the rows add up, or when the screen shows no total", () => {
    assert.deepEqual(totalsThatDontAddUp([read([total(40000), stock("AAA", 25000), stock("BBB", 15000)])]), [])
    assert.deepEqual(totalsThatDontAddUp([read([stock("AAA", 25000)])]), [])
    assert.deepEqual(totalsThatDontAddUp([readHoldingsScreenshot({ problem: "wrong_kind", holdings: [] })]), [])
  })

  it("checks several screenshots of one scrolled list together, so the total on the first isn't flagged", () => {
    const top = read([total(40000), stock("AAA", 25000)])
    const bottom = read([stock("AAA", 25000), stock("BBB", 15000)])
    assert.deepEqual(totalsThatDontAddUp([top, bottom]), [])
    assert.deepEqual(totalsThatDontAddUp([top]), [{ index: 0, total: 40000 }])
  })

  it("names only the screenshot that doesn't add up when they're of different accounts", () => {
    const ira = read([total(10000), stock("AAA", 10000)])
    const partOfBrokerage = read([total(90000), stock("BBB", 30000)])
    assert.deepEqual(totalsThatDontAddUp([ira, partOfBrokerage]), [{ index: 1, total: 90000 }])
  })

  it("doesn't count the total shown on each screenshot as a holding seen twice", () => {
    const result = holdingsFromScreenshots([read([total(40000), stock("AAA", 25000)]), read([total(40000), stock("BBB", 15000)])])
    assert.equal(result.repeated, 0)
    assert.equal(result.skipped.totals, 1)
    assert.equal(result.holdings.length, 2)
  })
})
