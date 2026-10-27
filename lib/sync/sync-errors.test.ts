import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { SyncLimited, syncResponseError, SyncSignedOut } from "./sync-errors.ts"

const response = (status: number, headers: Record<string, string> = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name: string) => headers[name] ?? null },
})

describe("syncResponseError", () => {
  it("is null for a success", () => {
    assert.equal(syncResponseError(response(200), "PUT /x"), null)
    assert.equal(syncResponseError(response(204), "PUT /x"), null)
  })

  it("reads a 401 as signed out, so sync stops instead of retrying forever", () => {
    // Sign out everywhere, a reset or a deletion on another device: every later upload gets 401 too.
    assert.ok(syncResponseError(response(401), "PUT /api/account/data/budget") instanceof SyncSignedOut)
  })

  it("reads a 429 as a pause for Retry-After seconds, within bounds", () => {
    const limited = syncResponseError(response(429, { "Retry-After": "30" }), "PUT /x")
    assert.ok(limited instanceof SyncLimited)
    assert.equal(limited.retryInMs, 30_000)
    assert.equal((syncResponseError(response(429, { "Retry-After": "1" }), "PUT /x") as SyncLimited).retryInMs, 5_000)
    assert.equal((syncResponseError(response(429, { "Retry-After": "86400" }), "PUT /x") as SyncLimited).retryInMs, 600_000)
    // No header (a proxy's 429) or one that isn't a number: a minute.
    assert.equal((syncResponseError(response(429), "PUT /x") as SyncLimited).retryInMs, 60_000)
    assert.equal((syncResponseError(response(429, { "Retry-After": "soon" }), "PUT /x") as SyncLimited).retryInMs, 60_000)
  })

  it("reads anything else as a plain failure to retry on the next change", () => {
    for (const status of [400, 403, 413, 500, 503]) {
      const error = syncResponseError(response(status), "PUT /api/account/chats/a")
      assert.ok(error instanceof Error)
      assert.ok(!(error instanceof SyncSignedOut) && !(error instanceof SyncLimited))
      assert.equal(error.message, `PUT /api/account/chats/a failed with ${status}`)
    }
  })
})
