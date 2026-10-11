import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { MAX_INSIGHTS, parseInsights, parseStoredInsights } from "./insights-format.ts"

const insight = {
  kind: "saving",
  title: "Review subscriptions",
  detail: "Two streaming services cost $27 a month.",
  figure: "$330/yr",
  action: "Cancel the one you use least.",
}

describe("parseInsights", () => {
  it("accepts model output and converts next_step", () => {
    assert.deepEqual(parseInsights({ headline: " Spending is steady. ", insights: [insight], next_step: "Check subscriptions." }), {
      headline: "Spending is steady.",
      insights: [insight],
      nextStep: "Check subscriptions.",
    })
  })

  it("drops malformed insights and caps the count", () => {
    const parsed = parseInsights({
      headline: "H",
      next_step: "N",
      insights: [{ ...insight, kind: "hype" }, { ...insight, figure: "" }, ...Array(10).fill(insight)],
    })
    assert.equal(parsed?.insights.length, MAX_INSIGHTS)
  })

  it("rejects output with nothing usable", () => {
    assert.equal(parseInsights({ headline: "H", next_step: "N", insights: [] }), null)
    assert.equal(parseInsights("not json"), null)
    assert.equal(parseInsights({ insights: [insight], next_step: "N" }), null)
  })

  it("reads stored results", () => {
    const stored = { sourceKey: "file|1", generatedAt: "2026-09-30T00:00:00Z", insights: { headline: "H", nextStep: "N", insights: [insight] } }
    assert.equal(parseStoredInsights(stored)?.sourceKey, "file|1")
    assert.equal(parseStoredInsights({ ...stored, sourceKey: 3 }), null)
  })
})
