import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { isFreshGoogleSignIn } from "./session-version.ts"
import { beginSetup, GOOGLE_AGAIN, WRONG_PASSWORD, type BeginSetupDeps } from "./two-factor-setup.ts"

function deps(options: { hasPassword: boolean | null; password?: string; limited?: string | null; alreadyOn?: boolean; freshGoogle?: boolean }) {
  const calls = { start: 0, checked: [] as string[], wrong: 0, limited: 0, fresh: 0 }
  const value: BeginSetupDeps = {
    limited: async () => {
      calls.limited++
      return options.limited ?? null
    },
    hasPassword: async () => options.hasPassword,
    freshGoogleSignIn: async () => {
      calls.fresh++
      return options.freshGoogle ?? false
    },
    checkPassword: async (_email, typed) => {
      calls.checked.push(typed)
      return typed === options.password
    },
    start: async () => {
      calls.start++
      return options.alreadyOn ? null : { qrSvg: "<svg/>", secret: "ABCD EFGH" }
    },
    wrongPassword: async () => {
      calls.wrong++
    },
  }
  return { value, calls }
}

describe("beginSetup", () => {
  it("asks a password account for its current password, and never starts setup with a wrong one", async () => {
    const { value, calls } = deps({ hasPassword: true, password: "correct horse" })
    assert.deepEqual(await beginSetup("sam@example.com", "wrong horse", value), { ok: false, error: WRONG_PASSWORD })
    assert.equal(calls.start, 0)
    assert.equal(calls.wrong, 1)
  })

  it("refuses a missing, empty or oversized password without checking it", async () => {
    for (const typed of [undefined, null, "", 42, "x".repeat(201)]) {
      const { value, calls } = deps({ hasPassword: true, password: "correct horse" })
      const result = await beginSetup("sam@example.com", typed, value)
      assert.equal(result.ok, false, String(typed))
      assert.deepEqual(calls.checked, [])
      assert.equal(calls.start, 0)
    }
  })

  it("starts setup once the password is right", async () => {
    const { value, calls } = deps({ hasPassword: true, password: "correct horse" })
    assert.deepEqual(await beginSetup("sam@example.com", "correct horse", value), { ok: true, qrSvg: "<svg/>", secret: "ABCD EFGH" })
    assert.equal(calls.start, 1)
    assert.equal(calls.wrong, 0)
  })

  it("doesn't ask a Google-only account for a password it doesn't have, once it has just logged in with Google", async () => {
    const { value, calls } = deps({ hasPassword: false, freshGoogle: true })
    assert.equal((await beginSetup("sam@example.com", "", value)).ok, true)
    assert.deepEqual(calls.checked, [])
    assert.equal(calls.start, 1)
  })

  it("asks a Google-only account to log in with Google again when its session isn't fresh", async () => {
    const { value, calls } = deps({ hasPassword: false, freshGoogle: false })
    assert.deepEqual(await beginSetup("sam@example.com", "", value), { ok: false, error: GOOGLE_AGAIN, reauth: "google" })
    // A password typed anyway changes nothing: there's none to check.
    assert.deepEqual(await beginSetup("sam@example.com", "guess", value), { ok: false, error: GOOGLE_AGAIN, reauth: "google" })
    assert.equal(calls.start, 0)
    assert.deepEqual(calls.checked, [])
  })

  it("treats an old session, one with no sign-in record and a fresh Google sign-in as the session check says", async () => {
    const now = Date.UTC(2026, 9, 27, 12, 0, 0)
    const sessions = [
      { name: "old Google session", method: "google", at: now - 3 * 24 * 60 * 60_000, starts: false },
      { name: "session from before sign-ins were recorded", method: undefined, at: undefined, starts: false },
      { name: "fresh password sign-in", method: "password", at: now - 60_000, starts: false },
      { name: "fresh Google sign-in", method: "google", at: now - 60_000, starts: true },
    ]
    for (const session of sessions) {
      const { value, calls } = deps({ hasPassword: false, freshGoogle: isFreshGoogleSignIn(session.method, session.at, now) })
      const result = await beginSetup("sam@example.com", "", value)
      assert.equal(result.ok, session.starts, session.name)
      assert.equal(calls.start, session.starts ? 1 : 0, session.name)
    }
  })

  it("never needs a fresh Google sign-in from a password account", async () => {
    const { value, calls } = deps({ hasPassword: true, password: "correct horse", freshGoogle: false })
    assert.equal((await beginSetup("sam@example.com", "correct horse", value)).ok, true)
    assert.equal(calls.fresh, 0)
  })

  it("counts every try, and stops before checking the password once the limit is used up", async () => {
    const { value, calls } = deps({ hasPassword: true, password: "correct horse", limited: "Too many tries." })
    assert.deepEqual(await beginSetup("sam@example.com", "correct horse", value), { ok: false, error: "Too many tries." })
    assert.equal(calls.limited, 1)
    assert.deepEqual(calls.checked, [])
    assert.equal(calls.start, 0)
  })

  it("refuses when the account can't be found or two-step verification is already on", async () => {
    assert.equal((await beginSetup("sam@example.com", "x", deps({ hasPassword: null }).value)).ok, false)
    const already = await beginSetup("sam@example.com", "correct horse", deps({ hasPassword: true, password: "correct horse", alreadyOn: true }).value)
    assert.deepEqual(already, { ok: false, error: "Two-step verification is already on." })
  })
})
