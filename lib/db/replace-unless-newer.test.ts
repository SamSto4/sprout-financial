import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { isDuplicateKeyError, replaceUnlessNewer } from "./replace-unless-newer.ts"

const duplicateKey = Object.assign(new Error("E11000 duplicate key error"), { code: 11000 })

type Copy = { id: string; updatedAt: string; text: string }

/**
 * A stand-in for the chats collection as saveChat uses it: one copy per id (the unique index), a
 * replaceOne whose filter matches a stored copy updated at or before this one, and an upsert that
 * inserts when nothing matched. `beforeInsert` lets a test slip another request in between the
 * upsert's miss and its insert.
 */
function store(initial: Copy[] = [], beforeInsert?: () => void) {
  const rows = new Map(initial.map((copy) => [copy.id, copy]))
  const save = (copy: Copy) =>
    replaceUnlessNewer(async (upsert) => {
      const stored = rows.get(copy.id)
      if (stored && stored.updatedAt <= copy.updatedAt) {
        rows.set(copy.id, copy)
        return { matchedCount: 1 }
      }
      if (!upsert) return { matchedCount: 0 }
      beforeInsert?.()
      if (rows.has(copy.id)) throw duplicateKey
      rows.set(copy.id, copy)
      return { matchedCount: 0 }
    })
  return { rows, save }
}

describe("replaceUnlessNewer (saving a synced chat)", () => {
  it("creates a chat the account doesn't have, and replaces an older copy", async () => {
    const { rows, save } = store([{ id: "a", updatedAt: "2026-10-01T12:00:00.000Z", text: "old" }])
    assert.equal(await save({ id: "b", updatedAt: "2026-10-01T12:00:00.000Z", text: "new chat" }), true)
    assert.equal(await save({ id: "a", updatedAt: "2026-10-02T09:00:00.000Z", text: "newer" }), true)
    assert.deepEqual([...rows.values()].map((copy) => copy.text), ["newer", "new chat"])
  })

  it("keeps a newer copy that another device saved when an old copy is uploaded (the truncated-load case)", async () => {
    // The phone added two messages on Oct 2; the laptop still has the Oct 1 copy and uploads it.
    const phone = { id: "chat-x", updatedAt: "2026-10-02T08:00:00.000Z", text: "4 messages" }
    const { rows, save } = store([phone])
    assert.equal(await save({ id: "chat-x", updatedAt: "2026-10-01T12:00:00.000Z", text: "2 messages" }), false)
    assert.equal(rows.get("chat-x")?.text, "4 messages")
    // The same version again lands: it's the copy the account already has.
    assert.equal(await save(phone), true)
  })

  it("still saves the newer of two copies of a new chat created at the same moment", async () => {
    // Another request inserts an older copy after this one's upsert found nothing to replace.
    const racing = store([], () => racing.rows.set("c", { id: "c", updatedAt: "2026-10-01T00:00:00.000Z", text: "older" }))
    assert.equal(await racing.save({ id: "c", updatedAt: "2026-10-03T00:00:00.000Z", text: "newer" }), true)
    assert.equal(racing.rows.get("c")?.text, "newer")
  })

  it("stores the copy when the filter matches an older copy, or inserts it when there's none", async () => {
    const calls: boolean[] = []
    const saved = await replaceUnlessNewer(async (upsert) => {
      calls.push(upsert)
      return { matchedCount: 1 }
    })
    assert.equal(saved, true)
    assert.deepEqual(calls, [true], "one upsert, nothing more")
  })

  it("keeps a newer stored copy: the upsert's insert hits the unique index and the retry matches nothing", async () => {
    const calls: boolean[] = []
    const saved = await replaceUnlessNewer(async (upsert) => {
      calls.push(upsert)
      if (upsert) throw duplicateKey
      return { matchedCount: 0 }
    })
    assert.equal(saved, false)
    assert.deepEqual(calls, [true, false], "the retry never inserts")
  })

  it("still lands when another request inserted an older copy of the same new chat a moment earlier", async () => {
    const saved = await replaceUnlessNewer(async (upsert) => {
      if (upsert) throw duplicateKey
      return { matchedCount: 1 }
    })
    assert.equal(saved, true)
  })

  it("passes on every other error", async () => {
    await assert.rejects(
      replaceUnlessNewer(async () => {
        throw new Error("connection reset")
      }),
      /connection reset/
    )
  })

  it("recognizes only MongoDB's duplicate key code", () => {
    assert.equal(isDuplicateKeyError(duplicateKey), true)
    assert.equal(isDuplicateKeyError({ code: 11000 }), true)
    assert.equal(isDuplicateKeyError(new Error("E11000 duplicate key error")), false, "the message alone isn't enough")
    assert.equal(isDuplicateKeyError({ code: "11000" }), false)
    assert.equal(isDuplicateKeyError(null), false)
  })
})
