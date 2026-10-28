import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { nextStamp } from "./stamp.ts"

const now = new Date("2026-10-28T12:00:00.000Z")

describe("nextStamp", () => {
  it("is now when there's no earlier copy, or it was saved earlier", () => {
    assert.equal(nextStamp(undefined, now), "2026-10-28T12:00:00.000Z")
    assert.equal(nextStamp(null, now), "2026-10-28T12:00:00.000Z")
    assert.equal(nextStamp("", now), "2026-10-28T12:00:00.000Z")
    assert.equal(nextStamp("2026-10-28T11:59:59.999Z", now), "2026-10-28T12:00:00.000Z")
  })

  it("is 1 ms after a copy stamped by a clock running ahead", () => {
    assert.equal(nextStamp("2026-10-28T14:00:00.000Z", now), "2026-10-28T14:00:00.001Z")
  })

  it("is later than a copy saved in the same millisecond", () => {
    assert.equal(nextStamp("2026-10-28T12:00:00.000Z", now), "2026-10-28T12:00:00.001Z")
  })

  it("compares later as a string too, as the merge rules do", () => {
    const previous = "2026-10-28T14:00:00.999Z"
    assert.ok(nextStamp(previous, now) > previous)
  })

  it("is now for a stamp it can't read or can't follow", () => {
    assert.equal(nextStamp("not a date", now), "2026-10-28T12:00:00.000Z")
    assert.equal(nextStamp("9999-12-31T23:59:59.999Z", now), "2026-10-28T12:00:00.000Z")
    assert.equal(nextStamp("+275760-09-13T00:00:00.000Z", now), "2026-10-28T12:00:00.000Z")
  })
})
