// Price history for the Portfolio page's "Markets, explained" section: which markets to show,
// and the plain-English numbers worked out from their daily closes (change over a period,
// distance from the high, the deepest fall, how bumpy the ride was). Pure and tested; the prices
// themselves come from Financial Modeling Prep (lib/market/fmp.ts).

export type PricePoint = { date: string; close: number }

/**
 * The markets shown, in order. Each lists symbols to try in turn, because market data plans
 * differ in which funds and indexes they cover; the first one with data is used.
 */
export const MARKET_LINEUP = [
  {
    id: "us-stocks",
    name: "the US stock market",
    label: "US stock market",
    sublabel: "S&P 500: 500 large US companies",
    candidates: ["SPY", "VOO", "IVV", "^GSPC"],
    explainer: "The usual yardstick for US stocks, and what most broad index funds hold.",
  },
  {
    id: "world-stocks",
    name: "the world stock market",
    label: "World stock market",
    sublabel: "Thousands of companies in dozens of countries",
    candidates: ["VT", "ACWI", "URTH"],
    explainer: "Spreads money across the US and the rest of the world.",
  },
  {
    id: "tech",
    name: "big tech (the Nasdaq-100)",
    label: "Big tech",
    sublabel: "Nasdaq-100: largest non-financial Nasdaq companies",
    candidates: ["QQQ", "QQQM", "^NDX"],
    explainer: "Heavier in a few giant tech companies, so it tends to swing more.",
  },
  {
    id: "bonds",
    name: "US bonds",
    label: "US bonds",
    sublabel: "Loans to the US government and companies",
    candidates: ["BND", "AGG", "IEF"],
    explainer: "Usually steadier than stocks, which is why mixes hold some.",
  },
  {
    id: "bitcoin",
    name: "bitcoin",
    label: "Bitcoin",
    sublabel: "A cryptocurrency, for comparison",
    candidates: ["BTCUSD"],
    explainer: "Shown for contrast: far bigger swings than a broad stock fund.",
  },
] as const

export type MarketId = (typeof MARKET_LINEUP)[number]["id"]

/**
 * Market data lookups one GET /api/market/history makes when the first symbol of each market
 * works (more when a plan doesn't cover one), and what it's charged against the market data limit.
 */
export const HISTORY_LOOKUPS = MARKET_LINEUP.length

/**
 * One market's closes: the first candidate symbol with at least two. A symbol the plan doesn't
 * cover moves on to the next one. A temporary failure (a timeout, the service's request limit, an
 * outage) ends the search instead: the next symbol would most likely fail the same way, and each
 * try uses up the plan's quota. `temporary` says the gap may be gone in a few minutes.
 */
export async function firstWithHistory(
  candidates: readonly string[],
  load: (symbol: string) => Promise<PricePoint[]>,
  isTemporary: (error: unknown) => boolean
): Promise<{ symbol: string; points: PricePoint[]; temporary: boolean }> {
  for (const symbol of candidates) {
    try {
      const points = await load(symbol)
      if (points.length >= 2) return { symbol, points, temporary: false }
    } catch (error) {
      if (isTemporary(error)) return { symbol: "", points: [], temporary: true }
    }
  }
  return { symbol: "", points: [], temporary: false }
}

/**
 * How long the CDN may keep a history answer. A complete one, or one missing only markets the plan
 * doesn't cover, is kept for an hour. One missing a market because of a temporary failure is kept
 * for five minutes, so a short hiccup doesn't hide that market from every visitor for an hour.
 */
export function historyCacheControl(temporaryGaps: number): string {
  return temporaryGaps > 0 ? "public, s-maxage=300, stale-while-revalidate=600" : "public, s-maxage=3600, stale-while-revalidate=86400"
}

