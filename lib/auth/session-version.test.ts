import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { createChangedAtCache, isSessionExpired, isSessionStale, MAX_SESSION_AGE_MS, PASSWORD_CHECK_CACHE_MS } from "./session-version.ts"

describe("isSessionStale", () => {
  const changed = new Date("2026-10-25T12:00:00Z")

  it("keeps sessions when the password was never reset", () => {
    assert.equal(isSessionStale(Date.now(), null), false)
    assert.equal(isSessionStale(undefined, undefined), false)
  })

  it("ends sessions that started before the reset, and keeps ones after it", () => {
    assert.equal(isSessionStale(changed.getTime() - 1, changed), true)
    assert.equal(isSessionStale(changed.getTime() + 1, changed), false)
  })

  it("ends cookies from before this check existed once the password has been reset", () => {
    assert.equal(isSessionStale(undefined, changed), true)
    assert.equal(isSessionStale("yesterday", changed), true)
  })
})

describe("createChangedAtCache", () => {
  it("remembers a value briefly, including 'never changed'", () => {
    let now = 0
    const cache = createChangedAtCache(() => now)
    assert.equal(cache.get("a@b.co"), undefined)
    cache.set("a@b.co", null)
    assert.equal(cache.get("a@b.co"), null)
    now = PASSWORD_CHECK_CACHE_MS + 1
    assert.equal(cache.get("a@b.co"), undefined)
  })

  it("forgets on demand", () => {
    const cache = createChangedAtCache(() => 0)
    cache.set("a@b.co", new Date(5))
    cache.forget("a@b.co")
    assert.equal(cache.get("a@b.co"), undefined)
  })
})

describe("isSessionExpired", () => {
  const start = Date.UTC(2026, 9, 1)

  it("keeps a session for 30 days from sign-in, however active it is", () => {
    assert.equal(isSessionExpired(start, start + MAX_SESSION_AGE_MS - 1), false)
    assert.equal(isSessionExpired(start, start + MAX_SESSION_AGE_MS + 1), true)
  })

  it("can't outlive the 31-day record of a password reset or account deletion", () => {
    assert.ok(MAX_SESSION_AGE_MS < 31 * 24 * 60 * 60 * 1000)
  })

  it("leaves sessions without a sign-in time to the caller (their clock starts on next use)", () => {
    assert.equal(isSessionExpired(undefined, start), false)
    assert.equal(isSessionExpired("yesterday", start), false)
  })
})
