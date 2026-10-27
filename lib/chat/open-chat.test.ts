import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { followOpenChat, maySaveChat, type OpenChat } from "./open-chat.ts"

describe("maySaveChat", () => {
  it("saves a new chat's first answer and every answer in a chat that's still saved", () => {
    assert.equal(maySaveChat({ cleared: null, saved: false }, { cleared: null, saved: false }), true)
    assert.equal(maySaveChat({ cleared: "a", saved: false }, { cleared: "a", saved: true }), true)
    assert.equal(maySaveChat({ cleared: "a", saved: true }, { cleared: "a", saved: true }), true)
  })

  it("never saves across a clear of this browser's copy, saved chat or new", () => {
    // A reply that finishes after the session ended elsewhere and the copy was cleared.
    assert.equal(maySaveChat({ cleared: null, saved: true }, { cleared: "t1", saved: false }), false)
    // The first answer of a new chat, still arriving when the copy was cleared.
    assert.equal(maySaveChat({ cleared: "t1", saved: false }, { cleared: "t2", saved: false }), false)
    // Even if a chat with the same id is somehow back in the store by then.
    assert.equal(maySaveChat({ cleared: "t1", saved: true }, { cleared: "t2", saved: true }), false)
  })

  it("doesn't bring back a saved chat that was deleted meanwhile", () => {
    assert.equal(maySaveChat({ cleared: "a", saved: true }, { cleared: "a", saved: false }), false)
  })
})

describe("followOpenChat", () => {
  const chat = (id: string, saved: boolean, cleared: string | null = "a"): OpenChat => ({ id, saved, cleared })

  it("starts following on the first look, and again whenever another chat is opened", () => {
    assert.deepEqual(followOpenChat(null, chat("c1", true)), { seen: chat("c1", true), reset: false })
    // A new chat after a saved one: nothing to reset, and it's followed as unsaved.
    assert.deepEqual(followOpenChat(chat("c1", true), chat("c2", false)), { seen: chat("c2", false), reset: false })
    // Opening a chat after a clear takes the new marker as its basis.
    assert.deepEqual(followOpenChat(chat("c1", true, "a"), chat("c2", true, "b")), { seen: chat("c2", true, "b"), reset: false })
  })

  it("remembers a chat once it's saved, so its later removal is noticed", () => {
    const first = followOpenChat(chat("c1", false), chat("c1", true))
    assert.deepEqual(first, { seen: chat("c1", true), reset: false })
    assert.deepEqual(followOpenChat(first.seen, chat("c1", false)), { seen: chat("c1", true), reset: true })
  })

  it("keeps the same object while nothing changes, so the page doesn't update its state in a loop", () => {
    const seen = chat("c1", true)
    assert.equal(followOpenChat(seen, chat("c1", true)).seen, seen)
    const unsaved = chat("c2", false)
    assert.equal(followOpenChat(unsaved, chat("c2", false)).seen, unsaved)
  })

  it("resets when this browser's copy is cleared, saved chat or not yet saved", () => {
    assert.equal(followOpenChat(chat("c1", true, "a"), chat("c1", false, "b")).reset, true)
    assert.equal(followOpenChat(chat("c1", false, "a"), chat("c1", false, "b")).reset, true)
    assert.equal(followOpenChat(chat("c1", false, null), chat("c1", false, "b")).reset, true)
  })

  it("resets when the open saved chat is deleted in another tab", () => {
    assert.equal(followOpenChat(chat("c1", true), chat("c1", false)).reset, true)
  })
})
