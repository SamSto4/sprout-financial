import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { isSpendLimitError } from "./error-kinds.ts"

describe("isSpendLimitError", () => {
  it("recognizes a limit set on the organization or workspace", () => {
    const body = (text: string) => `400 {"type":"error","error":{"type":"invalid_request_error","message":"${text}"}}`
    assert.equal(isSpendLimitError(400, body("You have reached your specified API usage limits. You will regain access on 2026-11-01 at 00:00 UTC.")), true)
    assert.equal(isSpendLimitError(400, body("You have reached your specified workspace API usage limits. You will regain access on 2026-11-01 at 00:00 UTC.")), true)
  })

  it("recognizes the usage tier's own monthly cap", () => {
    const message = '429 {"type":"error","error":{"type":"rate_limit_error","message":"You have reached your API usage limits: your organization has crossed its monthly API usage threshold."}}'
    assert.equal(isSpendLimitError(429, message), true)
  })

  it("leaves ordinary rate limits and bad requests alone", () => {
    assert.equal(isSpendLimitError(429, "429 This request would exceed your organization's rate limit of 50 requests per minute."), false)
    assert.equal(isSpendLimitError(400, "400 messages: text content blocks must be non-empty"), false)
    assert.equal(isSpendLimitError(undefined, "You have reached your specified API usage limits."), false)
    assert.equal(isSpendLimitError(500, "You have reached your specified API usage limits."), false)
  })
})
