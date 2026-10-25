// What the user holds, as they enter it on the Portfolio page. Values are in dollars as of
// `valueAsOf`; shares are optional and let live prices refresh the value. Pure and tested.

import { ASSET_CLASSES, knownFund, normalizeSymbol, type AssetClass } from "./funds.ts"

export type Holding = {
  id: string
  /** Ticker or short name, e.g. VOO or "Savings". */
  symbol: string
  name: string
  assetClass: AssetClass
  /** Current value in dollars. */
  value: number
  shares: number | null
  /** Yearly fund fee as a percentage (0.03 for 0.03%), when the user knows it. */
  expenseRatioPercent: number | null
  /** When the value was last set or refreshed (ISO). */
  valueAsOf: string
}

export type Portfolio = { updatedAt: string; holdings: Holding[] }

export const EMPTY_PORTFOLIO: Portfolio = { updatedAt: "", holdings: [] }
export const MAX_HOLDINGS = 40
/** Most symbols one "Refresh prices" request looks up (each is counted against the market data limit). */
export const MAX_QUOTE_SYMBOLS = 15

const ID_PATTERN = /^[a-z0-9-]{1,40}$/

function num(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  return Math.min(max, Math.max(min, value))
}

export function parseHolding(raw: unknown): Holding | null {
  if (typeof raw !== "object" || raw === null) return null
  const record = raw as Record<string, unknown>
  const symbol = normalizeSymbol(record.symbol)
  const value = num(record.value, 0, 100_000_000)
  if (!symbol || value === null) return null
  const assetClass =
    typeof record.assetClass === "string" && Object.hasOwn(ASSET_CLASSES, record.assetClass)
      ? (record.assetClass as AssetClass)
      : (knownFund(symbol)?.assetClass ?? "other")
  return {
    id: typeof record.id === "string" && ID_PATTERN.test(record.id) ? record.id : `h-${symbol.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
    symbol,
    name: typeof record.name === "string" ? record.name.trim().slice(0, 80) : (knownFund(symbol)?.name ?? ""),
    assetClass,
    value,
    shares: num(record.shares, 0, 1_000_000_000),
    expenseRatioPercent: num(record.expenseRatioPercent, 0, 5),
    valueAsOf: typeof record.valueAsOf === "string" && record.valueAsOf.length <= 40 ? record.valueAsOf : "",
  }
}

export function parsePortfolio(raw: unknown): Portfolio | null {
  if (typeof raw !== "object" || raw === null) return null
  const record = raw as Record<string, unknown>
  const holdings = (Array.isArray(record.holdings) ? record.holdings : [])
    .slice(0, MAX_HOLDINGS)
    .map(parseHolding)
    .filter((holding): holding is Holding => holding !== null)
  // Ids must be unique for the editor; repeat ids get a suffix.
  const seen = new Set<string>()
  for (const holding of holdings) {
    let id = holding.id
    for (let n = 2; seen.has(id); n++) id = `${holding.id}-${n}`.slice(0, 40)
    holding.id = id
    seen.add(id)
  }
  return {
    updatedAt: typeof record.updatedAt === "string" && record.updatedAt.length <= 40 ? record.updatedAt : "",
    holdings,
  }
}