/** `label` reads after "the last": "the last month", "the last 5 years". */
export const RANGES = {
  "1M": { label: "month", days: 31 },
  "6M": { label: "6 months", days: 183 },
  "1Y": { label: "year", days: 366 },
  "5Y": { label: "5 years", days: 1827 },
} as const
export type RangeKey = keyof typeof RANGES

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** Turns a market data response into sorted, de-duplicated closes. Bad rows are dropped. */
export function parsePriceHistory(raw: unknown): PricePoint[] {
  const rows = Array.isArray(raw)
    ? raw
    : typeof raw === "object" && raw !== null && Array.isArray((raw as { historical?: unknown }).historical)
      ? (raw as { historical: unknown[] }).historical
      : []
  const byDate = new Map<string, number>()
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue
    const { date, close, price } = row as { date?: unknown; close?: unknown; price?: unknown }
    const value = typeof close === "number" ? close : price
    if (typeof date !== "string" || typeof value !== "number" || !Number.isFinite(value) || value <= 0) continue
    const day = date.slice(0, 10)
    if (DATE_PATTERN.test(day)) byDate.set(day, value)
  }
  return [...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([date, close]) => ({ date, close }))
}

/** The points within `days` of the last point. */
export function sliceRange(points: PricePoint[], range: RangeKey): PricePoint[] {
  if (points.length === 0) return []
  const last = Date.parse(`${points[points.length - 1].date}T00:00:00Z`)
  const cutoff = last - RANGES[range].days * 86_400_000
  return points.filter((point) => Date.parse(`${point.date}T00:00:00Z`) >= cutoff)
}

/** Keeps at most `max` points, evenly spaced, always including the first and last. */
export function thin(points: PricePoint[], max: number): PricePoint[] {
  if (points.length <= max || max < 2) return points
  const step = (points.length - 1) / (max - 1)
  return Array.from({ length: max }, (_, index) => points[Math.round(index * step)])
}

export type SeriesSummary = {
  start: PricePoint
  end: PricePoint
  /** Change from the first to the last close, as a fraction (0.12 = +12%). */
  change: number
  high: PricePoint
  /** How far the last close is below the period's high, as a fraction (0 at a new high). */
  belowHigh: number
  /** The deepest peak-to-low fall within the period, as a positive fraction, with its dates. */
  maxDrop: { fall: number; peak: string; low: string }
  /** Typical yearly swing: standard deviation of daily returns, annualised (√252). */
  volatility: number | null
  /** What $1,000 at the start would be worth at the end. */
  thousandBecomes: number
}

function round(value: number, digits = 4) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function summarize(points: PricePoint[]): SeriesSummary | null {
  if (points.length < 2) return null
  const start = points[0]
  const end = points[points.length - 1]
  let high = start
  let peak = start
  let maxDrop = { fall: 0, peak: start.date, low: start.date }
  for (const point of points) {
    if (point.close > high.close) high = point
    if (point.close > peak.close) peak = point
    const fall = 1 - point.close / peak.close
    if (fall > maxDrop.fall) maxDrop = { fall, peak: peak.date, low: point.date }
  }
  const returns: number[] = []
  for (let index = 1; index < points.length; index++) returns.push(points[index].close / points[index - 1].close - 1)
  let volatility: number | null = null
  if (returns.length >= 10) {
    const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length
    const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1)
    volatility = round(Math.sqrt(variance) * Math.sqrt(252))
  }
  return {
    start,
    end,
    change: round(end.close / start.close - 1),
    high,
    belowHigh: round(1 - end.close / high.close),
    maxDrop: { ...maxDrop, fall: round(maxDrop.fall) },
    volatility,
    thousandBecomes: round((1000 * end.close) / start.close, 2),
  }
}

/** Each series rebased so it starts at 1,000, for comparing markets on one chart. */
export function rebase(points: PricePoint[], base = 1000): { date: string; value: number }[] {
  if (points.length === 0) return []
  const first = points[0].close
  return points.map((point) => ({ date: point.date, value: round((point.close / first) * base, 2) }))
}

/** A calm reading of a summary for someone investing for the long run. `name` is a sentence-case name such as "the US stock market". */
export function plainEnglish(name: string, summary: SeriesSummary, rangeLabel: string): string {
  const pct = (value: number) => `${Math.round(Math.abs(value) * 1000) / 10}%`
  const moved = summary.change >= 0 ? `rose ${pct(summary.change)}` : `fell ${pct(summary.change)}`
  const position =
    summary.belowHigh < 0.005 ? "It's at or near its high for the period." : `It's now ${pct(summary.belowHigh)} below its high for the period.`
  const dip =
    summary.maxDrop.fall >= 0.05 ? ` Along the way it dropped as much as ${pct(summary.maxDrop.fall)} from a peak.` : ""
  return `Over the last ${rangeLabel}, ${name} ${moved}. ${position}${dip}`
}
