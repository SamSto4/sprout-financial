import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { routeMessage } from "./router.ts"

describe("routeMessage", () => {
  it("sends pure greetings, thanks and goodbyes down the direct path", () => {
    for (const message of ["hi", "Hi there!", "hey sprout 👋", "Good morning", "thanks!", "Thank you so much", "thanks, that makes sense!", "ok thanks", "bye", "see you later"]) {
      assert.equal(routeMessage(message, "standard"), "direct", message)
    }
  })

  it("keeps anything with a question or request on the full agent", () => {
    for (const message of [
      "hi, should I buy NVDA?",
      "thanks! how much will $300 a month grow to?",
      "hello, can you look at my spending",
      "What's an ETF?",
      "thanks for 500",
    ]) {
      assert.equal(routeMessage(message, "standard"), "agent", message)
    }
  })

  it("treats a bare yes or ok as a request, since it often answers an offer to run the numbers", () => {
    for (const message of ["ok", "yes", "sure", "okay", "good", "yes please"]) {
      assert.equal(routeMessage(message, "standard"), "agent", message)
    }
  })

  it("leaves empty, long and deep-research messages to the agent", () => {
    assert.equal(routeMessage("", "standard"), "agent")
    assert.equal(routeMessage("🙏", "standard"), "agent")
    assert.equal(routeMessage("thanks thanks thanks thanks thanks thanks thanks thanks thanks", "standard"), "agent")
    assert.equal(routeMessage("hi", "deep-research"), "agent")
  })
})
