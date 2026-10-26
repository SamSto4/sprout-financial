// A last check on high-stakes answers: when the agent quoted market data, every price it wrote to
// the cent should be one a tool returned (or the user gave). Prices are where a made-up figure does
// the most harm, and they are easy to check exactly, so this runs in code after the reply streams
// instead of as another model call. It is skipped on answers that used no market data tool.
// Kept free of framework and SDK imports so it can be unit-tested with `node --test`.

/** Tools whose results are market data, so an answer that used them gets the price check. */
export const MARKET_DATA_TOOLS: ReadonlySet<string> = new Set([
  "get_stock_quote",
  "get_company_profile",
  "search_companies",
  "check_before_buying",
])

// "$187.42" or "$1,204.10": the form quotes come in. Round figures ("$500", "about $3 trillion")
// are left out: they're usually examples or rounded context, not a quoted price.
const PRICE_PATTERN = /\$\s?(\d{1,3}(?:,\d{3})+|\d+)\.\d{2}(?!\d)/g
const NUMBER_PATTERN = /\d+(?:\.\d+)?/g
// Half a cent, so a tool's 187.4213 matches the reply's $187.42.
const ROUNDING = 0.005 + 1e-9

/**
 * The prices in the reply that match no number in the evidence (tool results and the user's own
 * messages), in the order they first appear, without repeats.
 */
export function ungroundedPrices(reply: string, evidence: readonly string[]): string[] {
  const known: number[] = []
  for (const text of evidence) {
    // Thousands separators would split "1,204.10" into two numbers.
    for (const match of text.replace(/(\d),(?=\d{3})/g, "$1").matchAll(NUMBER_PATTERN)) known.push(Number(match[0]))
  }
  const missing: string[] = []
  for (const match of reply.matchAll(PRICE_PATTERN)) {
    const price = Number(match[0].replace(/[$,\s]/g, ""))
    const grounded = known.some((value) => Math.abs(value - price) <= ROUNDING)
    if (!grounded && !missing.includes(match[0])) missing.push(match[0])
  }
  return missing
}

/** The note added under a reply with prices the data doesn't back up. */
export function ungroundedNote(prices: readonly string[]): string {
  const list = prices.length === 1 ? prices[0] : `${prices.slice(0, -1).join(", ")} and ${prices[prices.length - 1]}`
  return `\n\n_I couldn't match ${list} to the market data I looked up, so check ${prices.length === 1 ? "that figure" : "those figures"} with your broker or a quote site before relying on ${prices.length === 1 ? "it" : "them"}._`
}
