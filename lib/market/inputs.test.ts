import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { parseSearchQuery, parseSymbol, pick } from "./inputs.ts"

describe("parseSymbol", () => {
  it("normalizes valid tickers", () => {
    assert.equal(parseSymbol({ symbol: " aapl " }), "AAPL")
    assert.equal(parseSymbol({ symbol: "BRK.B" }), "BRK.B")
    assert.equal(parseSymbol({ symbol: "BRK-B" }), "BRK-B")
    assert.equal(parseSymbol({ symbol: "^GSPC" }), "^GSPC")
    assert.equal(parseSymbol({ symbol: "7203.T" }), "7203.T")
  })

  it("rejects anything that isn't a plain ticker", () => {
    for (const input of [
      null,
      "AAPL",
      {},
      { symbol: 42 },
      { symbol: "" },
      { symbol: "AAPL&apikey=x" },
      { symbol: "../quote" },
      { symbol: "A B" },
      { symbol: "ABCDEFGHIJKLMNOP" },
    ]) {
      assert.equal(parseSymbol(input), null, JSON.stringify(input))
    }
  })
})

describe("parseSearchQuery", () => {
  it("accepts company names", () => {
    assert.equal(parseSearchQuery({ query: " Apple " }), "Apple")
    assert.equal(parseSearchQuery({ query: "Johnson & Johnson" }), "Johnson & Johnson")
    assert.equal(parseSearchQuery({ query: "L'Oréal" }), "L'Oréal")
  })

  it("rejects empty, long or unusual queries", () => {
    for (const input of [
      null,
      { query: "" },
      { query: "   " },
      { query: "a".repeat(61) },
      { query: "apple?limit=1000" },
      { query: "<script>" },
    ]) {
      assert.equal(parseSearchQuery(input), null, JSON.stringify(input))
    }
  })
})

describe("pick", () => {
  it("keeps only listed keys that have values", () => {
    const source = { price: 10, name: "Apple", secret: "x", empty: "", missing: null }
    assert.deepEqual(pick(source, ["price", "name", "empty", "missing", "absent"]), {
      price: 10,
      name: "Apple",
    })
  })
})
