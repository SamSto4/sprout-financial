import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  checkDeletionCode,
  confirmsDeletion,
  deleteAccountEverywhere,
  DELETION_RECORD_DAYS,
  deletionRecordExpiry,
  sessionsEndedAt,
  type DeletionCodeDeps,
  type DeletionDeps,
} from "./account-deletion.ts"
import { isSessionStale } from "./session-version.ts"

describe("sessionsEndedAt with Sign out everywhere", () => {
  const reset = new Date("2026-10-01T00:00:00Z")
  const revoked = new Date("2026-10-27T10:00:00Z")

  it("is the latest of the reset, the sign-out everywhere and the deletion", () => {
    assert.equal(sessionsEndedAt(reset, revoked, null)?.getTime(), revoked.getTime())
    assert.equal(sessionsEndedAt(revoked, reset, undefined)?.getTime(), revoked.getTime())
    assert.equal(sessionsEndedAt(undefined, revoked)?.getTime(), revoked.getTime())
    assert.equal(sessionsEndedAt(), null)
  })

  it("ends every session that began before it, this device's included, and none after", () => {
    const ended = sessionsEndedAt(reset, revoked, null)
    assert.equal(isSessionStale(reset.getTime() + 1, ended), true)
    assert.equal(isSessionStale(revoked.getTime() - 1, ended), true)
    assert.equal(isSessionStale(revoked.getTime() + 1, ended), false)
  })
})

