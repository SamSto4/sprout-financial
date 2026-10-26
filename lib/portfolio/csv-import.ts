// Turns a brokerage "positions" CSV export into holdings for the Portfolio page.
// Exports differ a lot between brokerages (Fidelity, Schwab, Vanguard, E*TRADE...), so the header
// row is found by its column names, and money is read whatever way it's written.
// Runs in the browser: the file is never uploaded just to be read. Pure and tested.

import { MAX_CSV_BYTES, parseCsv } from "../finance/csv.ts"
import { knownFund, normalizeSymbol, type AssetClass } from "./funds.ts"
import { MAX_HOLDINGS, parseHolding, type Holding } from "./holdings.ts"

export { MAX_CSV_BYTES }

/** A holding read from a file, before it's given an id and saved. */
export type ImportedHolding = {
  symbol: string
  name: string
  assetClass: AssetClass
  value: number
  shares: number | null
}

/** Why rows were left out, so the preview can say so. */
export type SkippedRows = {
  /** Account totals and subtotals. */
  totals: number
  /** "Pending activity" lines. */
  pending: number
  /** Options, bonds without a ticker, and anything else without a usable symbol. */
  noSymbol: number
  /** Short positions and margin balances. */
  negative: number
  /** No value, and no shares to work one out from. */
  noValue: number
  /** Values or share counts too large to be real (over $100 million, or not a finite number). */
  outOfRange: number
}

export type HoldingsImport =
  | {
      ok: true
      holdings: ImportedHolding[]
      skipped: SkippedRows
      /** Holdings left out because there were more than MAX_HOLDINGS (the smallest go first). */
      dropped: number
      /** How many holdings have shares but no value yet (Refresh prices fills them in). */
      needPrices: number
      /** Same symbol in several accounts, added together. */
      combined: number
      /** The header names that were read, for the preview. */
      columns: { symbol: string; value: string | null; quantity: string | null; price: string | null }
    }
  | { ok: false; error: string }

type Role = "symbol" | "name" | "quantity" | "price" | "value" | "securityType"

// Header names in common exports, normalized (lower case, punctuation as spaces). Most specific first.
const HEADER_NAMES: Record<Role, string[]> = {
  symbol: ["symbol", "ticker", "ticker symbol", "security symbol", "symbol cusip", "fund symbol", "stock symbol"],
  name: ["description", "investment name", "security name", "security description", "fund name", "name", "company name", "holding name", "asset name"],
  quantity: ["quantity", "qty quantity", "qty", "shares", "share quantity", "shares held", "units", "quantity shares"],
  price: ["last price", "price", "share price", "current price", "market price", "last", "closing price", "nav"],
  value: ["current value", "market value", "mkt val market value", "mkt val", "total value", "value", "position value", "current market value", "ending value", "market value usd"],
  // Only columns that describe the investment. Fidelity's plain "Type" is the account type (Cash/Margin).
  securityType: ["security type", "asset type", "asset class", "investment type", "product type", "asset category"],
}

// Looser matches, for header names not in the lists above.
const HEADER_WORDS: Partial<Record<Role, { has: RegExp; not?: RegExp }>> = {
  symbol: { has: /\b(symbol|ticker)\b/ },
  quantity: { has: /\b(quantity|qty|shares)\b/, not: /\b(price|value|change|chng)\b/ },
  price: { has: /\bprice\b/, not: /\b(change|chng|paid|cost|avg|average|purchase)\b/ },
  value: { has: /\b(value|val)\b/, not: /\b(change|chng|gain|loss|percent|pct|cost|basis|day)\b/ },
}

/** A second header in the same file (Vanguard puts transactions after positions) ends the positions. */
const OTHER_SECTION = /^(trade date|settlement date|transaction type|transaction date|run date)$/

type ColumnMap = Partial<Record<Role, number>>

