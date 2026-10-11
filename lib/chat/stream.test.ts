import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { readEvents } from "./stream.ts"

describe("readEvents", () => {
  it("parses complete lines and keeps the partial one", () => {
    const { events, rest } = readEvents('{"type":"status","text":"Searching"}\n{"type":"text","text":"Hi\\nthere"}\n{"type":"te')
    assert.deepEqual(events, [
      { type: "status", text: "Searching" },
      { type: "text", text: "Hi\nthere" },
    ])
    assert.equal(rest, '{"type":"te')
    assert.deepEqual(readEvents(rest + 'xt","text":"!"}\n').events, [{ type: "text", text: "!" }])
  })

  it("skips blank, malformed and unknown lines", () => {
    assert.deepEqual(readEvents('\nnot json\n{"type":"other","text":"x"}\n{"type":"text","text":5}\n').events, [])
  })
})
