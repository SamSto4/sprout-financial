import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { projectWithFee } from "../finance/fees.ts"
import { EMPTY_PROFILE, type InvestorProfile } from "../plan/profile.ts"
import { buildRoadmap } from "../plan/roadmap.ts"
import { analyzePortfolio, FEE_PROJECTION, nextDollars, rebalancePlan, stressTest } from "./analyze.ts"
import { beforeYouBuy } from "./buy-check.ts"
import { KNOWN_FUNDS, normalizeSymbol, SYMBOL_PATTERN } from "./funds.ts"
import { dropsAtLeast, MARKET_DROPS } from "./history.ts"
import {
  allLookupsFailed,
  MAX_HOLDINGS,
  MAX_QUOTE_SYMBOLS,
  MAX_QUOTES_REQUEST_BYTES,
  parsePortfolio,
  summarizeQuoteRefresh,
  type Holding,
  type Portfolio,
} from "./holdings.ts"
import { callInWorker } from "../testing/in-worker.ts"

const HOLDINGS_MODULE = new URL("./holdings.ts", import.meta.url)

function holding(symbol: string, value: number, extra: Partial<Holding> = {}): Holding {
  return {
    id: symbol.toLowerCase(),
    symbol,
    name: "",
    assetClass: KNOWN_FUNDS[symbol]?.assetClass ?? "single-stock",
    value,
    shares: null,
    expenseRatioPercent: null,
    valueAsOf: "",
    ...extra,
  }
}

const profile: InvestorProfile = {
  ...EMPTY_PROFILE,
  updatedAt: "2026-10-25T00:00:00.000Z",
  country: "United States",
  goal: "retirement",
  horizonYears: 40,
  riskAnswers: [2, 2, 2, 2, 2], // growth, 40 years → 75-95% stocks
  monthlyEssentials: 1500,
  emergencySavings: 6000,
  employerMatch: "capturing",
  hasTaxAdvantagedAccount: "yes",
}

describe("analyzePortfolio", () => {
  it("returns null for an empty portfolio", () => {
    assert.equal(analyzePortfolio([], null), null)
  })

  it("adds up allocation by asset class", () => {
    const analysis = analyzePortfolio([holding("VTI", 6000), holding("VXUS", 2000), holding("BND", 2000)], { min: 75, max: 95 })
    assert.ok(analysis)
    assert.equal(analysis.total, 10000)
    assert.equal(analysis.stockShare, 0.8)
    assert.equal(analysis.stableShare, 0.2)
    assert.equal(analysis.target?.status, "within")
    assert.equal(analysis.byClass[0].assetClass, "us-stocks")
  })

  it("flags a single stock that's a big slice", () => {
    const analysis = analyzePortfolio([holding("VOO", 7000), holding("TSLA", 3000)], null)
    const check = analysis?.checks.find((c) => c.id === "concentration")
    assert.equal(check?.level, "act")
    assert.equal(analysis?.largestSingleStock?.share, 0.3)
  })

  it("spots funds following the same index, and related indexes", () => {
    const same = analyzePortfolio([holding("VOO", 5000), holding("SPY", 5000)], null)
    assert.deepEqual(same?.overlaps[0].symbols, ["VOO", "SPY"])
    const related = analyzePortfolio([holding("VOO", 5000), holding("QQQ", 5000)], null)
    assert.match(related?.overlaps[0].note ?? "", /Nasdaq-100/)
  })

  it("weights fees by value and projects their 30-year cost with the tested fee function", () => {
    const analysis = analyzePortfolio(
      [holding("VTI", 9000, { expenseRatioPercent: 0.03 }), holding("ARKK", 1000, { expenseRatioPercent: 0.75 })],
      null
    )
    assert.equal(analysis?.fees.weightedPercent, 0.102)
    const expected = projectWithFee({ principal: 10000, monthlyContribution: 0, annualRatePercent: FEE_PROJECTION.annualRatePercent, years: 30, feePercent: 0.102 }).lostToFees
    assert.equal(analysis?.fees.thirtyYearCost, expected)
  })

  it("projects the fee cost only on the money whose fee is known, not the whole portfolio", () => {
    // Review finding: a $100k portfolio with one $10k fund at 1% used to be projected as if all
    // $100k paid 1%, about ten times too high.
    const analysis = analyzePortfolio(
      [holding("VTI", 90000), holding("ACTIVE", 10000, { assetClass: "us-stocks", expenseRatioPercent: 1 })],
      null
    )!
    const expected = projectWithFee({ principal: 10000, monthlyContribution: 0, annualRatePercent: FEE_PROJECTION.annualRatePercent, years: 30, feePercent: 1 }).lostToFees
    assert.equal(analysis.fees.feeValue, 10000)
    assert.equal(analysis.fees.coverage, 0.1)
    assert.equal(analysis.fees.thirtyYearCost, expected)
    const feeCheck = analysis.checks.find((check) => check.id === "fees")
    assert.match(feeCheck?.detail ?? "", /On the \$10,000 with a known fee/)
  })

  it("counts crypto on the risky side when comparing with the target range", () => {
    // $6k bitcoin + $4k VOO with a 60-80% stock range: 100% is on the risky side, so the advice
    // must be to add steadier money, never "add stocks".
    const analysis = analyzePortfolio(
      [holding("BTC", 6000, { assetClass: "crypto" }), holding("VOO", 4000)],
      { min: 60, max: 80 }
    )!
    assert.equal(analysis.stockShare, 0.4)
    assert.equal(analysis.growthShare, 1)
    assert.equal(analysis.target?.status, "above")
    const mix = analysis.checks.find((check) => check.id === "mix")
    assert.match(mix?.title ?? "", /More in stocks and crypto/)
    const plan = rebalancePlan(analysis)
    assert.ok(plan.needed)
    assert.equal(plan.addTo, "bonds-and-cash")
  })

  it("warns about leveraged funds and missing international stocks", () => {
    const analysis = analyzePortfolio([holding("VOO", 9000), holding("TQQQ", 1000)], null)
    const ids = analysis?.checks.map((c) => c.id) ?? []
    assert.ok(ids.includes("leveraged"))
    assert.ok(ids.includes("international"))
  })
})

