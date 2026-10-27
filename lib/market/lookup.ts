// How a symbol's price lookup ended, for "Refresh prices" (/api/market/quotes) and the before-you-
// buy check. Free of framework imports so it can be unit-tested with `node --test`.

/**
 * Read from the quote request alone: that's where the price comes from, so a symbol whose quote
 * failed but whose profile answered still has no price, and isn't "not found".
 * - lookupFailed: the quote request failed in a way that may pass (a timeout, the service's
 *   request limit or its own error), so "try again in a few minutes" is right.
 * - unavailable: the service refused it in a way that won't pass (a symbol the data plan doesn't
 *   cover, a bad key): MarketDataError's `temporary: false` (lib/market/fmp.ts).
 * Any other error counts as one that may pass.
 */
export function quoteLookup(quote: PromiseSettledResult<unknown>): { lookupFailed: boolean; unavailable?: true } {
  if (quote.status === "fulfilled") return { lookupFailed: false }
  const reason: unknown = quote.reason
  const temporary = !(typeof reason === "object" && reason !== null && (reason as { temporary?: unknown }).temporary === false)
  return temporary ? { lookupFailed: true } : { lookupFailed: false, unavailable: true }
}
