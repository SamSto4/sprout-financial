// Portfolio X-ray: what the user's holdings add up to, measured against their target mix.
// Allocation, concentration, overlap between funds, the long-run cost of fees, how to rebalance
// with new money instead of selling, where the next dollars could go, and a "what if stocks fell"
// stress test. Pure and tested; the assistant quotes these results instead of doing the math.

import { projectWithFee } from "../finance/fees.ts"
import { ASSET_CLASSES, knownFund, OVERLAPPING_INDEXES, STABLE, STOCK_LIKE, type AssetClass } from "./funds.ts"
import type { Holding } from "./holdings.ts"
import { HIGH_INTEREST_APR, highInterestDebts, type InvestorProfile, type StockRange } from "../plan/profile.ts"
import { FULL_FUND_MONTHS } from "../plan/roadmap.ts"

export type CheckLevel = "good" | "watch" | "act"
export type Check = { id: string; level: CheckLevel; title: string; detail: string }

export type PortfolioAnalysis = {
  total: number
  holdingsCount: number
  byClass: { assetClass: AssetClass; label: string; value: number; share: number }[]
  /** Share of the total in stock-like holdings (0-1). */
  stockShare: number
  stableShare: number
  cryptoShare: number
  target: { range: StockRange; status: "below" | "within" | "above"; driftPoints: number } | null
  largest: { symbol: string; share: number; assetClass: AssetClass } | null
  /** Largest individual stock (not fund) as a share of the total. */
  largestSingleStock: { symbol: string; share: number } | null
  fees: {
    /** Weighted yearly fee across holdings whose fee is known, as a percentage. */
    weightedPercent: number | null
    /** Share of the portfolio's value with a known fee (0-1). */
    coverage: number
    /** What that fee would cost over 30 years on the current balance, assuming 7% before fees and no new money. */
    thirtyYearCost: number | null
  }
  overlaps: { symbols: string[]; note: string }[]
  checks: Check[]
}

export const SINGLE_STOCK_WATCH = 0.1
export const SINGLE_STOCK_ACT = 0.2
export const CRYPTO_WATCH = 0.1
const DRIFT_TOLERANCE = 5
export const FEE_PROJECTION = { years: 30, annualRatePercent: 7 } as const

function round(value: number, digits = 4) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function pct(share: number) {
  return `${Math.round(share * 100)}%`
}

function money(value: number) {
  return `$${Math.round(value).toLocaleString("en-US")}`
}

export function analyzePortfolio(holdings: Holding[], range: StockRange | null): PortfolioAnalysis | null {
  const positive = holdings.filter((holding) => holding.value > 0)
  const total = positive.reduce((sum, holding) => sum + holding.value, 0)
  if (total <= 0) return null

  const classTotals = new Map<AssetClass, number>()
  for (const holding of positive) classTotals.set(holding.assetClass, (classTotals.get(holding.assetClass) ?? 0) + holding.value)
  const byClass = [...classTotals]
    .map(([assetClass, value]) => ({ assetClass, label: ASSET_CLASSES[assetClass], value: round(value, 2), share: round(value / total) }))
    .sort((a, b) => b.value - a.value)

  const sumWhere = (test: (holding: Holding) => boolean) => positive.filter(test).reduce((sum, holding) => sum + holding.value, 0)
  const stockShare = round(sumWhere((holding) => STOCK_LIKE.has(holding.assetClass)) / total)
  const stableShare = round(sumWhere((holding) => STABLE.has(holding.assetClass)) / total)
  const cryptoShare = round(sumWhere((holding) => holding.assetClass === "crypto") / total)

  let target: PortfolioAnalysis["target"] = null
  if (range) {
    const stockPoints = stockShare * 100
    const status = stockPoints < range.min - DRIFT_TOLERANCE ? "below" : stockPoints > range.max + DRIFT_TOLERANCE ? "above" : "within"
    const driftPoints = status === "below" ? range.min - stockPoints : status === "above" ? stockPoints - range.max : 0
    target = { range, status, driftPoints: round(driftPoints, 1) }
  }

  const sorted = [...positive].sort((a, b) => b.value - a.value)
  const largest = sorted[0] ? { symbol: sorted[0].symbol, share: round(sorted[0].value / total), assetClass: sorted[0].assetClass } : null
  const topStock = sorted.find((holding) => holding.assetClass === "single-stock")
  const largestSingleStock = topStock ? { symbol: topStock.symbol, share: round(topStock.value / total) } : null

  // Fees: weighted by value, over the holdings whose fee is known.
  const withFee = positive.filter((holding) => holding.expenseRatioPercent !== null)
  const feeValue = withFee.reduce((sum, holding) => sum + holding.value, 0)
  const weightedPercent = feeValue > 0 ? round(withFee.reduce((sum, h) => sum + h.value * (h.expenseRatioPercent ?? 0), 0) / feeValue, 4) : null
  const thirtyYearCost =
    weightedPercent !== null
      ? projectWithFee({
          principal: Math.min(total, 1_000_000),
          monthlyContribution: 0,
          annualRatePercent: FEE_PROJECTION.annualRatePercent,
          years: FEE_PROJECTION.years,
          feePercent: weightedPercent,
        }).lostToFees
      : null

  const overlaps = findOverlaps(positive)
  const analysis: PortfolioAnalysis = {
    total: round(total, 2),
    holdingsCount: positive.length,
    byClass,
    stockShare,
    stableShare,
    cryptoShare,
    target,
    largest,
    largestSingleStock,
    fees: { weightedPercent, coverage: round(feeValue / total), thirtyYearCost },
    overlaps,
    checks: [],
  }
  analysis.checks = portfolioChecks(analysis, positive)
  return analysis
}

