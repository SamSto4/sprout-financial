import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { failureAction, isNearBottom, lengthHint, nextPinned } from "./ui.ts"

describe("isNearBottom", () => {
  it("is true at the bottom and within the threshold", () => {
    assert.equal(isNearBottom({ scrollTop: 500, scrollHeight: 1000, clientHeight: 500 }), true)
    assert.equal(isNearBottom({ scrollTop: 436, scrollHeight: 1000, clientHeight: 500 }), true)
    assert.equal(isNearBottom({ scrollTop: 435, scrollHeight: 1000, clientHeight: 500 }), false)
  })
  it("is true when everything fits", () => {
    assert.equal(isNearBottom({ scrollTop: 0, scrollHeight: 300, clientHeight: 500 }), true)
  })
})

describe("nextPinned", () => {
  it("stops following after a scroll up that the scroll event hasn't reported yet", () => {
    assert.equal(nextPinned({ scrollTop: 200, scrollHeight: 2000, clientHeight: 500 }, 1500, true), false)
  })
  it("stops following after a small scroll up, still near the bottom", () => {
    // The first frames of an animated wheel scroll: 20 px up must not be pulled back down.
    assert.equal(nextPinned({ scrollTop: 1480, scrollHeight: 2000, clientHeight: 500 }, 1500, true), false)
  })
  it("keeps following when content grows below a reader who hasn't moved", () => {
    assert.equal(nextPinned({ scrollTop: 1500, scrollHeight: 2400, clientHeight: 500 }, 1500, true), true)
  })
  it("keeps following when the box moved up only because its content shrank", () => {
    assert.equal(nextPinned({ scrollTop: 1470, scrollHeight: 1970, clientHeight: 500 }, 1500, true), true)
  })
  it("follows again when the reader scrolls back down near the bottom", () => {
    assert.equal(nextPinned({ scrollTop: 1450, scrollHeight: 2000, clientHeight: 500 }, 1300, false), true)
    assert.equal(nextPinned({ scrollTop: 1500, scrollHeight: 2000, clientHeight: 500 }, 1500, false), true)
  })
  it("leaves a reader alone while they scroll down through earlier text", () => {
    assert.equal(nextPinned({ scrollTop: 1000, scrollHeight: 2000, clientHeight: 500 }, 900, false), false)
    assert.equal(nextPinned({ scrollTop: 1000, scrollHeight: 2400, clientHeight: 500 }, 1000, false), false)
  })
  it("keeps following during a smooth scroll down to the latest", () => {
    assert.equal(nextPinned({ scrollTop: 900, scrollHeight: 2000, clientHeight: 500 }, 600, true), true)
  })
})

describe("lengthHint", () => {
  it("stays hidden until 90% of the limit", () => {
    assert.equal(lengthHint(0, 4000), null)
    assert.equal(lengthHint(3599, 4000), null)
    assert.deepEqual(lengthHint(3600, 4000), { text: "3,600 / 4,000", over: false })
    assert.deepEqual(lengthHint(4000, 4000), { text: "4,000 / 4,000", over: false })
  })
  it("says when a message is too long", () => {
    assert.deepEqual(lengthHint(4001, 4000), { text: "4,001 / 4,000 · too long to send", over: true })
  })
})

describe("failureAction", () => {
  it("offers a retry for dropped connections and server errors", () => {
    assert.equal(failureAction(null), "retry")
    assert.equal(failureAction(500), "retry")
    assert.equal(failureAction(502), "retry")
  })
  it("offers a new chat when the conversation is too big", () => {
    assert.equal(failureAction(400), "new-chat")
    assert.equal(failureAction(413), "new-chat")
  })
  it("offers nothing when waiting is the only fix", () => {
    assert.equal(failureAction(429), "none")
    assert.equal(failureAction(503), "none")
  })
})
