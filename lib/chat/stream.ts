// Reads the chat reply stream: one JSON event per line, as written by app/api/chat/route.ts.
// Kept free of framework imports so it can be unit-tested with `node --test`.

export type StreamEvent = { type: "text"; text: string } | { type: "status"; text: string }

/**
 * Splits buffered stream text into complete events. A partial last line is returned as `rest`
 * to be prepended to the next chunk. Malformed lines are skipped.
 */
export function readEvents(buffer: string): { events: StreamEvent[]; rest: string } {
  const lines = buffer.split("\n")
  const rest = lines.pop() ?? ""
  const events: StreamEvent[] = []
  for (const line of lines) {
    if (!line.trim()) continue
    try {
      const event = JSON.parse(line) as { type?: unknown; text?: unknown }
      if ((event.type === "text" || event.type === "status") && typeof event.text === "string") {
        events.push({ type: event.type, text: event.text })
      }
    } catch {
      // Not a complete JSON line; ignore it.
    }
  }
  return { events, rest }
}