function findOverlaps(holdings: Holding[]) {
  const byIndex = new Map<string, string[]>()
  for (const holding of holdings) {
    const tracks = knownFund(holding.symbol)?.tracks
    if (!tracks) continue
    byIndex.set(tracks, [...(byIndex.get(tracks) ?? []), holding.symbol])
  }
  const overlaps: { symbols: string[]; note: string }[] = []
  for (const [tracks, symbols] of byIndex) {
    if (symbols.length > 1) overlaps.push({ symbols, note: `These all follow the ${tracks}, so they hold the same companies. One is enough.` })
  }
  for (const pair of OVERLAPPING_INDEXES) {
    const a = byIndex.get(pair.a)
    const b = byIndex.get(pair.b)
    if (a && b) overlaps.push({ symbols: [...a, ...b], note: pair.note })
  }
  return overlaps
}

function portfolioChecks(analysis: PortfolioAnalysis, holdings: Holding[]): Check[] {
  const checks: Check[] = []
  const { largestSingleStock, cryptoShare, target, fees } = analysis

  if (largestSingleStock && largestSingleStock.share >= SINGLE_STOCK_ACT) {
    checks.push({
      id: "concentration",
      level: "act",
      title: `${pct(largestSingleStock.share)} in one company`,
      detail: `${largestSingleStock.symbol} is ${pct(largestSingleStock.share)} of your portfolio. If that one company has a bad year, so does your whole portfolio. Many people keep any single stock under about 10%.`,
    })
  } else if (largestSingleStock && largestSingleStock.share >= SINGLE_STOCK_WATCH) {
    checks.push({
      id: "concentration",
      level: "watch",
      title: `${largestSingleStock.symbol} is a big slice`,
      detail: `${largestSingleStock.symbol} is ${pct(largestSingleStock.share)} of your portfolio. That's a lot riding on one company; broad funds spread the same money across hundreds.`,
    })
  }

  if (holdings.some((holding) => holding.assetClass === "leveraged")) {
    checks.push({
      id: "leveraged",
      level: "act",
      title: "Leveraged or inverse fund",
      detail: "Leveraged and inverse funds reset every day, so over months they can lose money even when the index they follow goes up. They're built for short-term traders, not long-term investors.",
    })
  }

  if (cryptoShare >= CRYPTO_WATCH) {
    checks.push({
      id: "crypto",
      level: "watch",
      title: `${pct(cryptoShare)} in crypto`,
      detail: "Crypto can fall by more than half in a year. Only keep there what you could watch drop sharply without changing your plans.",
    })
  }

  if (target) {
    const range = `${target.range.min}-${target.range.max}%`
    if (target.status === "within") {
      checks.push({ id: "mix", level: "good", title: "Your mix matches your plan", detail: `${pct(analysis.stockShare)} in stocks, inside your ${range} range.` })
    } else {
      checks.push({
        id: "mix",
        level: "watch",
        title: target.status === "above" ? "More stocks than your plan" : "Fewer stocks than your plan",
        detail: `${pct(analysis.stockShare)} in stocks, ${target.driftPoints} points ${target.status} your ${range} range. You can steer back with where you put new money (see rebalancing).`,
      })
    }
  }

  if (fees.weightedPercent !== null) {
    if (fees.weightedPercent > 0.5) {
      checks.push({
        id: "fees",
        level: "watch",
        title: `Average fee ${fees.weightedPercent.toFixed(2)}% a year`,
        detail: `On today's balance that could cost about ${money(fees.thirtyYearCost ?? 0)} over 30 years (assuming 7% a year before fees, not guaranteed). Broad index funds often charge under 0.1%.`,
      })
    } else {
      checks.push({ id: "fees", level: "good", title: "Low fees", detail: `Your average fund fee is ${fees.weightedPercent.toFixed(2)}% a year.` })
    }
  }

  if (analysis.overlaps.length > 0) {
    checks.push({
      id: "overlap",
      level: "watch",
      title: "Funds that overlap",
      detail: analysis.overlaps[0].note,
    })
  }

  const hasIntl = holdings.some((holding) => holding.assetClass === "intl-stocks" || holding.assetClass === "global-stocks")
  if (analysis.stockShare > 0 && !hasIntl) {
    checks.push({
      id: "international",
      level: "watch",
      title: "No international stocks",
      detail: "All your stock money is in US companies. Many diversified portfolios hold some international stocks too, through a total-world or international index fund.",
    })
  }
  return checks
}

