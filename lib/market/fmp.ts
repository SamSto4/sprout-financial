import "server-only"

import { pick } from "@/lib/market/inputs"

// Financial Modeling Prep (https://financialmodelingprep.com), "stable" API.
const BASE_URL = "https://financialmodelingprep.com/stable"
const TIMEOUT_MS = 10_000

export class MarketDataError extends Error {}

export function isMarketDataConfigured() {
  return Boolean(process.env.FMP_API_KEY)
}

async function fmpGet(path: string, params: Record<string, string>): Promise<unknown> {
  const apiKey = process.env.FMP_API_KEY
  if (!apiKey) throw new MarketDataError("Market data isn't configured.")

  const url = new URL(`${BASE_URL}/${path}`)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  url.searchParams.set("apikey", apiKey)

  let response: Response
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" })
  } catch {
    throw new MarketDataError("The market data service didn't respond.")
  }

  const data: unknown = await response.json().catch(() => null)

  if (response.status === 429) {
    throw new MarketDataError("The market data service's request limit was reached. Try again later.")
  }
  // FMP reports problems (bad key, plan limits) as {"Error Message": "..."}.
  if (!response.ok || (data && typeof data === "object" && "Error Message" in data)) {
    console.error(`FMP ${path} failed (${response.status}):`, JSON.stringify(data)?.slice(0, 300))
    throw new MarketDataError("The market data service couldn't answer that request.")
  }
  if (!Array.isArray(data)) {
    throw new MarketDataError("The market data service returned an unexpected response.")
  }
  return data
}

const QUOTE_FIELDS = [
  "symbol", "name", "price", "change", "changePercentage", "open", "previousClose",
  "dayLow", "dayHigh", "yearLow", "yearHigh", "volume", "marketCap",
  "priceAvg50", "priceAvg200", "exchange",
] as const

export async function getQuote(symbol: string) {
  const [quote] = (await fmpGet("quote", { symbol })) as Record<string, unknown>[]
  if (!quote) return { found: false, symbol }

  const timestamp = typeof quote.timestamp === "number" ? quote.timestamp : null
  return {
    found: true,
    ...pick(quote, QUOTE_FIELDS),
    asOf: timestamp ? new Date(timestamp * 1000).toISOString() : "unknown",
    source: "Financial Modeling Prep",
  }
}

const SEARCH_FIELDS = ["symbol", "name", "currency", "exchange", "exchangeFullName"] as const

export async function searchCompanies(query: string) {
  const results = (await fmpGet("search-name", { query, limit: "8" })) as Record<string, unknown>[]
  return {
    results: results.slice(0, 8).map((result) => pick(result, SEARCH_FIELDS)),
    source: "Financial Modeling Prep",
  }
}

const PROFILE_FIELDS = [
  "symbol", "companyName", "sector", "industry", "country", "currency", "exchange",
  "marketCap", "beta", "lastDividend", "range", "ceo", "fullTimeEmployees",
  "website", "ipoDate", "isEtf", "isFund",
] as const

export async function getCompanyProfile(symbol: string) {
  const [profile] = (await fmpGet("profile", { symbol })) as Record<string, unknown>[]
  if (!profile) return { found: false, symbol }

  const description = typeof profile.description === "string" ? profile.description.slice(0, 1200) : undefined
  return {
    found: true,
    ...pick(profile, PROFILE_FIELDS),
    ...(description ? { description } : {}),
    source: "Financial Modeling Prep",
  }
}
