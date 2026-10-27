import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { isDuplicateKeyError, saveIfNewer } from "./save-newer.ts"

type Copy = { id: string; updatedAt: string; text: string }

/** A stand-in for the chats collection: one copy per id (the unique index), ISO strings compared as MongoDB does. */
function store(initial: Copy[] = [], { before }: { before?: () => void } = {}) {
  const rows = new Map(initial.map((copy) => [copy.id, copy]))
  const save = (copy: Copy) =>
    saveIfNewer({
      replaceOlder: async () => {
        const stored = rows.get(copy.id)
        if (!stored || !(stored.updatedAt < copy.updatedAt)) return false
        rows.set(copy.id, copy)
        return true
      },
      insert: async () => {
        before?.()
        if (rows.has(copy.id)) return "exists"
        rows.set(copy.id, copy)
        return "inserted"
      },
    })
  return { rows, save }
}

describe("saveIfNewer (account chats)", () => {
  it("creates a chat the account doesn't have, and replaces an older copy", async () => {
    const { rows, save } = store([{ id: "a", updatedAt: "2026-10-01T12:00:00.000Z", text: "old" }])
    assert.equal(await save({ id: "b", updatedAt: "2026-10-01T12:00:00.000Z", text: "new chat" }), "saved")
    assert.equal(await save({ id: "a", updatedAt: "2026-10-02T09:00:00.000Z", text: "newer" }), "saved")
    assert.deepEqual([...rows.values()].map((copy) => copy.text), ["newer", "new chat"])
  })

  it("keeps a newer copy that another device saved, when an old copy is uploaded (the truncated-load case)", async () => {
    // The phone added two messages on Oct 2; the laptop still has the Oct 1 copy and uploads it.
    const phone = { id: "chat-x", updatedAt: "2026-10-02T08:00:00.000Z", text: "4 messages" }
    const { rows, save } = store([phone])
    assert.equal(await save({ id: "chat-x", updatedAt: "2026-10-01T12:00:00.000Z", text: "2 messages" }), "kept-newer")
    assert.equal(await save({ ...phone, text: "same version again" }), "kept-newer")
    assert.equal(rows.get("chat-x")?.text, "4 messages")
  })

  it("still saves the newer of two copies created at the same moment", async () => {
    // Another request inserts an older copy between this one's replace and insert.
    const racing = store([], { before: () => racing.rows.set("c", { id: "c", updatedAt: "2026-10-01T00:00:00.000Z", text: "older" }) })
    assert.equal(await racing.save({ id: "c", updatedAt: "2026-10-03T00:00:00.000Z", text: "newer" }), "saved")
    assert.equal(racing.rows.get("c")?.text, "newer")
  })

  it("recognizes MongoDB's duplicate key error, and only that", () => {
    assert.equal(isDuplicateKeyError(Object.assign(new Error("E11000 duplicate key"), { code: 11000 })), true)
    for (const other of [new Error("network"), { code: "11000" }, null, "E11000"]) assert.equal(isDuplicateKeyError(other), false)
  })
})
