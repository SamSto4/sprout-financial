import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { parsePriceHistory, plainEnglish, rebase, sliceRange, summarize, thin, type PricePoint } from "./history.ts"

const series = (closes: number[], start = "2026-01-01"): PricePoint[] =>
  closes.map((close, index) => ({ date: new Date(Date.parse(`${start}T00:00:00Z`) + index * 86_400_000).toISOString().slice(0, 10), close }))

describe("parsePriceHistory", () => {
  it("accepts the light and full formats, sorts, de-duplicates and drops bad rows", () => {
    const parsed = parsePriceHistory([
      { symbol: "SPY", date: "2026-01-03", price: 102 },
      { date: "2026-01-01", close: 100 },
      { date: "2026-01-02", close: 101 },
      { date: "2026-01-02", close: 101.5 },
      { date: "bad", close: 1 },
      { date: "2026-01-04", close: -3 },
      "junk",
    ])
    assert.deepEqual(parsed, [
      { date: "2026-01-01", close: 100 },
      { date: "2026-01-02", close: 101.5 },
      { date: "2026-01-03", close: 102 },
    ])
    assert.deepEqual(parsePriceHistory({ historical: [{ date: "2026-01-01", close: 5 }] }), [{ date: "2026-01-01", close: 5 }])
    assert.deepEqual(parsePriceHistory(null), [])
  })
})

describe("ranges", () => {
  it("slices to the period ending at the last point", () => {
    const points = series(Array.from({ length: 400 }, (_, i) => 100 + i))
    const month = sliceRange(points, "1M")
    assert.equal(month.at(-1), points.at(-1))
    assert.equal(month.length, 32)
    assert.equal(sliceRange([], "1Y").length, 0)
  })

  it("thins evenly, keeping both ends", () => {
    const points = series(Array.from({ length: 1000 }, (_, i) => i + 1))
    const thinned = thin(points, 100)
    assert.equal(thinned.length, 100)
    assert.equal(thinned[0], points[0])
    assert.equal(thinned.at(-1), points.at(-1))
  })
})

describe("summarize", () => {
  it("measures change, distance from the high and the deepest fall", () => {
    const summary = summarize(series([100, 120, 90, 110, 108]))
    assert.ok(summary)
    assert.equal(summary.change, 0.08)
    assert.equal(summary.high.close, 120)
    assert.equal(summary.belowHigh, 0.1)
    assert.deepEqual(summary.maxDrop, { fall: 0.25, peak: "2026-01-02", low: "2026-01-03" })
    assert.equal(summary.thousandBecomes, 1080)
  })

  it("needs two points, and ten returns for volatility", () => {
    assert.equal(summarize(series([100])), null)
    assert.equal(summarize(series([100, 101]))?.volatility, null)
    const flat = summarize(series(Array.from({ length: 30 }, () => 100)))
    assert.equal(flat?.volatility, 0)
  })

  it("rebases to 1,000", () => {
    assert.deepEqual(rebase(series([50, 55, 45])).map((p) => p.value), [1000, 1100, 900])
  })

  it("explains it calmly", () => {
    const text = plainEnglish("The US stock market", summarize(series([100, 120, 90, 110, 108]))!, "1 year")
    assert.equal(text, "The US stock market is up 8% over the last 1 year, and 10% below its high for the period. Along the way it fell as much as 25% from a peak before recovering some or all of it.")
  })
})
