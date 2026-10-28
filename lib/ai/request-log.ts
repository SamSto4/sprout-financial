// One log line per assistant request, so slow answers, failing tools and token use can be seen
// in the server logs. It records how the request went, never what was said: no message text, no
// tool inputs or results, nothing from the user's finances.
// Kept free of framework and SDK imports so it can be unit-tested with `node --test`.

/** "timeout": the route stopped an answer that ran too long (maxDuration in app/api/chat/route.ts). */
export type RequestOutcome = "ok" | "stopped" | "timeout" | "error"

export function startRequestLog(details: { mode: string; model: string }, now: () => number = Date.now) {
  const startedAt = now()
  let firstTextMs: number | null = null
  let rounds = 0
  let inputTokens = 0
  let cacheReadTokens = 0
  let cacheWriteTokens = 0
  let outputTokens = 0
  let webSearches = 0
  let costUsd = 0
  let toolErrors = 0
  let replyChars = 0
  let route: string | null = null
  let ungroundedPrices: number | null = null
  let aboutLines: number | null = null
  const tools: Record<string, number> = {}

  return {
    /** Counts a tool the agent ran, by name. */
    onToolCall(call: { name: string; isError: boolean }) {
      tools[call.name] = (tools[call.name] ?? 0) + 1
      if (call.isError) toolErrors += 1
    },
    /** Adds one model round's usage. */
    onUsage(usage: {
      inputTokens: number
      outputTokens: number
      cacheReadTokens?: number
      cacheWriteTokens?: number
      webSearches?: number
      costUsd?: number
    }) {
      rounds += 1
      costUsd += usage.costUsd ?? 0
      inputTokens += usage.inputTokens
      cacheReadTokens += usage.cacheReadTokens ?? 0
      cacheWriteTokens += usage.cacheWriteTokens ?? 0
      outputTokens += usage.outputTokens
      webSearches += usage.webSearches ?? 0
    },
    /** Notes which path the router picked ("direct" or "agent"). */
    onRoute(picked: string) {
      route = picked
    },
    /** Notes how many prices in a market-data answer matched no data (null when none was checked). */
    onGroundingCheck(ungrounded: number) {
      ungroundedPrices = ungrounded
    },
    /**
     * Notes how many facts the About the user summary listed (0 when it was empty). Only the
     * count: the summary's text is personal and never reaches the log.
     */
    onAboutCard(lines: number) {
      aboutLines = lines
    },
    /** Notes reply text as it streams: the first piece sets the time-to-first-text. */
    onText(text: string) {
      if (firstTextMs === null) firstTextMs = now() - startedAt
      replyChars += text.length
    },
    /** The request's estimated cost so far, in US dollars, for the spending limit. */
    costUsd() {
      return costUsd
    },
    /** The finished line, as JSON, ready for console.log. */
    line(outcome: RequestOutcome) {
      return JSON.stringify({
        event: "chat",
        outcome,
        mode: details.mode,
        model: details.model,
        route,
        rounds,
        tools,
        toolErrors,
        ungroundedPrices,
        // Null on the small-talk path, which sends no summary.
        aboutLines,
        webSearches,
        inputTokens,
        cacheReadTokens,
        cacheWriteTokens,
        outputTokens,
        // Estimated from list prices (lib/ai/spend.ts), to the nearest hundredth of a cent.
        costUsd: Math.round(costUsd * 10_000) / 10_000,
        firstTextMs,
        totalMs: now() - startedAt,
        replyChars,
      })
    },
  }
}
