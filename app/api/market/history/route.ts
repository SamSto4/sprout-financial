import { getDailyHistory, isMarketChartsEnabled, isMarketDataConfigured, MarketDataError } from "@/lib/market/fmp"
import { firstWithHistory, HISTORY_LOOKUPS, historyCacheControl, MARKET_LINEUP, type MarketId, type PricePoint } from "@/lib/market/history"
import { rateLimitResponse } from "@/lib/rate-limit/server"

const YEARS = 5

export type MarketHistoryResponse = {
  markets: { id: MarketId; symbol: string; points: PricePoint[] }[]
  /** Markets with no data (not on the data plan, or a failure just now), so the page can say so. */
  unavailable: MarketId[]
  source: string
  fetchedAt: string
}

// Five years of daily closes for each market in MARKET_LINEUP, for the Portfolio page's
// "Markets, explained" section. The same for every visitor, so Vercel's CDN caches it (for an hour
// when nothing failed just now) and the market data plan is asked about once an hour, not once per visit.
export async function GET(request: Request) {
  // The CDN keys its cache on the whole URL, so /api/market/history?anything would reach this
  // function (and the data plan) every time. The page never adds a query; refuse one.
  if (new URL(request.url).search) return Response.json({ error: "This address takes no query string." }, { status: 400 })
  if (!isMarketDataConfigured()) return Response.json({ error: "Market data isn't set up on this server." }, { status: 503 })
  // Switched off until the data license covers price history (MARKET_CHARTS, lib/market/fmp.ts):
  // answer here, so nothing reaches the data provider.
  if (!isMarketChartsEnabled()) {
    return Response.json({ error: "Market charts are switched off on this server." }, { status: 503, headers: { "Cache-Control": "no-store" } })
  }

  // Charged for the lookups it makes, like the quotes route's per-symbol charge.
  const limited = await rateLimitResponse("marketData", request, HISTORY_LOOKUPS)
  if (limited) return limited

  const from = new Date(Date.now() - YEARS * 366 * 86_400_000).toISOString().slice(0, 10)
  const results = await Promise.all(
    MARKET_LINEUP.map(async (market) => ({
      id: market.id,
      ...(await firstWithHistory(
        market.candidates,
        (symbol) => getDailyHistory(symbol, from),
        (error) => {
          if (!(error instanceof MarketDataError)) console.error(`History for ${market.id} failed:`, error)
          return error instanceof MarketDataError && error.temporary
        }
      )),
    }))
  )

  const markets = results.filter((result) => result.points.length > 0).map(({ id, symbol, points }) => ({ id, symbol, points }))
  if (markets.length === 0) {
    return Response.json({ error: "Market history is unavailable right now." }, { status: 503, headers: { "Cache-Control": "no-store" } })
  }

  const body: MarketHistoryResponse = {
    markets,
    unavailable: results.filter((result) => result.points.length === 0).map((result) => result.id),
    source: "Financial Modeling Prep, daily closing prices (may be delayed)",
    fetchedAt: new Date().toISOString(),
  }
  const temporaryGaps = results.filter((result) => result.temporary).length
  return Response.json(body, { headers: { "Cache-Control": historyCacheControl(temporaryGaps) } })
}