// ---------------------------------------------------------------------------------------------

export type RebalancePlan =
  | { needed: false; reason: string }
  | {
      needed: true
      /** Where new money should go to get back to the middle of the range, without selling. */
      addTo: "stocks" | "bonds-and-cash"
      amount: number
      targetStockPercent: number
      /** Selling instead brings it back immediately, but can mean taxes in a taxable account. */
      sellAmount: number
    }

/** How much new money, put on the underweight side, returns the mix to the middle of the range. */
export function rebalancePlan(analysis: PortfolioAnalysis): RebalancePlan {
  if (!analysis.target) return { needed: false, reason: "Set your time horizon and take the risk quiz to get a target mix." }
  if (analysis.target.status === "within") return { needed: false, reason: "Your mix is within your target range." }
  const mid = (analysis.target.range.min + analysis.target.range.max) / 2 / 100
  const total = analysis.total
  const stocks = analysis.stockShare * total
  if (analysis.target.status === "above") {
    // stocks / (total + add) = mid  →  add = stocks / mid - total
    const add = mid > 0 ? stocks / mid - total : Number.POSITIVE_INFINITY
    return {
      needed: true,
      addTo: "bonds-and-cash",
      amount: Number.isFinite(add) ? round(add, 2) : 0,
      targetStockPercent: round(mid * 100, 1),
      sellAmount: round(stocks - mid * total, 2),
    }
  }
  // (stocks + add) / (total + add) = mid  →  add = (mid·total − stocks) / (1 − mid)
  const add = mid < 1 ? (mid * total - stocks) / (1 - mid) : mid * total - stocks
  return {
    needed: true,
    addTo: "stocks",
    amount: round(add, 2),
    targetStockPercent: round(mid * 100, 1),
    sellAmount: round(mid * total - stocks, 2),
  }
}

// ---------------------------------------------------------------------------------------------

export type DollarSplit = { where: string; amount: number; why: string }

/**
 * Where the next `amount` dollars could go, following the roadmap: starter buffer, high-interest
 * debt, full emergency fund, then investing on whichever side of the target mix is underweight.
 * The employer match is a payroll setting rather than a destination for spare cash, so it comes
 * back as a note.
 */
