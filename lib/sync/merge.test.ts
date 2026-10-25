import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { SavedChat } from "../chat/history.ts"
import { chatsToUpload, mergeChats, mergeFinances, mergeNewest, mergeProgress } from "./merge.ts"

const chat = (id: string, updatedAt: string, text = "Q"): SavedChat => ({
  id,
  title: id,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt,
  messages: [{ role: "user", content: text }],
})

describe("mergeChats", () => {
  it("unions both sides and keeps the newer copy of a shared chat", () => {
    const merged = mergeChats(
      [chat("a", "2026-02-01T00:00:00Z", "local newer"), chat("b", "2026-01-05T00:00:00Z")],
      [chat("a", "2026-01-10T00:00:00Z", "remote older"), chat("c", "2026-03-01T00:00:00Z")]
    )
    assert.deepEqual(merged.map((c) => c.id), ["c", "a", "b"])
    assert.equal(merged.find((c) => c.id === "a")?.messages[0].content, "local newer")
  })

  it("lists only chats the server doesn't already have at that version", () => {
    const chats = [chat("a", "2"), chat("b", "5"), chat("c", "1")]
    const upload = chatsToUpload(chats, new Map([["a", "2"], ["b", "4"]]))
    assert.deepEqual(upload.map((c) => c.id), ["b", "c"])
  })
})

describe("mergeProgress", () => {
  it("unions completed lessons and keeps the best scores", () => {
    assert.deepEqual(
      mergeProgress(
        { completed: ["a", "b"], quizScores: { a: 2, b: 3 } },
        { completed: ["b", "c"], quizScores: { a: 3, c: 1 } }
      ),
      { completed: ["b", "c", "a"], quizScores: { a: 3, b: 3, c: 1 } }
    )
  })
})

describe("mergeFinances", () => {
  const file = (importedAt: string) => ({ fileName: importedAt, importedAt, transactions: [] })

  it("keeps the most recent import", () => {
    assert.equal(mergeFinances(file("2026-02-01"), file("2026-01-01"))?.fileName, "2026-02-01")
    assert.equal(mergeFinances(file("2026-01-01"), file("2026-02-01"))?.fileName, "2026-02-01")
    assert.equal(mergeFinances(null, file("2026-01-01"))?.fileName, "2026-01-01")
    assert.equal(mergeFinances(null, null), null)
  })
})

describe("mergeNewest", () => {
  it("keeps whichever copy was saved last, and ignores empty ones", () => {
    const older = { updatedAt: "2026-10-01T00:00:00.000Z", v: 1 }
    const newer = { updatedAt: "2026-10-02T00:00:00.000Z", v: 2 }
    assert.equal(mergeNewest(older, newer), newer)
    assert.equal(mergeNewest(newer, older), newer)
    assert.equal(mergeNewest(null, older), older)
    assert.equal(mergeNewest({ updatedAt: "", v: 0 }, older), older)
    assert.equal(mergeNewest(older, null), older)
  })
})
