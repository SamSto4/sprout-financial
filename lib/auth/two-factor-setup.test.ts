import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { beginSetup, WRONG_PASSWORD, type BeginSetupDeps } from "./two-factor-setup.ts"

function deps(options: { hasPassword: boolean | null; password?: string; limited?: string | null; alreadyOn?: boolean }) {
  const calls = { start: 0, checked: [] as string[], wrong: 0, limited: 0 }
  const value: BeginSetupDeps = {
    limited: async () => {
      calls.limited++
      return options.limited ?? null
    },
    hasPassword: async () => options.hasPassword,
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

  it("doesn't ask a Google-only account for a password it doesn't have", async () => {
    const { value, calls } = deps({ hasPassword: false })
    assert.equal((await beginSetup("sam@example.com", "", value)).ok, true)
    assert.deepEqual(calls.checked, [])
    assert.equal(calls.start, 1)
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
