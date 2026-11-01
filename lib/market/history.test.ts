import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  firstWithHistory,
  historyCacheControl,
  marketChartsSwitchedOn,
  parsePriceHistory,
  plainEnglish,
  rebase,
  sliceRange,
  summarize,
  thin,
  type PricePoint,
} from "./history.ts"

const series = (closes: number[], start = "2026-01-01"): PricePoint[] =>
  closes.map((close, index) => ({ date: new Date(Date.parse(`${start}T00:00:00Z`) + index * 86_400_000).toISOString().slice(0, 10), close }))

describe("marketChartsSwitchedOn", () => {
  it("is on only when MARKET_CHARTS is set to on", () => {
    assert.equal(marketChartsSwitchedOn(undefined), false)
    assert.equal(marketChartsSwitchedOn(""), false)
    assert.equal(marketChartsSwitchedOn("off"), false)
    assert.equal(marketChartsSwitchedOn("true"), false)
    assert.equal(marketChartsSwitchedOn("on"), true)
    assert.equal(marketChartsSwitchedOn(" ON "), true)
  })
})

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
    const text = plainEnglish("the US stock market", summarize(series([100, 120, 90, 110, 108]))!, "year")
    assert.equal(text, "Over the last year, the US stock market rose 8%. It's now 10% below its high for the period. Along the way it dropped as much as 25% from a peak.")
  })
})

describe("finding a market's history", () => {
  class FakeError extends Error {
    temporary: boolean
    constructor(temporary: boolean) {
      super(temporary ? "rate limited" : "not on this plan")
      this.temporary = temporary
    }
  }
  const isTemporary = (error: unknown) => error instanceof FakeError && error.temporary
  /** A loader that answers each symbol from `answers` and records which symbols were asked for. */
  function loader(answers: Record<string, PricePoint[] | FakeError>) {
    const asked: string[] = []
    const load = async (symbol: string) => {
      asked.push(symbol)
      const answer = answers[symbol]
      if (answer instanceof FakeError) throw answer
      return answer ?? []
    }
    return { asked, load }
  }

  it("uses the first symbol with data, and moves past symbols the plan doesn't cover", async () => {
    const { asked, load } = loader({ SPY: new FakeError(false), VOO: [], IVV: series([1, 2, 3]) })
    const result = await firstWithHistory(["SPY", "VOO", "IVV", "^GSPC"], load, isTemporary)
    assert.deepEqual(result, { symbol: "IVV", points: series([1, 2, 3]), temporary: false })
    assert.deepEqual(asked, ["SPY", "VOO", "IVV"])
  })

  it("stops at a temporary failure instead of spending the quota on the other symbols", async () => {
    const { asked, load } = loader({ SPY: new FakeError(true), VOO: series([1, 2]) })
    assert.deepEqual(await firstWithHistory(["SPY", "VOO", "IVV"], load, isTemporary), { symbol: "", points: [], temporary: true })
    assert.deepEqual(asked, ["SPY"])
  })

  it("reports a market no symbol has data for as a lasting gap", async () => {
    const { load } = loader({ BTCUSD: new FakeError(false) })
    assert.deepEqual(await firstWithHistory(["BTCUSD"], load, isTemporary), { symbol: "", points: [], temporary: false })
  })

  it("is cached for an hour unless a market is missing because of a failure just now", () => {
    assert.match(historyCacheControl(0), /^public, s-maxage=3600\b/)
    assert.match(historyCacheControl(1), /^public, s-maxage=300\b/)
    assert.match(historyCacheControl(5), /^public, s-maxage=300\b/)
  })
})