export function nextDollars(amount: number, profile: InvestorProfile, analysis: PortfolioAnalysis | null) {
  const splits: DollarSplit[] = []
  const notes: string[] = []
  let left = Math.max(0, Math.min(amount, 10_000_000))
  const savings = profile.emergencySavings
  const essentials = profile.monthlyEssentials

  const give = (where: string, cap: number, why: string) => {
    const put = Math.min(left, Math.max(0, cap))
    if (put <= 0) return
    splits.push({ where, amount: round(put, 2), why })
    left = round(left - put, 2)
  }

  if (savings === null) notes.push("Add your emergency savings to your plan so this can check your cash buffer first.")
  const starter = essentials !== null && essentials > 0 ? essentials : 1000
  let saved = savings ?? 0
  if (savings !== null) {
    const before = left
    give("Emergency savings (starter buffer)", starter - saved, `A cash buffer of about ${money(starter)} stops a surprise bill from becoming debt.`)
    saved += before - left
  }

  for (const debt of highInterestDebts(profile)) {
    give(`Extra payment on ${debt.name}`, debt.balance, `At ${debt.aprPercent}% a year, every dollar paid off "earns" that rate, more than investing is likely to return.`)
  }

  if (profile.employerMatch === "missing") {
    notes.push("Separately, raise your workplace retirement contribution to get your full employer match. It comes out of your paycheck, so it isn't part of this amount.")
  } else if (profile.employerMatch === "unsure") {
    notes.push("Check whether your employer matches retirement contributions. If they do, getting the full match usually comes before anything else here.")
  }

  if (savings !== null && essentials !== null && essentials > 0) {
    give("Emergency savings (toward 3 months)", essentials * FULL_FUND_MONTHS - saved, `Three to six months of essentials (${money(essentials * FULL_FUND_MONTHS)}+) covers a job loss without selling investments.`)
  }

  if (left > 0) {
    if (analysis?.target && analysis.target.status !== "within") {
      const rebalance = rebalancePlan(analysis)
      if (rebalance.needed) {
        const toUnderweight = rebalance.addTo === "stocks" ? "Diversified stock index fund" : "Bond fund or cash"
        give(toUnderweight, rebalance.amount, `Your mix is ${analysis.target.status} your target, so adding here steers it back without selling anything.`)
      }
    }
    if (left > 0) {
      const range = analysis?.target?.range
      const stockShare = range ? (range.min + range.max) / 2 / 100 : null
      if (stockShare === null) {
        give("Long-term investing", left, "Take the risk quiz and set your time horizon to see how to split this between stocks and bonds.")
      } else {
        const stocks = round(left * stockShare, 2)
        const rest = round(left - stocks, 2)
        if (stocks > 0) splits.push({ where: "Diversified stock index fund", amount: stocks, why: `Matches the ${Math.round(stockShare * 100)}% stock middle of your target range.` })
        if (rest > 0) splits.push({ where: "Bond fund or cash", amount: rest, why: "The steadier part of your target mix." })
        left = 0
      }
    }
  }

  const where = profile.country.trim() && !/^(us|usa|united states)/i.test(profile.country.trim()) ? "your country's tax-advantaged accounts" : "a tax-advantaged account (such as an IRA or 401(k)) before a regular brokerage account"
  if (splits.some((split) => /index fund|Bond fund|investing/.test(split.where))) {
    notes.push(`For the investing part, ${where} usually comes first.`)
  }
  if (highInterestDebts(profile).length === 0 && profile.debts.some((debt) => debt.aprPercent > 0 && debt.aprPercent < HIGH_INTEREST_APR)) {
    notes.push(`Your other debts charge under ${HIGH_INTEREST_APR}% a year, so keeping up regular payments while investing is a common choice.`)
  }
  return { amount: round(amount, 2), splits, notes }
}

// ---------------------------------------------------------------------------------------------

/** Roughly what a fall in stock prices would do to this portfolio: stock-like holdings fall, steadier ones don't. */
export function stressTest(analysis: PortfolioAnalysis, stockDropPercent: number) {
  const drop = Math.min(90, Math.max(0, Number.isFinite(stockDropPercent) ? stockDropPercent : 0)) / 100
  const exposed = (analysis.stockShare + analysis.cryptoShare) * analysis.total
  const loss = round(exposed * drop, 2)
  return {
    stockDropPercent: round(drop * 100, 1),
    portfolioDropPercent: round((loss / analysis.total) * 100, 1),
    loss,
    valueAfter: round(analysis.total - loss, 2),
    caveat: "A simplification: assumes every stock-like and crypto holding falls by the same percentage and bonds and cash hold steady. Individual stocks and crypto often fall further.",
  }
}

