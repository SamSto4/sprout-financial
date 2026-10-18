import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { estimateCostUsd, isKnownModel, isOverLimit, monthExpiry, monthKey, parseSpendingLimit, toMicroUsd } from "./spend.ts"

describe("estimateCostUsd", () => {
  it("prices Haiku 5.5 tokens at the standard rate for short prompts", () => {
    // 10k input at $0.10/M + 2k cache write at $0.125/M + 50k cache read at $0.01/M + 1k output at $0.50/M
    const cost = estimateCostUsd("claude-haiku-5-5", {
      input_tokens: 10_000,
      cache_creation_input_tokens: 2_000,
      cache_read_input_tokens: 50_000,
      output_tokens: 1_000,
    })
    assert.equal(Math.round(cost * 1e9), Math.round((0.001 + 0.00025 + 0.0005 + 0.0005) * 1e9))
  })

  it("switches the whole Haiku request to the long-prompt rate past 100k prompt tokens", () => {
    const usage = { input_tokens: 1_000, cache_read_input_tokens: 100_000, output_tokens: 1_000 }
    const cost = estimateCostUsd("claude-haiku-5-5", usage)
    // 1k at $0.50/M + 100k at $0.05/M + 1k at $2.50/M
    assert.equal(Math.round(cost * 1e9), Math.round((0.0005 + 0.005 + 0.0025) * 1e9))
  })

  it("adds $10 per 1,000 web searches", () => {
    const cost = estimateCostUsd("claude-haiku-5-5", {
      input_tokens: 0,
      output_tokens: 0,
      server_tool_use: { web_search_requests: 3 },
    })
    assert.equal(Math.round(cost * 1e6), 30_000)
  })

  it("prices an unknown model like the most expensive known one", () => {
    const usage = { input_tokens: 1_000_000, output_tokens: 0 }
    assert.equal(isKnownModel("some-future-model"), false)
    assert.equal(estimateCostUsd("some-future-model", usage), estimateCostUsd("claude-fable-5-1", usage))
    assert.ok(estimateCostUsd("some-future-model", usage) > estimateCostUsd("claude-opus-5-5", usage))
  })

  it("treats missing cache fields as zero", () => {
    assert.equal(estimateCostUsd("claude-opus-5-5", { input_tokens: 1_000_000, output_tokens: 0, cache_read_input_tokens: null }), 4)
  })
})

describe("toMicroUsd", () => {
  it("rounds up to whole micro-dollars and ignores bad values", () => {
    assert.equal(toMicroUsd(0.0000001), 1)
    assert.equal(toMicroUsd(1.5), 1_500_000)
    assert.equal(toMicroUsd(-2), 0)
    assert.equal(toMicroUsd(Number.NaN), 0)
  })
})

describe("parseSpendingLimit", () => {
  it("reads dollars, with or without a dollar sign", () => {
    assert.equal(parseSpendingLimit("100"), 100)
    assert.equal(parseSpendingLimit(" 25.50 "), 25.5)
    assert.equal(parseSpendingLimit("$40"), 40)
  })

  it("means no limit when unset, zero or not a number", () => {
    assert.equal(parseSpendingLimit(undefined), null)
    assert.equal(parseSpendingLimit(""), null)
    assert.equal(parseSpendingLimit("0"), null)
    assert.equal(parseSpendingLimit("-5"), null)
    assert.equal(parseSpendingLimit("lots"), null)
  })
})

describe("month helpers", () => {
  const OCT_31_LATE = Date.UTC(2026, 9, 31, 23, 59)

  it("keys totals by UTC calendar month", () => {
    assert.equal(monthKey(OCT_31_LATE), "2026-10")
    assert.equal(monthKey(Date.UTC(2026, 10, 1)), "2026-11")
  })

  it("expires a month's total after the month ends, across a year boundary too", () => {
    assert.equal(monthExpiry(OCT_31_LATE).toISOString(), "2026-11-02T00:00:00.000Z")
    assert.equal(monthExpiry(Date.UTC(2026, 11, 15)).toISOString(), "2027-01-02T00:00:00.000Z")
  })
})

describe("isOverLimit", () => {
  it("stops once spending reaches the limit", () => {
    assert.equal(isOverLimit(99_999_999, 100), false)
    assert.equal(isOverLimit(100_000_000, 100), true)
  })

  it("never stops without a limit", () => {
    assert.equal(isOverLimit(10 ** 12, null), false)
  })
})
