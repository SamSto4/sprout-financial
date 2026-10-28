import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { startRequestLog } from "./request-log.ts"

describe("startRequestLog", () => {
  it("summarizes a request with tools, usage and timing", () => {
    let time = 1_000
    const log = startRequestLog({ mode: "standard", model: "model-a" }, () => time)

    log.onRoute("agent")
    log.onAboutCard(7)
    log.onUsage({ inputTokens: 3_000, cacheReadTokens: 0, cacheWriteTokens: 2_500, outputTokens: 80, costUsd: 0.0004 })
    log.onToolCall({ name: "compound_growth", isError: false })
    log.onToolCall({ name: "create_chart", isError: true })
    log.onToolCall({ name: "create_chart", isError: false })
    time = 2_400
    log.onText("You'd end up with ")
    time = 5_000
    log.onText("about $366,000.")
    log.onUsage({ inputTokens: 3_400, cacheReadTokens: 2_500, cacheWriteTokens: 300, outputTokens: 220, webSearches: 2, costUsd: 0.02045 })
    log.onGroundingCheck(1)
    assert.equal(Math.round(log.costUsd() * 1e6), 20_850)

    assert.deepEqual(JSON.parse(log.line("ok")), {
      event: "chat",
      outcome: "ok",
      mode: "standard",
      model: "model-a",
      route: "agent",
      rounds: 2,
      tools: { compound_growth: 1, create_chart: 2 },
      toolErrors: 1,
      ungroundedPrices: 1,
      aboutLines: 7,
      webSearches: 2,
      inputTokens: 6_400,
      cacheReadTokens: 2_500,
      cacheWriteTokens: 2_800,
      outputTokens: 300,
      costUsd: 0.0209,
      firstTextMs: 1_400,
      totalMs: 4_000,
      replyChars: 33,
    })
  })

  it("handles a request that failed before anything streamed", () => {
    const log = startRequestLog({ mode: "deep-research", model: "model-a" }, () => 50)
    const line = JSON.parse(log.line("error"))
    assert.equal(line.outcome, "error")
    assert.equal(line.firstTextMs, null)
    assert.equal(line.rounds, 0)
    assert.deepEqual(line.tools, {})
    assert.equal(line.route, null)
    assert.equal(line.ungroundedPrices, null)
    assert.equal(line.aboutLines, null)
  })

  it("records lengths and counts only, never the text itself", () => {
    const log = startRequestLog({ mode: "standard", model: "model-a" })
    log.onText("My account number is 4417 2290 8831")
    assert.doesNotMatch(log.line("ok"), /4417|account number/)
  })
})
