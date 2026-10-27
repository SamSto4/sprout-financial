import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { quoteLookup } from "./lookup.ts"

// The flag lib/market/fmp.ts's MarketDataError carries (that module is server-only).
const marketError = (temporary: boolean) => Object.assign(new Error("market data"), { temporary })
const rejected = (reason: unknown): PromiseSettledResult<unknown> => ({ status: "rejected", reason })

describe("quoteLookup", () => {
  it("is fine when the quote answered, found or not", () => {
    assert.deepEqual(quoteLookup({ status: "fulfilled", value: { found: false } }), { lookupFailed: false })
  })

  it("calls a quote that timed out or hit the request limit a failed lookup, whatever the profile did", () => {
    // VXUS: the quote got a 429, the profile answered. It has no price, and it isn't "not found".
    assert.deepEqual(quoteLookup(rejected(marketError(true))), { lookupFailed: true })
    assert.deepEqual(quoteLookup(rejected(new TypeError("fetch failed"))), { lookupFailed: true })
  })

  it("calls a refusal that won't pass (a symbol the plan doesn't cover, a bad key) unavailable, not 'try again'", () => {
    assert.deepEqual(quoteLookup(rejected(marketError(false))), { lookupFailed: false, unavailable: true })
  })
})
