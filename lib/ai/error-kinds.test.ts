import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { isSpendLimitError, mayHaveBeenBilled } from "./error-kinds.ts"

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

describe("mayHaveBeenBilled", () => {
  it("counts stopped and lost calls, which no response accounted for", () => {
    // The SDK's abort and connection errors carry no status.
    assert.equal(mayHaveBeenBilled(Object.assign(new Error("Request was aborted."), { name: "APIUserAbortError", status: undefined })), true)
    assert.equal(mayHaveBeenBilled(new DOMException("This operation was aborted", "AbortError")), true)
    assert.equal(mayHaveBeenBilled(new TypeError("fetch failed")), true)
    assert.equal(mayHaveBeenBilled(undefined), true)
  })

  it("leaves out calls the API answered with an error status", () => {
    assert.equal(mayHaveBeenBilled(Object.assign(new Error("400 bad request"), { status: 400 })), false)
    assert.equal(mayHaveBeenBilled(Object.assign(new Error("529 overloaded"), { status: 529 })), false)
  })
})