function normalizeHeader(header: string) {
  return header.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

/** Matches header cells to roles. Null unless there's a symbol and either a value or a quantity. */
export function detectHoldingsColumns(headers: string[]): ColumnMap | null {
  const normalized = headers.map(normalizeHeader)
  const used = new Set<number>()
  const columns: ColumnMap = {}
  const roles: Role[] = ["symbol", "value", "quantity", "price", "securityType", "name"]

  for (const role of roles) {
    for (const name of HEADER_NAMES[role]) {
      const index = normalized.findIndex((header, i) => header === name && !used.has(i))
      if (index !== -1) {
        columns[role] = index
        used.add(index)
        break
      }
    }
  }
  for (const role of roles) {
    const words = HEADER_WORDS[role]
    if (columns[role] !== undefined || !words) continue
    const index = normalized.findIndex((header, i) => !used.has(i) && words.has.test(header) && !words.not?.test(header))
    if (index !== -1) {
      columns[role] = index
      used.add(index)
    }
  }

  if (columns.symbol === undefined || (columns.value === undefined && columns.quantity === undefined)) return null
  return columns
}

/**
 * Reads numbers the way brokerages write them: "$1,234.56", "+$12.34", "(45.00)", "-3", "1.234,56",
 * "12.5%". Placeholders like "--", "n/a" and blanks are null. Keeps full precision (shares can
 * have six decimals).
 */
export function parseNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null
  // Spaces removed first: the sign checks below then run in linear time on any input. (A pattern
  // with two \s* in a row took seconds on a cell of spaces, which froze the tab: ReDoS, CWE-1333.)
  let text = raw.replace(/\s+/g, "")
  if (!/\d/.test(text)) return null
  // Scientific notation ("1E5") isn't how brokerages write money; reading it digit by digit would be wrong.
  if (/e/i.test(text)) return null
  const negative = /^\(.*\)$/.test(text) || /^\+?[$€£]?-/.test(text)
  text = text.replace(/[^\d.,]/g, "")
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(text)) text = text.replace(/,/g, "")
  else if (/^\d{1,3}(\.\d{3})+,\d+$/.test(text)) text = text.replace(/\./g, "").replace(",", ".")
  else if (/^\d+,\d+$/.test(text)) text = text.replace(",", ".")
  else if (text.includes(",")) return null
  const value = Number(text)
  if (!Number.isFinite(value) || text === "") return null
  return negative ? -value : value
}

const TOTAL_ROW = /^(account\s+)?(grand\s+)?totals?\b|^total\s+(account|portfolio|value)/i
const PENDING_ROW = /pending activity|pending/i
const CASH_ROW = /^(cash|cash & cash investments|cash and cash investments|cash & sweep|money market|core position|held in money market|sweep)\b/i

/** Asset class from a "Security type" column, when the fund itself isn't one Sprout knows. */
function classFromType(type: string): AssetClass | null {
  const text = type.toLowerCase()
  if (/cash|money market|sweep/.test(text)) return "cash"
  if (/bond|fixed income|treasur|\bcds?\b|certificate of deposit/.test(text)) return "bonds"
  if (/crypto|digital asset/.test(text)) return "crypto"
  if (/reit|real estate/.test(text)) return "real-estate"
  if (/equity|equities|stock|common|adr/.test(text) && !/fund|etf/.test(text)) return "single-stock"
  return null
}

const FUND_NAME = /\b(fund|funds|etf|index|idx|trust|portfolio|ishares|spdr|admiral|adm|investor|instl|institutional|money market)\b/i
const COMPANY_NAME = /\b(inc|incorporated|corp|corporation|co|company|ltd|limited|plc|holdings?|group|n\.?v|s\.?a|ag|se|sponsored adr|adr|class [a-c]|cl [a-c])\.?$/i

/**
 * When the file doesn't say what a holding is, its name usually does: "APPLE INC" is a company,
 * "FIDELITY 500 INDEX FUND" is a fund (left as "other" so the user picks the right fund type).
 */
function classFromName(name: string): AssetClass | null {
  const text = name.trim()
  if (!text || FUND_NAME.test(text)) return null
  return COMPANY_NAME.test(text) ? "single-stock" : null
}

/** The same bounds as parseHolding in holdings.ts. */
const MAX_VALUE = 100_000_000
const MAX_SHARES = 1_000_000_000

const round = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places

