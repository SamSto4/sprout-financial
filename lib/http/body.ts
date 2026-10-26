// Reads a JSON request body without ever holding more than `maxBytes` of it. The size is checked
// from Content-Length first (a cheap early answer), then counted while reading, because the header
// is optional and a client can lie about it. Pure and framework-free, so it's tested with `node --test`.

export type JsonBody = { ok: true; value: unknown } | { ok: false; reason: "too-large" | "invalid" }

export async function readJsonBody(request: Request, maxBytes: number): Promise<JsonBody> {
  const declared = Number(request.headers.get("content-length"))
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, reason: "too-large" }
  if (!request.body) return { ok: false, reason: "invalid" }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) {
        // Stop the upload instead of reading (and paying for) the rest of it.
        await reader.cancel().catch(() => undefined)
        return { ok: false, reason: "too-large" }
      }
      chunks.push(value)
    }
  } catch {
    return { ok: false, reason: "invalid" }
  }

  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) }
  } catch {
    return { ok: false, reason: "invalid" }
  }
}
