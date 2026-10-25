import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  chatTextLength,
  chatTitle,
  MAX_CONTEXT_CHAT_LENGTH,
  MAX_CONTEXT_CHATS,
  MAX_SAVED_CHATS,
  MAX_SYNCED_CHAT_LENGTH,
  parsePastChats,
  parseSavedChats,
  searchPastChats,
  toPastChats,
  upsertChat,
  type SavedChat,
} from "./history.ts"
import { MAX_ASSISTANT_MESSAGE_LENGTH, MAX_TOTAL_LENGTH } from "./validate.ts"

function chat(id: string, updatedAt: string, contents: string[]): SavedChat {
  return {
    id,
    title: chatTitle([{ role: "user", content: contents[0] }]),
    createdAt: updatedAt,
    updatedAt,
    messages: contents.map((content, index) => ({ role: index % 2 ? "assistant" : "user", content })),
  }
}

describe("chatTitle", () => {
  it("uses the first question, shortened", () => {
    assert.equal(chatTitle([{ role: "user", content: "  How   do I budget? " }]), "How do I budget?")
    assert.equal(chatTitle([{ role: "user", content: "x".repeat(100) }]).length, 58)
    assert.equal(chatTitle([]), "New chat")
  })
})

describe("saved chats", () => {
  it("parses storage, dropping malformed chats and empty messages, newest first", () => {
    const chats = parseSavedChats([
      chat("old", "2026-01-01T00:00:00Z", ["Old question"]),
      { id: "broken" },
      { ...chat("new", "2026-02-01T00:00:00Z", ["New question"]), messages: [
        { role: "user", content: "New question" },
        { role: "assistant", content: "" },
        { role: "system", content: "sneaky" },
      ] },
    ])
    assert.deepEqual(chats.map((c) => c.id), ["new", "old"])
    assert.equal(chats[0].messages.length, 1)
    assert.deepEqual(parseSavedChats("nope"), [])
  })

  it("upserts by id and caps the list", () => {
    let chats: SavedChat[] = []
    for (let i = 0; i < MAX_SAVED_CHATS + 5; i++) {
      chats = upsertChat(chats, chat(`c${i}`, `2026-01-01T00:00:${String(i).padStart(2, "0")}Z`, ["Q"]))
    }
    assert.equal(chats.length, MAX_SAVED_CHATS)
    chats = upsertChat(chats, { ...chats[10], updatedAt: "2027-01-01T00:00:00Z" })
    assert.equal(chats.length, MAX_SAVED_CHATS)
    assert.equal(chats[0].updatedAt, "2027-01-01T00:00:00Z")
  })
})

describe("past chats for context", () => {
  it("excludes the open chat and caps size", () => {
    const chats = Array.from({ length: MAX_CONTEXT_CHATS + 3 }, (_, i) =>
      chat(`c${i}`, `2026-01-${String(28 - i).padStart(2, "0")}T00:00:00Z`, ["a".repeat(3000), "b".repeat(3000), "c".repeat(3000), "d".repeat(3000), "e".repeat(3000), "f".repeat(3000)])
    )
    const past = toPastChats(chats, "c0")
    assert.equal(past.length, MAX_CONTEXT_CHATS)
    assert.equal(past[0].id, "c1")
    for (const entry of past) {
      const total = entry.messages.reduce((sum, message) => sum + message.content.length, 0)
      assert.ok(total <= MAX_CONTEXT_CHAT_LENGTH)
    }
  })

  it("re-validates on the server", () => {
    const parsed = parsePastChats([
      { id: "a", title: "Budget", updatedAt: "2026-01-01", messages: [{ role: "user", content: "x".repeat(5000) }] },
      { id: "", updatedAt: "2026-01-01", messages: [] },
    ])
    assert.equal(parsed.length, 1)
    assert.ok(parsed[0].messages[0].content.length <= 1500)
  })
})

describe("searchPastChats", () => {
  const chats = toPastChats(
    [
      chat("goal", "2026-03-01T00:00:00Z", ["I want to save for a house deposit of $40,000 in 5 years.", "That's about $667 a month."]),
      chat("debt", "2026-02-01T00:00:00Z", ["My credit card APR is 24% and I owe $3,000.", "Pay that down first."]),
    ],
    ""
  )

  it("finds the messages that match the most words", () => {
    const matches = searchPastChats(chats, "what was my house deposit goal?")
    assert.equal(matches[0].chatId, "goal")
    assert.match(matches[0].excerpt, /house deposit/)
  })

  it("returns nothing for stop words only", () => {
    assert.deepEqual(searchPastChats(chats, "what did we talk about last time"), [])
  })
})

describe("synced chat size cap", () => {
  const message = (role: "user" | "assistant", length: number) => ({ role, content: "x".repeat(length) })

  it("counts the text of every message", () => {
    assert.equal(chatTextLength({ messages: [message("user", 10), message("assistant", 25)] }), 35)
  })

  it("fits the biggest chat the app can really produce: a full history plus one long final reply", () => {
    // MAX_TOTAL_LENGTH is the most history /api/chat accepts; deep research can then add a reply of
    // up to 16k tokens (~70,000 characters) before the conversation can't continue.
    assert.ok(MAX_TOTAL_LENGTH + 70_000 < MAX_SYNCED_CHAT_LENGTH)
    assert.ok(MAX_ASSISTANT_MESSAGE_LENGTH < MAX_SYNCED_CHAT_LENGTH)
  })

  it("refuses the multi-megabyte chats a crafted request could send", () => {
    const [crafted] = parseSavedChats([
      { id: "abc", updatedAt: "2026-10-26", messages: Array.from({ length: 200 }, (_, i) => message(i % 2 ? "assistant" : "user", 20_000)) },
    ])
    assert.ok(crafted, "the parser still reads it (browsers keep their own copy)")
    assert.ok(chatTextLength(crafted) > MAX_SYNCED_CHAT_LENGTH, "but the sync route turns it away")
  })
})
