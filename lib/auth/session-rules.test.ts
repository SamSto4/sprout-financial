import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { isSessionRevoked, sessionStartedAt } from "./session-rules.ts"

const RESET = new Date("2026-10-25T12:00:00Z")

describe("isSessionRevoked", () => {
  it("ends a session that began before the password was reset (the attacker's old cookie)", () => {
    assert.equal(isSessionRevoked(RESET.getTime() - 60_000, RESET), true)
  })

  it("keeps a session that began after the reset (the owner logging in with the new password)", () => {
    assert.equal(isSessionRevoked(RESET.getTime() + 1_000, RESET), false)
  })

  it("keeps every session on an account whose password never changed", () => {
    assert.equal(isSessionRevoked(0, undefined), false)
    assert.equal(isSessionRevoked(null, null), false)
  })

  it("ends a session it can't date once the password has changed", () => {
    assert.equal(isSessionRevoked(null, RESET), true)
  })

  it("ignores an unreadable change date instead of signing everyone out", () => {
    assert.equal(isSessionRevoked(0, new Date("not a date")), false)
  })
})

describe("sessionStartedAt", () => {
  it("prefers signedInAt (milliseconds)", () => {
    assert.equal(sessionStartedAt({ signedInAt: 1_000_500, iat: 5 }), 1_000_500)
  })

  it("falls back to iat (seconds) for sessions made before signedInAt existed", () => {
    assert.equal(sessionStartedAt({ iat: 1_700_000_000 }), 1_700_000_000_000)
  })

  it("returns null when neither is a usable number", () => {
    assert.equal(sessionStartedAt({}), null)
    assert.equal(sessionStartedAt({ signedInAt: "yesterday", iat: Number.NaN }), null)
  })
})
