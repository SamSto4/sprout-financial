import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { checkCode, type CodeCheckDeps, type CodeCheckResult } from "./two-factor-code.ts"

function deps(options: { wait?: number | null; result?: CodeCheckResult } = {}) {
  const calls = { limited: 0, checked: [] as string[], wrong: 0, notices: 0 }
  const value: CodeCheckDeps = {
    limited: async () => {
      calls.limited++
      return options.wait ?? null
    },
    check: async (code) => {
      calls.checked.push(code)
      return options.result ?? { status: "invalid" }
    },
    wrongCode: async () => {
      calls.wrong++
    },
    limitReached: () => {
      calls.notices++
    },
  }
  return { value, calls }
}

describe("checkCode", () => {
  it("counts every code before checking it, and logs each wrong one", async () => {
    const { value, calls } = deps()
    for (const code of ["000000", "111111", "aaaa-bbbb-cccc-dddd"]) assert.deepEqual(await checkCode(code, value), { status: "invalid" })
    assert.equal(calls.limited, 3)
    assert.deepEqual(calls.checked, ["000000", "111111", "aaaa-bbbb-cccc-dddd"])
    assert.equal(calls.wrong, 3)
    assert.equal(calls.notices, 0)
  })

  it("passes a right code through without logging it as wrong", async () => {
    const { value, calls } = deps({ result: { status: "ok", usedRecoveryCode: true } })
    assert.deepEqual(await checkCode("123456", value), { status: "ok", usedRecoveryCode: true })
    assert.equal(calls.wrong, 0)
  })

  it("stops at the limit without checking the code, and tells the owner", async () => {
    const { value, calls } = deps({ wait: 600 })
    assert.deepEqual(await checkCode("123456", value), { status: "limited", retryAfterSeconds: 600 })
    assert.deepEqual(calls.checked, [])
    assert.equal(calls.notices, 1)
    assert.equal(calls.wrong, 0)
  })

  it("doesn't count or check a missing or unreadable code", async () => {
    for (const code of [undefined, null, "", "   ", 123456, "1".repeat(65), ["123456"]]) {
      const { value, calls } = deps()
      assert.deepEqual(await checkCode(code, value), { status: "missing" }, JSON.stringify(code))
      assert.equal(calls.limited, 0)
      assert.deepEqual(calls.checked, [])
    }
  })

  it("doesn't log a code that couldn't be checked as wrong", async () => {
    for (const status of ["unavailable", "not-enabled"] as const) {
      const { value, calls } = deps({ result: { status } })
      assert.deepEqual(await checkCode("123456", value), { status })
      assert.equal(calls.wrong, 0)
    }
  })
})
