import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  confirmsDeletion,
  deleteAccountEverywhere,
  DELETION_RECORD_DAYS,
  deletionRecordExpiry,
  sessionsEndedAt,
  type DeletionDeps,
} from "./account-deletion.ts"
import { isSessionStale } from "./session-version.ts"

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
    await deleteAccountEverywhere(email, deps)
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
