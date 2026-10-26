import assert from "node:assert/strict"
import { test } from "node:test"

import { readJsonBody } from "./body.ts"

function post(body: BodyInit | null, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/test", { method: "PUT", body, headers, duplex: "half" } as RequestInit)
}

/** A body that arrives in pieces and has no Content-Length, like a chunked upload. */
function streamed(parts: string[]) {
  let pulled = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulled === parts.length) return controller.close()
      controller.enqueue(new TextEncoder().encode(parts[pulled++]))
    },
  })
  return { request: post(stream), pulled: () => pulled }
}

test("reads a JSON body under the limit", async () => {
  assert.deepEqual(await readJsonBody(post(JSON.stringify({ a: 1 })), 100), { ok: true, value: { a: 1 } })
})

test("refuses a body whose declared size is over the limit without reading it", async () => {
  const request = post(JSON.stringify({ a: "x".repeat(50) }), { "content-length": "1000" })
  assert.deepEqual(await readJsonBody(request, 100), { ok: false, reason: "too-large" })
  assert.equal(request.bodyUsed, false)
})

test("counts bytes while reading, so a missing or false Content-Length doesn't help", async () => {
  const { request, pulled } = streamed(["[", '"aaaaaaaaaa",'.repeat(10), '"aaaaaaaaaa",'.repeat(10), "1]", "extra"])
  assert.deepEqual(await readJsonBody(request, 150), { ok: false, reason: "too-large" })
  // Stopped part-way, not after reading everything.
  assert.ok(pulled() < 5)
})

test("a body exactly at the limit is fine", async () => {
  const body = JSON.stringify("x".repeat(98)) // 100 bytes with the quotes
  assert.equal(new TextEncoder().encode(body).byteLength, 100)
  assert.deepEqual(await readJsonBody(post(body), 100), { ok: true, value: "x".repeat(98) })
})

test("counts bytes, not characters", async () => {
  const body = JSON.stringify("é".repeat(60)) // 122 bytes, 62 characters
  assert.deepEqual(await readJsonBody(post(body), 100), { ok: false, reason: "too-large" })
})

test("malformed JSON, bad UTF-8 and a missing body are invalid", async () => {
  assert.deepEqual(await readJsonBody(post("{not json"), 100), { ok: false, reason: "invalid" })
  assert.deepEqual(await readJsonBody(post(new Uint8Array([0x22, 0xff, 0x22])), 100), { ok: false, reason: "invalid" })
  assert.deepEqual(await readJsonBody(post(null), 100), { ok: false, reason: "invalid" })
})
