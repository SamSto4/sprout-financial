// Checks the inputs the agent passes to market-data tools before they reach FMP.
// Free of framework imports so it can be unit-tested with `node --test`.

// Tickers like AAPL, BRK.B, BRK-B, ^GSPC (index), 7203.T (foreign listing).
const SYMBOL_PATTERN = /^[A-Z0-9^][A-Z0-9.\-^]{0,14}$/

export function parseSymbol(input: unknown): string | null {
  if (typeof input !== "object" || input === null) return null
  const { symbol } = input as { symbol?: unknown }
  if (typeof symbol !== "string") return null

  const cleaned = symbol.trim().toUpperCase()
  return SYMBOL_PATTERN.test(cleaned) ? cleaned : null
}

export function parseSearchQuery(input: unknown): string | null {
  if (typeof input !== "object" || input === null) return null
  const { query } = input as { query?: unknown }
  if (typeof query !== "string") return null

  const cleaned = query.trim()
  if (cleaned.length === 0 || cleaned.length > 60) return null
  // Letters, numbers, spaces and common company-name punctuation only.
  return /^[\p{L}\p{N} .,&'\-]+$/u.test(cleaned) ? cleaned : null
}

/** Copies only the listed keys that exist on `source`, so unexpected fields never reach the model. */
export function pick(source: Record<string, unknown>, keys: readonly string[]) {
  const result: Record<string, unknown> = {}
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== "") {
      result[key] = source[key]
    }
  }
  return result
}