/** Reads a positions export. Never throws: unreadable files come back as { ok: false, error }. */
export function importHoldingsFromCsv(text: string): HoldingsImport {
  if (text.length > MAX_CSV_BYTES) return { ok: false, error: "That file is over 2 MB. Export just your positions and try again." }
  const rows = parseCsv(text)
  if (rows.length === 0) return { ok: false, error: "That file is empty." }

  // Many exports start with a title line or account summary, so look for the header in the first rows.
  let headerIndex = -1
  let columns: ColumnMap | null = null
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    columns = detectHoldingsColumns(rows[i])
    if (columns) {
      headerIndex = i
      break
    }
  }
  if (!columns) {
    const looksLikeTransactions = rows.slice(0, 30).some((row) => row.some((cell) => /^(trade date|transaction date|run date|date)$/.test(normalizeHeader(cell))))
    return {
      ok: false,
      error: looksLikeTransactions
        ? "This looks like a transaction history. Export your positions (sometimes called holdings) instead."
        : "Couldn't find a Symbol column with a Value or Quantity column. Export your positions from your brokerage as a CSV file.",
    }
  }

  const headers = rows[headerIndex]
  const cell = (row: string[], role: Role) => (columns![role] === undefined ? "" : (row[columns![role]!] ?? "").trim())
  const positions: HoldingRow[] = []
  for (const row of rows.slice(headerIndex + 1)) {
    if (row.some((value) => OTHER_SECTION.test(normalizeHeader(value)))) break
    positions.push({
      symbol: cell(row, "symbol"),
      name: cell(row, "name"),
      quantity: parseNumber(cell(row, "quantity")),
      price: parseNumber(cell(row, "price")),
      value: parseNumber(cell(row, "value")),
      securityType: cell(row, "securityType"),
    })
  }

  const collected = collectHoldings(positions)
  if (collected.holdings.length === 0) return { ok: false, error: "No holdings found in that file. Check that it's a positions export with at least one investment." }
  return {
    ok: true,
    ...collected,
    columns: {
      symbol: headers[columns.symbol!].trim(),
      value: columns.value === undefined ? null : headers[columns.value].trim(),
      quantity: columns.quantity === undefined ? null : headers[columns.quantity].trim(),
      price: columns.price === undefined ? null : headers[columns.price].trim(),
    },
  }
}

/** One position as read from a file or a screenshot, before any of the rules below. */
export type HoldingRow = {
  symbol: string
  name: string
  quantity: number | null
  price: number | null
  value: number | null
  /** What the source says the investment is ("Equity", "ETF", "Money market"), or "". */
  securityType: string
}

export type CollectedHoldings = Omit<Extract<HoldingsImport, { ok: true }>, "ok" | "columns">

/**
 * Turns positions into holdings: skips totals, pending activity, options and short positions,
 * files cash lines as CASH, works out a value from shares and price, guesses each asset class,
 * adds the same symbol together (one fund held in two accounts), and keeps the MAX_HOLDINGS largest.
 * Shared by the CSV import and the screenshot import (lib/screenshots/holding-rows.ts).
 */
export function collectHoldings(rows: HoldingRow[]): CollectedHoldings {
  const skipped: SkippedRows = { totals: 0, pending: 0, noSymbol: 0, negative: 0, noValue: 0, outOfRange: 0 }
  const bySymbol = new Map<string, ImportedHolding & { count: number; sharesKnown: boolean; valueMissing: boolean }>()

  for (const row of rows) {
    const rawSymbol = row.symbol.trim()
    const description = row.name.trim()
    const label = `${rawSymbol} ${description}`.trim()
    if (!label) continue
    // A fund can be named "Total Stock Mkt Idx" (Vanguard), so a description only marks a total
    // when the row has no ticker of its own.
    const hasTicker = normalizeSymbol(rawSymbol.replace(/\*+$/, "")) !== null
    if (TOTAL_ROW.test(rawSymbol) || (!hasTicker && TOTAL_ROW.test(description))) {
      skipped.totals++
      continue
    }
    if (PENDING_ROW.test(rawSymbol) || (!rawSymbol && PENDING_ROW.test(description))) {
      skipped.pending++
      continue
    }

    // Fidelity marks its cash ("core") position with asterisks: SPAXX**.
    const core = /\*+$/.test(rawSymbol)
    const cashRow = core || CASH_ROW.test(rawSymbol) || (!rawSymbol && CASH_ROW.test(description))
    let symbol = normalizeSymbol(rawSymbol.replace(/\*+$/, ""))
    if (!symbol && cashRow) symbol = "CASH"
    if (!symbol) {
      skipped.noSymbol++
      continue
    }

    const { quantity, price } = row
    let value = row.value
    if (value === null && quantity !== null && price !== null) value = quantity * price
    // The same bounds parseHolding enforces; anything past them would be dropped silently on save.
    if ((value !== null && !(value <= MAX_VALUE)) || (quantity !== null && !(quantity <= MAX_SHARES))) {
      skipped.outOfRange++
      continue
    }
    if ((value !== null && value < 0) || (quantity !== null && quantity < 0)) {
      skipped.negative++
      continue
    }
    // Nothing to go on, or a position that's been closed ($0 and no shares).
    if ((value === null && quantity === null) || ((value ?? 0) === 0 && (quantity ?? 0) === 0)) {
      skipped.noValue++
      continue
    }

    const known = knownFund(symbol)
    const assetClass: AssetClass =
      symbol === "CASH" || (cashRow && !known)
        ? "cash"
        : (known?.assetClass ?? classFromType(row.securityType) ?? classFromName(description) ?? "other")
    // Fidelity describes its core position as "HELD IN MONEY MARKET"; the fund's own name reads better.
    const name = symbol === "CASH" ? IMPORTED_CASH_NAME : ((core && known?.name) || description || known?.name || "").replace(/\s+/g, " ").slice(0, 80)

    const existing = bySymbol.get(symbol)
    if (existing) {
      existing.value += value ?? 0
      existing.valueMissing ||= value === null
      existing.sharesKnown &&= quantity !== null
      existing.shares = existing.sharesKnown && existing.shares !== null && quantity !== null ? existing.shares + quantity : null
      existing.count++
      if (!existing.name && name) existing.name = name
    } else {
      bySymbol.set(symbol, { symbol, name, assetClass, value: value ?? 0, shares: quantity, count: 1, sharesKnown: quantity !== null, valueMissing: value === null })
    }
  }

  const all = [...bySymbol.values()].sort((a, b) => b.value - a.value)
  const kept = all.slice(0, MAX_HOLDINGS)
  return {
    holdings: kept.map(({ symbol, name, assetClass, value, shares }) => ({
      symbol,
      name,
      assetClass,
      value: round(value, 2),
      shares: shares === null ? null : round(shares, 6),
    })),
    skipped,
    dropped: all.length - kept.length,
    // Shares with no value in at least one account: Refresh prices works the value out from shares.
    needPrices: kept.filter((holding) => holding.valueMissing && holding.shares !== null).length,
    combined: kept.reduce((sum, holding) => sum + holding.count - 1, 0),
  }
}

