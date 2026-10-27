import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { SavedChat } from "../chat/history.ts"
import { chatsToUpload, mergeChats, mergeFinances, mergeNewest, mergeProgress, serverChatVersions } from "./merge.ts"

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

  it("never lists a copy older than the server's", () => {
    const upload = chatsToUpload([chat("a", "2026-09-01T00:00:00.000Z")], new Map([["a", "2026-10-08T00:00:00.000Z"]]))
    assert.deepEqual(upload, [])
  })
})

describe("chats a long account leaves out of its load", () => {
  // GET /api/account sent the 42 newest of 45 chats, and listed all 45 in chatVersions. This
  // laptop still has older copies of the three left out, which were continued on a phone since.
  const day = (n: number) => `2026-10-${String(n).padStart(2, "0")}T00:00:00.000Z`
  const onServer = Array.from({ length: 45 }, (_, index) => chat(`chat-${index}`, index < 42 ? day(28 - Math.floor(index / 3)) : day(9)))
  const loaded = onServer.slice(0, 42)
  const chatVersions = onServer.map(({ id, updatedAt }) => ({ id, updatedAt }))
  const laptop = [chat("chat-42", "2026-09-01T00:00:00.000Z"), chat("chat-43", "2026-09-01T00:00:00.000Z"), chat("only-here", day(27))]

  it("aren't uploaded over the server's newer copies, and only this browser's own new chats are", () => {
    const merged = mergeChats(laptop, loaded)
    const versions = serverChatVersions(loaded, chatVersions, merged)
    assert.equal(versions.get("chat-42"), day(9))
    assert.deepEqual(chatsToUpload(merged, versions).map((c) => c.id), ["only-here"])
    // Without the list, the stale copies would go up (the server would keep its own: saveChat).
    const loadedOnly = new Map(loaded.map((c) => [c.id, c.updatedAt]))
    assert.deepEqual(chatsToUpload(merged, loadedOnly).map((c) => c.id).sort(), ["chat-42", "chat-43", "only-here"])
  })

  it("are never deleted from the server when this browser doesn't have them", () => {
    const merged = mergeChats(laptop, loaded)
    const versions = serverChatVersions(loaded, chatVersions, merged)
    assert.equal(versions.has("chat-44"), false, "left out, and not on this laptop: not tracked, so not deleted")
    // What pushChats deletes: chats the server holds that this browser doesn't.
    const kept = new Set(merged.map((c) => c.id))
    assert.deepEqual([...versions.keys()].filter((id) => !kept.has(id)), [])
  })

  it("are uploaded when this browser's copy is the newer one", () => {
    const newer = [chat("chat-43", day(29))]
    const merged = mergeChats(newer, loaded)
    assert.deepEqual(chatsToUpload(merged, serverChatVersions(loaded, chatVersions, merged)).map((c) => c.id), ["chat-43"])
  })

  it("read the list defensively: malformed entries are skipped, and the loaded chats' own versions win", () => {
    const versions = serverChatVersions(
      [chat("a", day(2))],
      [
        { id: "a", updatedAt: day(1) },
        { id: "b", updatedAt: day(3) },
        { id: "bad id", updatedAt: day(3) },
        { id: "c", updatedAt: 5 },
        { id: "d", updatedAt: "x".repeat(41) },
        { id: "e", updatedAt: "not a date" },
        null,
        "f",
      ],
      [chat("a", day(2)), chat("b", day(1)), chat("bad id", day(1)), chat("c", day(1)), chat("d", day(1)), chat("e", day(1))]
    )
    assert.deepEqual([...versions], [["a", day(2)], ["b", day(3)]])
    assert.deepEqual([...serverChatVersions([chat("a", day(2))], "not a list", [chat("a", day(2))])], [["a", day(2)]])
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
