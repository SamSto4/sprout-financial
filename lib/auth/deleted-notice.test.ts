import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { DELETED_NOTICE_KEY, DELETED_NOTICE_MS, markAccountDeleted, recentlyDeletedHere, tabStorage } from "./deleted-notice.ts"

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    values,
  }
}

const throwing = {
  getItem(): string | null {
    throw new Error("blocked")
  },
  setItem() {
    throw new Error("blocked")
  },
}

describe("the account-deleted notice", () => {
  const now = Date.UTC(2026, 9, 27, 12)

  it("shows only in a tab that deleted an account moments ago", () => {
    const storage = memoryStorage()
    // A typed or shared /?account=deleted link, in a tab that deleted nothing.
    assert.equal(recentlyDeletedHere(storage, now), false)
    markAccountDeleted(storage, now)
    assert.equal(storage.values.get(DELETED_NOTICE_KEY), String(now))
    assert.equal(recentlyDeletedHere(storage, now + 1_000), true)
    assert.equal(recentlyDeletedHere(storage, now + DELETED_NOTICE_MS), true)
  })

  it("stops showing after a few minutes", () => {
    const storage = memoryStorage()
    markAccountDeleted(storage, now)
    assert.equal(recentlyDeletedHere(storage, now + DELETED_NOTICE_MS + 1), false)
  })

  it("ignores a mark from the future or one that isn't a time", () => {
    const storage = memoryStorage()
    markAccountDeleted(storage, now + 60_000)
    assert.equal(recentlyDeletedHere(storage, now), false)
    for (const value of ["", "yes", "1e12", "-5", " 1", String(now) + "x"]) {
      storage.setItem(DELETED_NOTICE_KEY, value)
      assert.equal(recentlyDeletedHere(storage, now), false, value)
    }
  })

  it("does nothing, and shows nothing, when storage is missing or blocked", () => {
    assert.doesNotThrow(() => markAccountDeleted(null, now))
    assert.doesNotThrow(() => markAccountDeleted(throwing, now))
    assert.equal(recentlyDeletedHere(null, now), false)
    assert.equal(recentlyDeletedHere(throwing, now), false)
    // No window here, as on the server.
    assert.equal(tabStorage(), null)
  })
})
