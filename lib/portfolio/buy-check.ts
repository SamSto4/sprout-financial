// "Before you buy": a checklist for someone thinking about buying a specific investment.
// It never says buy or don't buy. It lays out what the thing is, how much of their money it would
// be, how bumpy it has been, and whether their foundations are in place, then lists the questions
// worth asking. Pure and tested; market facts are passed in (from Financial Modeling Prep when
// configured) and may be missing.

import { STOCK_LIKE, knownFund, type AssetClass } from "./funds.ts"
import type { Holding } from "./holdings.ts"
import type { Roadmap } from "../plan/roadmap.ts"
import type { CheckLevel } from "./analyze.ts"

export type InstrumentFacts = {
  symbol: string
  found: boolean
  name?: string
  isEtf?: boolean
  isFund?: boolean
  /** How much it has moved compared with the whole market (1 = the same). */
  beta?: number
  price?: number
  yearLow?: number
  yearHigh?: number
  sector?: string
  /** Where the facts came from and how fresh they are, for the reply to cite. */
  source?: string
  asOf?: string
}

export type BuyCheckItem = { id: string; level: CheckLevel; title: string; detail: string }

export type BuyCheck = {
  symbol: string
  kind: "broad-fund" | "narrow-fund" | "single-stock" | "crypto" | "leveraged" | "unknown"
  kindLabel: string
  amount: number
  /** Share of the portfolio this purchase would be, counting holdings already owned. Null without a portfolio. */
  shareAfter: number | null
  items: BuyCheckItem[]
  questions: string[]
}

const KIND_LABELS: Record<BuyCheck["kind"], string> = {
  "broad-fund": "A broad index fund: one purchase spreads money across many companies.",
  "narrow-fund": "A fund focused on one sector, theme or style: diversified within that slice only.",
  "single-stock": "A single company's stock: its price depends on how that one business does.",
  crypto: "A cryptocurrency or crypto fund: no earnings or dividends behind it, and very large price swings.",
  leveraged: "A leveraged or inverse fund: built for day traders, and can lose value over time even when its index rises.",
  unknown: "Sprout doesn't have details on this symbol. If it's a single company's stock, its price depends on how that one business does. Double-check the ticker and look up what it is.",
}

function pct(share: number) {
  return `${Math.round(share * 100)}%`
}

function classify(facts: InstrumentFacts): { kind: BuyCheck["kind"]; assetClass: AssetClass | null } {
  const known = knownFund(facts.symbol)
  if (known) {
    if (known.assetClass === "leveraged") return { kind: "leveraged", assetClass: "leveraged" }
    if (known.assetClass === "crypto") return { kind: "crypto", assetClass: "crypto" }
    return { kind: known.broad ? "broad-fund" : "narrow-fund", assetClass: known.assetClass }
  }
  if (/-?USD$/.test(facts.symbol) && facts.symbol.length > 3) return { kind: "crypto", assetClass: "crypto" }
  if (!facts.found) return { kind: "unknown", assetClass: null }
  if (facts.isEtf || facts.isFund) {
    if (/\b(2x|3x|ultra|leveraged|inverse|bear|bull)\b/i.test(facts.name ?? "")) return { kind: "leveraged", assetClass: "leveraged" }
    return { kind: "narrow-fund", assetClass: "other" }
  }
  return { kind: "single-stock", assetClass: "single-stock" }
}