export type ImportMode = "replace" | "update"

/**
 * Applies an import to the saved holdings.
 * - "replace": the file becomes the portfolio.
 * - "update": holdings in the file replace the same symbol already saved; the rest are kept, and new
 *   symbols are added.
 * Either way, a fee the user typed for a symbol is kept, and the result is checked by parseHolding.
 */
export function applyHoldingsImport(
  existing: Holding[],
  imported: ImportedHolding[],
  mode: ImportMode,
  now: string,
  newId: () => string
): { holdings: Holding[]; dropped: number } {
  // First saved holding per match key: a symbol entered twice (an IRA and a 401k) has only its
  // first row updated, so the import isn't counted twice and each row keeps its own id.
  const firstByKey = new Map<string, Holding>()
  for (const holding of existing) {
    const key = matchKey(holding)
    if (key && !firstByKey.has(key)) firstByKey.set(key, holding)
  }
  const fromFile = imported
    .map((holding) => {
      const previous = firstByKey.get(matchKey(holding))
      return parseHolding({
        ...holding,
        id: previous?.id ?? newId(),
        name: holding.name || previous?.name || "",
        expenseRatioPercent: previous?.expenseRatioPercent ?? null,
        valueAsOf: now,
      })
    })
    .filter((holding): holding is Holding => holding !== null)

  let combined: Holding[]
  if (mode === "replace") {
    combined = fromFile
  } else {
    const replacing = new Map(fromFile.map((holding) => [matchKey(holding), holding]))
    const used = new Set<string>()
    // Saved rows pass through untouched (including one still being typed), except the first match.
    const updated = existing.map((holding) => {
      const key = matchKey(holding)
      const replacement = key && !used.has(key) ? replacing.get(key) : undefined
      if (!replacement) return holding
      used.add(key)
      return replacement
    })
    combined = [...updated, ...fromFile.filter((holding) => !used.has(matchKey(holding)))]
  }

  return { holdings: combined.slice(0, MAX_HOLDINGS), dropped: Math.max(0, combined.length - MAX_HOLDINGS) }
}

/** What a brokerage's cash line is called once imported. Only this name is updated by later imports. */
export const IMPORTED_CASH_NAME = "Brokerage cash"

/**
 * How an imported holding finds the saved one it updates: by symbol, except that imported cash
 * only matches earlier imported cash, never a CASH row the person typed themselves (savings, say).
 */
function matchKey(holding: { symbol: string; name: string }): string {
  const symbol = holding.symbol.trim().toUpperCase()
  if (!symbol) return ""
  return symbol === "CASH" ? (holding.name === IMPORTED_CASH_NAME ? "CASH:imported" : "CASH:own") : symbol
}