describe("rebalancePlan", () => {
  it("says how much new money in bonds brings an over-stocked mix to the middle of the range", () => {
    // 100% stocks, range 50-70 → middle 60%. 10,000 / (10,000 + x) = 0.6 → x = 6,666.67
    const analysis = analyzePortfolio([holding("VTI", 10000)], { min: 50, max: 70 })!
    const plan = rebalancePlan(analysis)
    assert.ok(plan.needed)
    assert.equal(plan.addTo, "bonds-and-cash")
    assert.equal(plan.amount, 6666.67)
    assert.equal(plan.sellAmount, 4000)
  })

  it("and how much in stocks for an under-stocked one", () => {
    // 40% stocks, range 75-95 → middle 85%. (4,000 + x) / (10,000 + x) = 0.85 → x = 30,000
    const analysis = analyzePortfolio([holding("VTI", 4000), holding("BND", 6000)], { min: 75, max: 95 })!
    const plan = rebalancePlan(analysis)
    assert.ok(plan.needed)
    assert.equal(plan.addTo, "stocks")
    assert.equal(plan.amount, 30000)
  })

  it("does nothing inside the range or without a target", () => {
    assert.equal(rebalancePlan(analyzePortfolio([holding("VTI", 8000), holding("BND", 2000)], { min: 75, max: 95 })!).needed, false)
    assert.equal(rebalancePlan(analyzePortfolio([holding("VTI", 8000)], null)!).needed, false)
  })
})

describe("nextDollars", () => {
  it("fills the starter buffer, then high-interest debt, then the full fund", () => {
    const result = nextDollars(
      3000,
      { ...profile, emergencySavings: 1000, debts: [{ id: "c", name: "Visa", balance: 1200, aprPercent: 24, minPayment: 40 }] },
      null
    )
    assert.deepEqual(
      result.splits.map((s) => [s.where, s.amount]),
      [
        ["Emergency savings (starter buffer)", 500],
        ["Extra payment on Visa", 1200],
        ["Emergency savings (toward 3 months)", 1300],
      ]
    )
  })

  it("splits investing money by the middle of the target range once foundations are done", () => {
    const analysis = analyzePortfolio([holding("VTI", 8500), holding("BND", 1500)], { min: 75, max: 95 })
    const result = nextDollars(200, profile, analysis)
    assert.deepEqual(
      result.splits.map((s) => [s.where, s.amount]),
      [
        ["Diversified stock index fund", 170],
        ["Bond fund or cash", 30],
      ]
    )
  })

  it("steers new money to the underweight side first", () => {
    const analysis = analyzePortfolio([holding("VTI", 10000)], { min: 50, max: 70 })
    const result = nextDollars(1000, { ...profile, riskAnswers: [1, 1, 1, 1, 1], horizonYears: 8 }, analysis)
    assert.equal(result.splits[0].where, "Bond fund or cash")
    assert.equal(result.splits[0].amount, 1000)
  })

  it("notes the employer match instead of spending the amount on it", () => {
    const result = nextDollars(100, { ...profile, employerMatch: "missing" }, null)
    assert.ok(result.notes.some((note) => /employer match/.test(note)))
    assert.equal(result.splits.reduce((sum, s) => sum + s.amount, 0), 100)
  })
})

