import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { ungroundedNote, ungroundedPrices } from "./grounding.ts"

const quote = JSON.stringify({ symbol: "AAPL", price: 187.4213, change: -1.2, yearHigh: 1204.1, asOf: "2026-10-26T15:30:00Z" })

describe("ungroundedPrices", () => {
  it("accepts prices the tool returned, rounded to the cent", () => {
    assert.deepEqual(ungroundedPrices("AAPL was at $187.42, down $1.20, with a high of $1,204.10.", [quote]), [])
  })

  it("flags a price no tool returned, once", () => {
    assert.deepEqual(ungroundedPrices("It traded at $190.15 earlier, then $190.15 again.", [quote]), ["$190.15"])
  })

  it("accepts a price the user gave", () => {
    assert.deepEqual(ungroundedPrices("You bought at $150.25.", [quote, "I bought at $150.25 last year"]), [])
  })

  it("ignores round figures, which are examples rather than quotes", () => {
    assert.deepEqual(ungroundedPrices("If you put $500 a month in, or about $3 trillion of market cap.", [quote]), [])
  })

  it("flags everything when the data lookup failed", () => {
    assert.deepEqual(ungroundedPrices("It's around $187.42.", ["Market data is unavailable right now."]), ["$187.42"])
  })
})

describe("ungroundedNote", () => {
  it("names the figures in plain words", () => {
    assert.match(ungroundedNote(["$190.15"]), /couldn't match \$190\.15 to the market data.*check that figure/)
    assert.match(ungroundedNote(["$1.00", "$2.00", "$3.00"]), /\$1\.00, \$2\.00 and \$3\.00.*those figures/)
  })
})
