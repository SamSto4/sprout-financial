import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { startRequestLog } from "./request-log.ts"

describe("startRequestLog", () => {
  it("summarizes a request with tools, usage and timing", () => {
    let time = 1_000
    const log = startRequestLog({ mode: "standard", model: "model-a" }, () => time)

    log.onUsage({ inputTokens: 3_000, outputTokens: 80 })
    log.onToolCall({ name: "compound_growth", isError: false })
    log.onToolCall({ name: "create_chart", isError: true })
    log.onToolCall({ name: "create_chart", isError: false })
    time = 2_400
    log.onText("You'd end up with ")
    time = 5_000
    log.onText("about $366,000.")
    log.onUsage({ inputTokens: 3_400, outputTokens: 220, webSearches: 2 })

    assert.deepEqual(JSON.parse(log.line("ok")), {
      event: "chat",
      outcome: "ok",
      mode: "standard",
      model: "model-a",
      rounds: 2,
      tools: { compound_growth: 1, create_chart: 2 },
      toolErrors: 1,
      webSearches: 2,
      inputTokens: 6_400,
      outputTokens: 300,
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
  })

  it("records lengths and counts only, never the text itself", () => {
    const log = startRequestLog({ mode: "standard", model: "model-a" })
    log.onText("My account number is 4417 2290 8831")
    assert.doesNotMatch(log.line("ok"), /4417|account number/)
  })
})