export function beforeYouBuy(input: {
  facts: InstrumentFacts
  amount: number
  holdings: Holding[]
  roadmap: Roadmap | null
  emergencySavings: number | null
}): BuyCheck {
  const { facts, holdings, roadmap } = input
  const amount = Math.max(0, Math.min(input.amount, 100_000_000))
  const { kind } = classify(facts)
  const items: BuyCheckItem[] = []

  // 1. Foundations first.
  if (roadmap?.current && ["starter-buffer", "high-interest-debt"].includes(roadmap.current.id)) {
    items.push({
      id: "foundation",
      level: "act",
      title: "Foundations aren't in place yet",
      detail: `Your plan's current step is "${roadmap.current.title}". ${roadmap.current.detail} Money put there first is usually worth more than any investment's expected return.`,
    })
  } else if (roadmap) {
    items.push({ id: "foundation", level: "good", title: "Foundations in place", detail: "Your cash buffer and high-interest debt steps are done." })
  }

  // 2. How big a slice.
  const total = holdings.reduce((sum, holding) => sum + Math.max(0, holding.value), 0)
  const existing = holdings.filter((holding) => holding.symbol === facts.symbol).reduce((sum, holding) => sum + holding.value, 0)
  const shareAfter = total + amount > 0 && holdings.length > 0 ? (existing + amount) / (total + amount) : null
  if (shareAfter !== null) {
    // Anything not known to be a broad fund is treated as a concentrated bet for sizing.
    const concentrated = kind !== "broad-fund"
    const level: CheckLevel = concentrated && shareAfter >= 0.2 ? "act" : concentrated && shareAfter >= 0.1 ? "watch" : "good"
    items.push({
      id: "size",
      level,
      title: `Would be ${pct(shareAfter)} of your portfolio`,
      detail:
        level === "good"
          ? `${facts.symbol} would make up ${pct(shareAfter)} of your investments.`
          : `${facts.symbol} would make up ${pct(shareAfter)} of your investments. Many people cap any one stock or narrow bet at around 5-10% so one bad outcome can't sink the whole plan.`,
    })
  }

  // 3. What it is.
  items.push({
    id: "kind",
    level: kind === "broad-fund" ? "good" : kind === "leveraged" ? "act" : kind === "unknown" ? "watch" : "watch",
    title: facts.name ? `${facts.symbol}: ${facts.name}` : facts.symbol,
    detail: KIND_LABELS[kind],
  })

  // 4. How bumpy it has been.
  if (facts.yearLow && facts.yearHigh && facts.yearLow > 0) {
    const swing = (facts.yearHigh - facts.yearLow) / facts.yearLow
    items.push({
      id: "swings",
      level: swing >= 0.6 ? "act" : swing >= 0.3 ? "watch" : "good",
      title: `Moved ${pct(swing)} between its low and high this year`,
      detail: `Over the past 52 weeks it traded between $${facts.yearLow.toFixed(2)} and $${facts.yearHigh.toFixed(2)}. Could you hold on if it dropped back to the low the week after you bought?`,
    })
  }
  if (typeof facts.beta === "number" && Number.isFinite(facts.beta)) {
    items.push({
      id: "beta",
      level: facts.beta >= 1.5 ? "watch" : "good",
      title: `Beta ${facts.beta.toFixed(2)}`,
      detail:
        facts.beta >= 1.5
          ? `It has tended to move about ${facts.beta.toFixed(1)} times as much as the overall market, in both directions.`
          : "It has moved roughly in line with the overall market or less.",
    })
  }

  // 5. Speculative money.
  if (kind === "crypto" || kind === "leveraged") {
    const cryptoNow = holdings.filter((holding) => holding.assetClass === "crypto" || holding.assetClass === "leveraged").reduce((s, h) => s + h.value, 0)
    items.push({
      id: "speculative",
      level: "watch",
      title: "Treat it as speculation",
      detail: `Only use money you could lose most of without it changing your plans.${cryptoNow > 0 ? ` You already hold $${Math.round(cryptoNow).toLocaleString("en-US")} in similar holdings.` : ""}`,
    })
  }

  // 6. A diversified alternative already owned.
  const ownsBroad = holdings.some((holding) => knownFund(holding.symbol)?.broad && STOCK_LIKE.has(holding.assetClass))
  if (kind === "single-stock" && ownsBroad) {
    items.push({
      id: "already-own",
      level: "good",
      title: "You may already own it",
      detail: "Your broad index fund probably already holds this company (if it's a large US company), alongside hundreds of others.",
    })
  }

  const questions = [
    "Why do I want this, in one sentence? Would that reason still hold if the price fell 30%?",
    kind === "single-stock" ? "What does the company actually sell, and how does it make money?" : "What exactly does it hold, and what does it charge each year (expense ratio)?",
    "How long am I planning to keep it, and what would make me sell?",
    "Did I hear about it from someone who benefits if I buy (an influencer, a group chat, a 'signal' seller)?",
  ]

  return { symbol: facts.symbol, kind, kindLabel: KIND_LABELS[kind], amount, shareAfter: shareAfter === null ? null : Math.round(shareAfter * 1000) / 1000, items, questions }
}