describe("stressTest", () => {
  it("drops only the stock-like and crypto part", () => {
    const analysis = analyzePortfolio([holding("VTI", 7000), holding("BND", 2000), holding("IBIT", 1000)], null)!
    const result = stressTest(analysis, 30)
    assert.equal(result.loss, 2400)
    assert.equal(result.portfolioDropPercent, 24)
    assert.equal(result.valueAfter, 7600)
  })
})

describe("beforeYouBuy", () => {
  const holdings = [holding("VTI", 9000)]

  it("calls out foundations first, and never gives a verdict", () => {
    const roadmap = buildRoadmap({ ...profile, emergencySavings: 100 })
    const check = beforeYouBuy({ facts: { symbol: "TSLA", found: true, name: "Tesla", beta: 2.1, yearLow: 150, yearHigh: 400 }, amount: 1000, holdings, roadmap, emergencySavings: 100 })
    assert.equal(check.kind, "single-stock")
    assert.equal(check.items[0].id, "foundation")
    assert.equal(check.items[0].level, "act")
    assert.equal(check.shareAfter, 0.1)
    const text = JSON.stringify(check)
    assert.doesNotMatch(text, /you should (buy|sell)|good buy|don't buy/i)
  })

  it("asks for missing savings details instead of saying foundations aren't in place", () => {
    const roadmap = buildRoadmap({ ...profile, emergencySavings: null })
    const check = beforeYouBuy({ facts: { symbol: "VOO", found: true }, amount: 500, holdings, roadmap, emergencySavings: null })
    const foundation = check.items.find((item) => item.id === "foundation")
    assert.equal(foundation?.level, "watch")
    assert.match(foundation?.title ?? "", /Add your savings/)
    assert.doesNotMatch(JSON.stringify(check), /Foundations aren't in place/)
  })

  it("recognises broad funds and leveraged funds from the fund list", () => {
    assert.equal(beforeYouBuy({ facts: { symbol: "VOO", found: true }, amount: 100, holdings, roadmap: null, emergencySavings: null }).kind, "broad-fund")
    const leveraged = beforeYouBuy({ facts: { symbol: "TQQQ", found: true }, amount: 100, holdings, roadmap: null, emergencySavings: null })
    assert.equal(leveraged.kind, "leveraged")
    assert.ok(leveraged.items.some((item) => item.level === "act"))
  })

  it("says live data was unavailable instead of blaming the ticker", () => {
    const check = beforeYouBuy({ facts: { symbol: "NVDA", found: false, lookupFailed: true }, amount: 500, holdings: [], roadmap: null, emergencySavings: null })
    assert.match(check.kindLabel, /Live market data isn't available/)
    assert.doesNotMatch(check.kindLabel, /Double-check the ticker/)
  })

  it("works without a portfolio or market data", () => {
    const check = beforeYouBuy({ facts: { symbol: "ZZZZ", found: false }, amount: 500, holdings: [], roadmap: null, emergencySavings: null })
    assert.equal(check.kind, "unknown")
    assert.equal(check.shareAfter, null)
  })
})

describe("holdings and funds", () => {
  it("normalizes symbols and rejects junk", () => {
    assert.equal(normalizeSymbol(" voo "), "VOO")
    assert.equal(normalizeSymbol("brk.b"), "BRK.B")
    assert.equal(normalizeSymbol("$where"), null)
  })

  it("parses holdings, filling the class from the fund list and fixing duplicate ids", () => {
    const parsed = parsePortfolio({ updatedAt: "x", holdings: [{ id: "a", symbol: "bnd", value: 100 }, { id: "a", symbol: "VTI", value: 50, assetClass: "nope" }, { symbol: "", value: 5 }] })
    assert.equal(parsed?.holdings.length, 2)
    assert.equal(parsed?.holdings[0].assetClass, "bonds")
    assert.equal(parsed?.holdings[1].assetClass, "us-stocks")
    const hostile = parsePortfolio({ updatedAt: "x", holdings: [{ symbol: "VTI", value: 10, assetClass: "constructor" }, { symbol: "ABC", value: 10, assetClass: "toString" }] })
    assert.equal(hostile?.holdings[0].assetClass, "us-stocks")
    assert.equal(hostile?.holdings[1].assetClass, "other")
    assert.notEqual(parsed?.holdings[0].id, parsed?.holdings[1].id)
  })

  it("gives repeated long ids distinct ids of at most 40 characters, and always finishes", async () => {
    // Cutting `id-n` to 40 characters used to drop the suffix, so these looped forever. Run on a
    // worker so a regression fails here instead of hanging the test run.
    const cases: Array<[length: number, copies: number]> = [[40, 2], [39, 3], [38, 11], [40, MAX_HOLDINGS], [10, 2]]
    for (const [length, copies] of cases) {
      const holdings = Array.from({ length: copies }, (_, i) => ({ id: "a".repeat(length), symbol: i % 2 ? "VXUS" : "VTI", value: 1 }))
      const parsed = await callInWorker<Portfolio | null>(HOLDINGS_MODULE, "parsePortfolio", [{ holdings }])
      const ids = parsed?.holdings.map((entry) => entry.id) ?? []
      assert.equal(ids.length, copies, `${copies} x ${length}`)
      assert.equal(new Set(ids).size, copies, `${copies} x ${length}: ${ids.join(", ")}`)
      assert.ok(ids.every((id) => /^[a-z0-9-]{1,40}$/.test(id)), `${copies} x ${length}: ${ids.join(", ")}`)
      assert.equal(ids[0], "a".repeat(length), "the first copy keeps its id")
    }
  })

  it("lists historical drops with recoveries", () => {
    assert.ok(MARKET_DROPS.every((drop) => drop.fallPercent > 0 && drop.monthsToRecover > 0))
    assert.deepEqual(dropsAtLeast(45).map((d) => d.fallPercent), [48, 49, 57])
  })
})

describe("refreshing prices", () => {
  const priced = (symbol: string) => ({ symbol, price: 100, asOf: "2026-10-27T15:00:00.000Z", lookupFailed: false })
  const unknown = (symbol: string) => ({ symbol, lookupFailed: false })
  const failed = (symbol: string) => ({ symbol, lookupFailed: true })

  it("treats every lookup failing as an outage, not as symbols that don't exist", () => {
    assert.equal(allLookupsFailed([failed("VTI"), failed("BND")]), true)
    assert.equal(allLookupsFailed([failed("VTI"), unknown("ZZZZ")]), false)
    assert.equal(allLookupsFailed([failed("VTI"), priced("BND")]), false)
    assert.equal(allLookupsFailed([]), false)
  })

  it("counts symbols that couldn't be checked apart from symbols that weren't found", () => {
    const summary = summarizeQuoteRefresh([priced("VTI"), unknown("ZZZZ"), failed("BND"), failed("VXUS")], 4)
    assert.deepEqual([...summary.priced.keys()], ["VTI"])
    assert.deepEqual({ notFound: summary.notFound, unchecked: summary.unchecked, skipped: summary.skipped }, { notFound: 1, unchecked: 2, skipped: 0 })
  })

  it("counts symbols the server left out of its answer as not found, and those past the limit as skipped", () => {
    const summary = summarizeQuoteRefresh([priced("VTI")], MAX_QUOTE_SYMBOLS + 3)
    assert.deepEqual({ notFound: summary.notFound, unchecked: summary.unchecked, skipped: summary.skipped }, { notFound: MAX_QUOTE_SYMBOLS - 1, unchecked: 0, skipped: 3 })
  })
})

describe("MAX_QUOTES_REQUEST_BYTES", () => {
  it("takes the longest list of symbols /api/market/quotes accepts", () => {
    // The route reads up to 100 entries; the longest valid symbol is 12 characters.
    const longest = "BRK.B-1234^X"
    assert.ok(SYMBOL_PATTERN.test(longest))
    const bytes = new TextEncoder().encode(JSON.stringify({ symbols: Array(100).fill(longest) })).length
    assert.ok(bytes < MAX_QUOTES_REQUEST_BYTES / 4, `${bytes} bytes`)
  })
})
