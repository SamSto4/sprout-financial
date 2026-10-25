import { getDailyHistory, isMarketDataConfigured, MarketDataError } from "@/lib/market/fmp"
import { MARKET_LINEUP, type MarketId, type PricePoint } from "@/lib/market/history"
import { rateLimitResponse } from "@/lib/rate-limit/server"

const YEARS = 5

export type MarketHistoryResponse = {
  markets: { id: MarketId; symbol: string; points: PricePoint[] }[]
  /** Markets the data plan didn't cover, so the page can say so. */
  unavailable: MarketId[]
  source: string
  fetchedAt: string
}

// Five years of daily closes for each market in MARKET_LINEUP, for the Portfolio page's
// "Markets, explained" section. The same for every visitor, so Vercel's CDN caches it for an hour
// and the market data plan is asked about once an hour, not once per visit.
export async function GET(request: Request) {
  if (!isMarketDataConfigured()) return Response.json({ error: "Market data isn't set up on this server." }, { status: 503 })

  const limited = await rateLimitResponse("marketData", request)
  if (limited) return limited

  const from = new Date(Date.now() - YEARS * 366 * 86_400_000).toISOString().slice(0, 10)
  const results = await Promise.all(
    MARKET_LINEUP.map(async (market) => {
      for (const symbol of market.candidates) {
        try {
          const points = await getDailyHistory(symbol, from)
          if (points.length >= 2) return { id: market.id, symbol, points }
        } catch (error) {
          // Not on this plan or a hiccup: try the next symbol for this market.
          if (!(error instanceof MarketDataError)) console.error(`History for ${symbol} failed:`, error)
        }
      }
      return { id: market.id, symbol: "", points: [] as PricePoint[] }
    })
  )

  const markets = results.filter((result) => result.points.length > 0)
  if (markets.length === 0) return Response.json({ error: "Market history is unavailable right now." }, { status: 503 })

  const body: MarketHistoryResponse = {
    markets,
    unavailable: results.filter((result) => result.points.length === 0).map((result) => result.id),
    source: "Financial Modeling Prep, daily closing prices (may be delayed)",
    fetchedAt: new Date().toISOString(),
  }
  return Response.json(body, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } })
}
