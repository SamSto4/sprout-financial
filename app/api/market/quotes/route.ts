import { getInstrumentFacts, isMarketDataConfigured } from "@/lib/market/fmp"
import { normalizeSymbol } from "@/lib/portfolio/funds"
import { MAX_QUOTE_SYMBOLS } from "@/lib/portfolio/holdings"
import { rateLimitResponse } from "@/lib/rate-limit/server"

// Live prices for the Portfolio page's "Refresh prices" button: quote and basic facts per symbol,
// from Financial Modeling Prep. Read-only; the browser multiplies by the shares it already has.
export async function POST(request: Request) {
  if (!isMarketDataConfigured()) return Response.json({ error: "Live prices aren't set up on this server." }, { status: 503 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 })
  }
  const raw = (body as { symbols?: unknown } | null)?.symbols
  if (!Array.isArray(raw) || raw.length === 0) return Response.json({ error: "Send a list of symbols." }, { status: 400 })
  if (raw.length > 100) return Response.json({ error: "Too many symbols." }, { status: 400 })
  const symbols = [...new Set(raw.map(normalizeSymbol).filter((symbol): symbol is string => symbol !== null))].slice(0, MAX_QUOTE_SYMBOLS)
  if (symbols.length === 0) return Response.json({ error: "None of those look like ticker symbols." }, { status: 400 })

  // Charged per symbol: each one is its own market data lookups, so a big refresh costs more.
  const limited = await rateLimitResponse("marketData", request, symbols.length)
  if (limited) return limited

  const facts = await Promise.all(symbols.map((symbol) => getInstrumentFacts(symbol)))
  return Response.json(
    {
      quotes: facts.map(({ symbol, found, name, price, isEtf, isFund, asOf }) => ({ symbol, found, name, price, isEtf, isFund, asOf })),
      source: "Financial Modeling Prep. Prices may be delayed.",
    },
    { headers: { "Cache-Control": "no-store" } }
  )
}