describe("checkDeletionCode", () => {
  function deps(overrides: Partial<DeletionCodeDeps["code"]> & { enabled?: boolean; waived?: boolean } = {}) {
    const calls = { limited: 0, check: [] as string[], wrong: 0, notices: 0 }
    const value: DeletionCodeDeps = {
      twoFactorEnabled: async () => overrides.enabled ?? true,
      codeWaived: async () => overrides.waived ?? false,
      code: {
        limited:
          overrides.limited ??
          (async () => {
            calls.limited++
            return null
          }),
        check:
          overrides.check ??
          (async (code) => {
            calls.check.push(code)
            return code === "123456" ? { status: "ok", usedRecoveryCode: false } : { status: "invalid" }
          }),
        wrongCode: async () => {
          calls.wrong++
        },
        limitReached: () => {
          calls.notices++
        },
      },
    }
    return { value, calls }
  }

  it("asks for nothing more when two-step verification is off", async () => {
    const { value, calls } = deps({ enabled: false })
    assert.deepEqual(await checkDeletionCode({ confirm: "sam@example.com" }, value), { ok: true })
    assert.equal(calls.limited, 0)
    assert.deepEqual(calls.check, [])
  })

  it("refuses without a code when it's on, without checking or counting anything", async () => {
    for (const body of [{ confirm: "sam@example.com" }, { code: "" }, { code: "   " }, { code: 123456 }, { code: "1".repeat(65) }, null, "x"]) {
      const { value, calls } = deps()
      const outcome = await checkDeletionCode(body, value)
      assert.equal(outcome.ok, false, JSON.stringify(body))
      assert.ok(!outcome.ok && outcome.status === 403 && outcome.needsCode === true)
      assert.equal(calls.limited, 0)
      assert.deepEqual(calls.check, [])
      assert.equal(calls.wrong, 0)
    }
  })

  it("refuses a wrong code, writes it to the security log, and accepts the right one", async () => {
    const { value, calls } = deps()
    const wrong = await checkDeletionCode({ code: "000000" }, value)
    assert.ok(!wrong.ok && wrong.status === 403 && wrong.needsCode === true && /didn't work/.test(wrong.error))
    assert.equal(calls.wrong, 1)
    assert.deepEqual(await checkDeletionCode({ code: "123456" }, value), { ok: true })
    assert.deepEqual(calls.check, ["000000", "123456"])
    assert.equal(calls.limited, 2)
    assert.equal(calls.wrong, 1)
  })

  it("stops at the limit before checking the code, and tells the owner", async () => {
    const { value, calls } = deps({ limited: async () => 420 })
    const outcome = await checkDeletionCode({ code: "123456" }, value)
    assert.deepEqual(outcome, { ok: false, status: 429, retryAfterSeconds: 420, error: "Too many codes tried. Please wait a few minutes and try again." })
    assert.deepEqual(calls.check, [])
    assert.equal(calls.notices, 1)
    assert.equal(calls.wrong, 0)
  })

  it("refuses when the code can't be checked, never lets it through", async () => {
    const { value } = deps({ check: async () => ({ status: "unavailable" }) })
    const outcome = await checkDeletionCode({ code: "123456" }, value)
    assert.ok(!outcome.ok && outcome.status === 503)
  })

  it("goes ahead if two-step verification was turned off in the meantime", async () => {
    const { value } = deps({ check: async () => ({ status: "not-enabled" }) })
    assert.deepEqual(await checkDeletionCode({ code: "123456" }, value), { ok: true })
  })

  it("takes a fresh Google sign-in in place of the code, without counting or checking one", async () => {
    const { value, calls } = deps({ waived: true })
    assert.deepEqual(await checkDeletionCode({ confirm: "sam@example.com" }, value), { ok: true })
    assert.equal(calls.limited, 0)
    assert.deepEqual(calls.check, [])
  })
})

describe("confirmsDeletion", () => {
  it("accepts the account's own email, however it's typed", () => {
    assert.equal(confirmsDeletion("sam@example.com", "sam@example.com"), true)
    assert.equal(confirmsDeletion("  Sam@Example.COM ", "sam@example.com"), true)
  })

  it("refuses anything else, so a stray click or a crafted request can't delete the account", () => {
    for (const confirm of ["", "   ", "someone@example.com", "sam@example.co", "DELETE", undefined, null, true, ["sam@example.com"]]) {
      assert.equal(confirmsDeletion(confirm, "sam@example.com"), false, JSON.stringify(confirm))
    }
    assert.equal(confirmsDeletion("x".repeat(300), "x".repeat(300)), false)
  })
})

describe("sessionsEndedAt", () => {
  const reset = new Date("2026-10-01T00:00:00Z")
  const deleted = new Date("2026-10-26T08:00:00Z")

  it("is the later of the password reset and the deletion", () => {
    assert.equal(sessionsEndedAt(reset, deleted)?.getTime(), deleted.getTime())
    assert.equal(sessionsEndedAt(deleted, reset)?.getTime(), deleted.getTime())
    assert.equal(sessionsEndedAt(null, deleted)?.getTime(), deleted.getTime())
    assert.equal(sessionsEndedAt(reset, undefined)?.getTime(), reset.getTime())
  })

  it("is null when neither happened, or a date is unreadable", () => {
    assert.equal(sessionsEndedAt(null, null), null)
    assert.equal(sessionsEndedAt(new Date("nope"), undefined), null)
  })

  it("ends a session on another device that began before the deletion", () => {
    const otherDevice = deleted.getTime() - 60_000
    assert.equal(isSessionStale(otherDevice, sessionsEndedAt(null, deleted)), true)
  })

  it("lets someone sign up again with the same email afterwards", () => {
    const newSession = deleted.getTime() + 5_000
    assert.equal(isSessionStale(newSession, sessionsEndedAt(null, deleted)), false)
  })
})

describe("deletionRecordExpiry", () => {
  it("outlives the longest session (30 days)", () => {
    const deleted = new Date("2026-10-26T08:00:00Z")
    const days = (deletionRecordExpiry(deleted).getTime() - deleted.getTime()) / 86_400_000
    assert.equal(days, DELETION_RECORD_DAYS)
    assert.ok(days > 30)
  })
})

/**
 * A stand-in for MongoDB: users, synced rows, and a sync write that (like requireUser) is only
 * accepted while the user exists.
 */
function fakeStore(email: string) {
  const store = { users: new Set([email]), rows: new Set([`${email}:chat-1`, `${email}:finances`]), deleted: [] as string[] }
  const sync = (row: string) => {
    if (store.users.has(email)) store.rows.add(`${email}:${row}`)
  }
  const deps: DeletionDeps = {
    async deleteData(target) {
      for (const row of [...store.rows]) if (row.startsWith(`${target}:`)) store.rows.delete(row)
    },
    async deleteUser(target) {
      store.users.delete(target)
      store.deleted.push(target)
    },
  }
  return { store, sync, deps }
}

describe("deleteAccountEverywhere", () => {
  const email = "sam@example.com"

  it("removes the user and every synced row", async () => {
    const { store, deps } = fakeStore(email)
    assert.deepEqual(await deleteAccountEverywhere(email, deps), { leftovers: false })
    assert.equal(store.users.size, 0)
    assert.equal(store.rows.size, 0)
    assert.deepEqual(store.deleted, [email])
  })

  it("leaves nothing behind when another device syncs in the middle of the deletion", async () => {
    const { store, sync, deps } = fakeStore(email)
    await deleteAccountEverywhere(email, {
      deleteData: deps.deleteData,
      async deleteUser(target) {
        sync("portfolio") // lands after the first data pass, while the user still exists
        await deps.deleteUser(target)
        sync("budget") // refused: the user is gone
      },
    })
    assert.equal(store.rows.size, 0)
  })

  it("doesn't fail once the user is gone: a late write is reported as leftovers, not an error", async () => {
    const { store, deps } = fakeStore(email)
    let calls = 0
    const result = await deleteAccountEverywhere(email, {
      deleteUser: deps.deleteUser,
      async deleteData(target) {
        if (++calls === 2) throw new Error("db hiccup")
        await deps.deleteData(target)
      },
    })
    assert.deepEqual(result, { leftovers: true })
    assert.equal(store.users.size, 0)
  })

  it("keeps the account when deleting data fails, so the person can try again", async () => {
    const { store, deps } = fakeStore(email)
    await assert.rejects(
      deleteAccountEverywhere(email, { ...deps, deleteData: async () => Promise.reject(new Error("db down")) }),
      /db down/
    )
    assert.ok(store.users.has(email))
  })

  it("only touches the given account", async () => {
    const { store, deps } = fakeStore(email)
    store.rows.add("other@example.com:chat-9")
    await deleteAccountEverywhere(email, deps)
    assert.deepEqual([...store.rows], ["other@example.com:chat-9"])
  })
})
