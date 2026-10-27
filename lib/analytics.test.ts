import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { analyticsAvailable, redactAnalyticsEvent, redactAnalyticsUrl } from "./analytics.ts"

describe("redactAnalyticsUrl", () => {
  it("drops a reset or sign-up token from the page address", () => {
    assert.equal(redactAnalyticsUrl("https://x/reset-password?token=abc"), "https://x/reset-password")
    assert.equal(redactAnalyticsUrl("https://x/verify-email?token=abc&utm=1"), "https://x/verify-email")
  })

  it("drops what someone typed, and fragments too", () => {
    assert.equal(redactAnalyticsUrl("https://x/assistant?q=I%20owe%20%2412k"), "https://x/assistant")
    assert.equal(redactAnalyticsUrl("https://x/learn/budgeting#token=abc"), "https://x/learn/budgeting")
    assert.equal(redactAnalyticsUrl("https://x/plan#?token=abc"), "https://x/plan")
  })

  it("leaves an address without either as it is", () => {
    assert.equal(redactAnalyticsUrl("https://x/learn/budgeting"), "https://x/learn/budgeting")
    assert.equal(redactAnalyticsUrl("https://x/"), "https://x/")
  })
})

describe("redactAnalyticsEvent", () => {
  it("keeps the event's type and redacts only its URL", () => {
    assert.deepEqual(redactAnalyticsEvent({ type: "pageview", url: "https://x/reset-password?token=abc" }), {
      type: "pageview",
      url: "https://x/reset-password",
    })
    assert.deepEqual(redactAnalyticsEvent({ type: "event", url: "https://x/?a=1" }), { type: "event", url: "https://x/" })
  })
})

describe("analyticsAvailable", () => {
  it("is on only on Vercel, which serves the script", () => {
    assert.equal(analyticsAvailable({ VERCEL: "1" }), true)
    assert.equal(analyticsAvailable({}), false)
    assert.equal(analyticsAvailable({ VERCEL: "" }), false)
    // next start on another host, even with Vercel-looking settings copied over
    assert.equal(analyticsAvailable({ NODE_ENV: "production", VERCEL_URL: "x.vercel.app" }), false)
  })
})
