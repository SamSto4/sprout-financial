// Test data for the eval suite: sample transactions, and a stand-in for the market data service
// so evals never call (or get billed by) the real one and always see the same quote.

import { readFileSync } from "node:fs"

import { importTransactionsFromCsv } from "../lib/finance/csv.ts"
import type { Transaction } from "../lib/finance/transactions.ts"
import type { MarketMode } from "./types.ts"

/** The app's own demo file, so evals see the same data as someone trying the dashboard. */
export function sampleTransactions(): Transaction[] {
  const csv = readFileSync(new URL("../public/sample-transactions.csv", import.meta.url), "utf8")
  const imported = importTransactionsFromCsv(csv)
  if (!imported.ok) throw new Error(`Couldn't read the sample transactions: ${imported.error}`)
  return imported.transactions
}

/** A made-up quote. The price is deliberately specific so a reply that states it must have used the tool. */
export const FIXTURE_QUOTE = {
  symbol: "VOO",
  name: "Vanguard S&P 500 ETF",
  price: 512.34,
  change: 1.27,
  changePercentage: 0.25,
  open: 511.02,
  previousClose: 511.07,
  dayLow: 509.88,
  dayHigh: 513.4,
  yearLow: 441.2,
  yearHigh: 530.15,
  volume: 4_120_000,
  marketCap: 1_310_000_000_000,
  priceAvg50: 505.6,
  priceAvg200: 488.9,
  exchange: "AMEX",
  timestamp: 1_790_000_000,
}

const FIXTURE_PROFILE = {
  symbol: "VOO",
  companyName: "Vanguard S&P 500 ETF",
  sector: "Financial Services",
  industry: "Asset Management",
  country: "US",
  currency: "USD",
  exchange: "AMEX",
  beta: 1,
  isEtf: true,
  isFund: false,
  description: "An exchange-traded fund that tracks the S&P 500 index of large US companies.",
}

const MARKET_HOST = "financialmodelingprep.com"

let mode: MarketMode = "off"
let installed = false

/**
 * Sets how market data behaves from now on. Requests to the market data host are answered here;
 * everything else (including the Anthropic API) goes through the real fetch untouched.
 */
export function setMarketMode(next: MarketMode) {
  mode = next
  // The market tools are offered only when a key is set (lib/market/fmp.ts). This only changes
  // the variable inside the eval process; the key in .env is never read or written here.
  if (next === "off") delete process.env.FMP_API_KEY
  else process.env.FMP_API_KEY = "eval-fixture"

  if (installed) return
  installed = true

  const realFetch = globalThis.fetch
  const stub: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (url.hostname !== MARKET_HOST) return realFetch(input, init)
    if (mode !== "fixture") throw new TypeError("fetch failed (simulated market data outage)")

    const symbol = (url.searchParams.get("symbol") ?? FIXTURE_QUOTE.symbol).toUpperCase()
    const endpoint = url.pathname.split("/").pop()
    if (endpoint === "quote") return Response.json([{ ...FIXTURE_QUOTE, symbol }])
    if (endpoint === "profile") return Response.json([{ ...FIXTURE_PROFILE, symbol }])
    if (endpoint === "search-name") {
      return Response.json([{ symbol: FIXTURE_QUOTE.symbol, name: FIXTURE_QUOTE.name, currency: "USD", exchange: "AMEX" }])
    }
    return Response.json([])
  }
  globalThis.fetch = stub
}
