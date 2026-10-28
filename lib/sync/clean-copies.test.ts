import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { parseSavedChats } from "../chat/history.ts"
import { parseImportedFinances } from "../finance/transactions.ts"
import { changedByParsing, chatsChangedByParsing } from "./clean-copies.ts"

// What GET /api/account finds in an account synced before card and account numbers were masked.
const legacyFinances = {
  fileName: "checking.csv",
  importedAt: "2026-09-01T12:00:00.000Z",
  transactions: [
    { date: "2026-08-30", description: "ONLINE TRANSFER TO CHK 000123456789", amount: -500 },
    { date: "2026-08-31", description: "Coffee", amount: -4.5, category: "Dining" },
  ],
}
const legacyChat = {
  id: "old-chat",
  title: "Card 4111 1111 1111 1111 charged twice",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  messages: [
    { role: "user", content: "Card 4111 1111 1111 1111 charged twice" },
    { role: "assistant", content: "Please don't share card numbers here." },
  ],
}
const cleanChat = {
  id: "new-chat",
  title: "How do index funds work?",
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  messages: [{ role: "user", content: "How do index funds work?" }],
}

describe("stored copies saved before masking", () => {
  it("are found, so the masked copy replaces them", () => {
    const parsed = parseImportedFinances(legacyFinances)
    assert.equal(parsed?.transactions[0].description, "ONLINE TRANSFER TO CHK ••••6789")
    assert.equal(changedByParsing(legacyFinances, parsed), true)

    const chats = parseSavedChats([legacyChat, cleanChat])
    const changed = chatsChangedByParsing([legacyChat, cleanChat], chats)
    assert.deepEqual(changed.map((chat) => chat.id), ["old-chat"])
    assert.equal(changed[0].title, "Card ••••1111 charged twice")
    assert.equal(changed[0].messages[0].content, "Card ••••1111 charged twice")
    assert.equal(changed[0].updatedAt, legacyChat.updatedAt, "the version stays, so sync sees no new change")
  })

  it("are written back once: a cleaned copy reads back unchanged", () => {
    const finances = parseImportedFinances(legacyFinances)
    assert.equal(changedByParsing(finances, parseImportedFinances(finances)), false)
    const chats = parseSavedChats([legacyChat, cleanChat])
    assert.deepEqual(chatsChangedByParsing(chats, parseSavedChats(chats)), [])
  })

  it("leave copies with nothing to mask alone, whatever order the database returns their fields in", () => {
    const reordered = {
      messages: cleanChat.messages.map(({ role, content }) => ({ content, role })),
      updatedAt: cleanChat.updatedAt,
      title: cleanChat.title,
      id: cleanChat.id,
      createdAt: cleanChat.createdAt,
    }
    assert.deepEqual(chatsChangedByParsing([reordered], parseSavedChats([reordered])), [])
    const clean = { transactions: legacyFinances.transactions.slice(1), importedAt: legacyFinances.importedAt, fileName: "checking.csv" }
    assert.equal(changedByParsing(clean, parseImportedFinances(clean)), false)
  })

  it("never replace something that didn't parse", () => {
    assert.equal(changedByParsing({ transactions: "not a list" }, parseImportedFinances({ transactions: "not a list" })), false)
    assert.equal(changedByParsing(null, null), false)
    assert.deepEqual(chatsChangedByParsing([{ id: "bad id", messages: [] }, "junk", null], []), [])
  })
})
