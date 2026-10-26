import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { holdingsFromScreenshots, readHoldingsScreenshot } from "./holding-rows.ts"

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

  it("works a value out from shares and price, and skips positions without a ticker", () => {
    const result = holdingsFromScreenshots([
      read([position({ shares: 10, price: 230.5, value: null }), position({ symbol: null, name: "AAPL Jan 2027 250 Call", value: 400, security_type: "Option" })]),
    ])
    assert.equal(result.holdings[0].value, 2305)
    assert.equal(result.skipped.noSymbol, 1)
  })
})
