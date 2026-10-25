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
    label: "US stock market",
    sublabel: "S&P 500: 500 large US companies",
    candidates: ["SPY", "VOO", "IVV", "^GSPC"],
    explainer: "The usual yardstick for US stocks, and what most broad index funds hold.",
  },
  {
    id: "world-stocks",
    label: "World stock market",
    sublabel: "Thousands of companies in dozens of countries",
    candidates: ["VT", "ACWI", "URTH"],
    explainer: "Spreads money across the US and the rest of the world.",
  },
  {
    id: "tech",
    label: "Big tech",
    sublabel: "Nasdaq-100: largest non-financial Nasdaq companies",
    candidates: ["QQQ", "QQQM", "^NDX"],
    explainer: "Heavier in a few giant tech companies, so it tends to swing more.",
  },
  {
    id: "bonds",
    label: "US bonds",
    sublabel: "Loans to the US government and companies",
    candidates: ["BND", "AGG", "IEF"],
    explainer: "Usually steadier than stocks, which is why mixes hold some.",
  },
  {
    id: "bitcoin",
    label: "Bitcoin",
    sublabel: "A cryptocurrency, for comparison",
    candidates: ["BTCUSD"],
    explainer: "Shown for contrast: far bigger swings than a broad stock fund.",
  },
] as const

export type MarketId = (typeof MARKET_LINEUP)[number]["id"]

export const RANGES = {
  "1M": { label: "1 month", days: 31 },
  "6M": { label: "6 months", days: 183 },
  "1Y": { label: "1 year", days: 366 },
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

/** A one-line, calm reading of a summary for someone investing for the long run. */
export function plainEnglish(label: string, summary: SeriesSummary, rangeLabel: string): string {
  const pct = (value: number) => `${Math.round(Math.abs(value) * 1000) / 10}%`
  const direction = summary.change >= 0 ? `up ${pct(summary.change)}` : `down ${pct(summary.change)}`
  const position =
    summary.belowHigh < 0.005
      ? "and at or near its high for the period"
      : `and ${pct(summary.belowHigh)} below its high for the period`
  const dip =
    summary.maxDrop.fall >= 0.05
      ? ` Along the way it fell as much as ${pct(summary.maxDrop.fall)} from a peak before recovering some or all of it.`
      : ""
  return `${label} is ${direction} over the last ${rangeLabel}, ${position}.${dip}`
}
