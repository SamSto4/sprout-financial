import "server-only"

import type Anthropic from "@anthropic-ai/sdk"

import { compactArtifacts } from "@/lib/ai/artifacts"
import { createClient, fallbackOptions, MODEL } from "@/lib/ai/client"
import { isSpendLimitError } from "@/lib/ai/error-kinds"
import { MARKET_DATA_TOOLS, ungroundedNote, ungroundedPrices } from "@/lib/ai/grounding"
import { routeMessage, type Route } from "@/lib/ai/router"
import { estimateCostUsd, unfinishedRoundUsage, type Usage } from "@/lib/ai/spend"
import { resolveSkills } from "@/lib/ai/skill-runtime"
import { isFinalRound, type SkillOutcome } from "@/lib/ai/skill-tools"
import type { SkillMode } from "@/lib/ai/skilltypes"
import { buildDirectSystemPrompt, buildSystemPrompt } from "@/lib/ai/system-prompt"
import { MARKET_LIMIT_RESULT, planToolCalls, skippedToolResult } from "@/lib/ai/tool-budget"
import { toolStatus } from "@/lib/ai/tool-status"
import { CALCULATOR_TOOLS, FINANCE_TOOLS, INVESTING_TOOLS, MARKET_TOOLS, MEMORY_TOOLS, PLAN_TOOLS, runTool } from "@/lib/ai/tools"
import { isMarketDataConfigured } from "@/lib/market/fmp"
import type { ChatContext, ChatMessage } from "@/lib/chat/validate"

// Upper bounds per answer, so one question can't loop (and bill) forever. The round limit comes
// from the active skills: deep research raises it.
const MAX_TOKENS: Record<SkillMode, number> = { standard: 8000, "deep-research": 16000 }
// Small talk needs a sentence or two. Thinking counts toward this too, so it isn't cut tighter.
const DIRECT_MAX_TOKENS = 2000

const REFUSAL_NOTE: AgentEvent = { type: "text", text: "\n\n_I can't help with that request. Try asking about a personal finance topic instead._" }
const CUT_OFF_NOTE: AgentEvent = { type: "text", text: "\n\n_This answer was cut off because it got too long. Ask me to continue._" }

/** What the reply stream carries: text for the message, and short progress notes. */
export type AgentEvent = { type: "text"; text: string } | { type: "status"; text: string }

/**
 * Optional hooks for watching what the agent did: the eval suite (evals/run.mts) records tool
 * calls with them, and the chat route counts tools and tokens for its log line. They only
 * observe; replies and the stream format are the same with or without them.
 */
export type AgentTrace = {
  /**
   * Called for each tool call the agent made, with what it sent and what came back. A call the
   * tool budget didn't run (lib/ai/tool-budget.ts) is reported as an error whose result starts "Not run:".
   */
  onToolCall?: (call: { name: string; input: unknown; result: string; isError: boolean }) => void
  /**
   * Called after each model round with the tokens it used (input includes cached prompt tokens),
   * web searches run, and the round's estimated cost in US dollars (lib/ai/spend.ts). A round that
   * was stopped or failed partway is reported too, with its output estimated (unfinishedRoundUsage).
   */
  onUsage?: (usage: RoundUsage) => void
  /** Called for each tool Anthropic ran (web search, page reading), with its input, such as the search query. */
  onServerToolCall?: (call: { name: string; input: unknown }) => void
  /** Called once with the path the router picked: one fast call ("direct") or the full agent. */
  onRoute?: (route: Route) => void
  /** Called when an answer that used market data had its prices checked, with how many matched no data. */
  onGroundingCheck?: (ungrounded: number) => void
}

type RoundUsage = { inputTokens: number; outputTokens: number; webSearches: number; costUsd: number }

/**
 * Allowances the agent checks with its caller. Unlike the trace, these change what happens: the
 * chat route counts market data lookups against the same allowance as the Portfolio page's price
 * refresh, so the assistant can't use up the shared market data plan. Leave out for no limits (evals).
 */
export type AgentLimits = {
  /** Asked before a round runs market data tools, with how many; false turns those calls down. */
  chargeMarketData?: (lookups: number) => Promise<boolean>
}

type Source = { url: string; title: string }
/** Pages the answer cited or read in full, and, as a fallback, the pages its searches returned. */
type Sources = { cited: Map<string, Source>; searched: Map<string, Source> }

/**
 * Streams the agent's reply. Mid-answer, the agent can run calculators, look up market data,
 * search past chats and imported transactions, and use skills: charts and tables (inserted into
 * the reply as artifact blocks) and web search (run by Anthropic, with sources listed at the end).
 */
export async function* streamAgentReply(
  history: ChatMessage[],
  context: ChatContext,
  signal: AbortSignal,
  mode: SkillMode = "standard",
  trace?: AgentTrace,
  limits: AgentLimits = {}
): AsyncGenerator<AgentEvent> {
  const startedAt = Date.now()
  const client = createClient()
  // Earlier charts and tables go back as short notes, not their full JSON.
  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = history.map((message) =>
    message.role === "assistant" ? { ...message, content: compactArtifacts(message.content) } : message
  )

  const last = history[history.length - 1]
  const route = last?.role === "user" ? routeMessage(last.content, mode) : "agent"
  trace?.onRoute?.(route)
  if (route === "direct") {
    yield* streamDirectReply(client, messages, signal, trace)
    return
  }

  const features = {
    marketData: isMarketDataConfigured(),
    pastChats: context.pastChats.length > 0,
    finances: context.transactions.length > 0,
    plan: context.profile !== null || context.holdings.length > 0,
  }
  const baseTools: Anthropic.Beta.Messages.BetaToolUnion[] = [
    ...CALCULATOR_TOOLS,
    ...INVESTING_TOOLS,
    ...(features.plan ? PLAN_TOOLS : []),
    ...(features.marketData ? MARKET_TOOLS : []),
    ...(features.pastChats ? MEMORY_TOOLS : []),
    ...(features.finances ? FINANCE_TOOLS : []),
  ]
  let skills = resolveSkills({ mode })
  let tools = [...baseTools, ...skills.tools]
  let system = buildSystemPrompt(features, context, skills.prompt)
  const sources: Sources = { cited: new Map(), searched: new Map() }
  let wroteText = false
  // For the price check at the end: what the reply said, and what it could have taken figures from.
  let replyText = ""
  const evidence = history.map((message) => message.content)
  let usedMarketData = false
  // Market data lookups so far in this answer (lib/ai/tool-budget.ts).
  let marketLookups = 0

  function* finish(): Generator<AgentEvent> {
    if (usedMarketData) {
      const missing = ungroundedPrices(replyText, evidence)
      trace?.onGroundingCheck?.(missing.length)
      if (missing.length > 0) yield { type: "text", text: ungroundedNote(missing) }
    }
    yield* sourceList(sources)
  }

  for (let round = 0; round <= skills.maxToolRounds; round++) {
    // The last allowed round, or the first one after the answer used its time budget, has to answer.
    const final = isFinalRound(round, skills.maxToolRounds, Date.now() - startedAt)
    const openStream = () =>
      client.beta.messages.stream(
        {
          model: MODEL,
          max_tokens: MAX_TOKENS[mode],
          system,
          messages,
          tools,
          // On the final round the tools stay listed (earlier rounds refer to them) but are
          // switched off, so the agent has to answer.
          ...(final ? { tool_choice: { type: "none" as const } } : {}),
          output_config: { effort: skills.effort },
          // Caches the conversation so each follow-up only pays full price for the new turn.
          cache_control: { type: "ephemeral" },
          ...fallbackOptions(),
        },
        // Stop generating (and billing) if the user closes the page or presses Stop.
        { signal }
      )

    let stream = openStream()
    // What this round has streamed, so its cost can be estimated if it never finishes.
    let streamedChars = 0
    let finished = false
    let message: Anthropic.Beta.Messages.BetaMessage
    try {
      let events = stream[Symbol.asyncIterator]()
      let next: Awaited<ReturnType<typeof events.next>>
      try {
        next = await events.next()
      } catch (error) {
        // If the API turns the request down while web search is on (search switched off for the
        // account, or a model without it), every question would fail. Nothing has streamed yet, so
        // drop search for this answer and ask again; any other problem fails the same way and is
        // reported as usual. A used-up spend limit also arrives as a 400, and asking again can't help.
        const message = error instanceof Error ? error.message : ""
        const rejected = (error as { status?: unknown } | null)?.status === 400 && !isSpendLimitError(400, message)
        if (round > 0 || !skills.usesServerTools || !rejected) throw error
        console.error("The API rejected the request with web search on; answering without it:", error instanceof Error ? error.message : error)
        skills = resolveSkills({ mode: "standard", webSearch: false })
        tools = [...baseTools, ...skills.tools]
        system = buildSystemPrompt(features, context, skills.prompt)
        stream = openStream()
        events = stream[Symbol.asyncIterator]()
        next = await events.next()
      }

      let needsSeparator = false
      for (; !next.done; next = await events.next()) {
        const event = next.value
        if (event.type === "content_block_delta") streamedChars += deltaLength(event.delta)
        if (event.type === "content_block_start") {
          // Text blocks split by searches or tool calls shouldn't run together.
          if (event.content_block.type === "text" && wroteText) needsSeparator = true
          if (event.content_block.type === "server_tool_use") {
            yield { type: "status", text: skills.status(event.content_block.name, {}) ?? "Working" }
          }
        } else if (event.type === "content_block_stop") {
          // The search query is complete once its block closes.
          const block = stream.currentMessage?.content[event.index]
          if (block?.type === "server_tool_use") {
            trace?.onServerToolCall?.({ name: block.name, input: block.input })
            const note = skills.status(block.name, block.input)
            if (note) yield { type: "status", text: note }
          }
        } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          if (needsSeparator) {
            yield { type: "text", text: "\n\n" }
            replyText += "\n\n"
            needsSeparator = false
          }
          yield { type: "text", text: event.delta.text }
          replyText += event.delta.text
          wroteText = true
        }
      }

      message = await stream.finalMessage()
      finished = true
      trace?.onUsage?.(roundUsage(message.usage))
    } finally {
      // Stopped, failed, or left unread by the caller partway through: stop generating, and count
      // what the round already cost, which Anthropic bills (the spending limit adds it up).
      if (!finished) {
        stream.abort()
        const snapshot = stream.currentMessage
        if (snapshot) trace?.onUsage?.(roundUsage(unfinishedRoundUsage(snapshot.usage, streamedChars, searchesStarted(snapshot))))
      }
    }
    collectSources(message, sources)

    switch (message.stop_reason) {
      case "refusal":
        yield REFUSAL_NOTE
        return
      case "max_tokens":
        yield CUT_OFF_NOTE
        yield* finish()
        return
      case "pause_turn":
        // A long server-side search paused; send the turn back as-is and it resumes.
        messages.push({ role: "assistant", content: message.content })
        continue
      case "tool_use":
        break
      default:
        yield* finish()
        return
    }

    const toolCalls = message.content.filter(
      (block): block is Anthropic.Beta.Messages.BetaToolUseBlock => block.type === "tool_use"
    )
    if (toolCalls.length === 0) {
      yield* finish()
      return
    }

    // At most a few calls run per round, and market data lookups have an allowance per answer;
    // each call that doesn't run gets a result saying so (lib/ai/tool-budget.ts).
    const plan = planToolCalls(toolCalls.map((call) => call.name), marketLookups)
    marketLookups = plan.marketUsed
    const runs = (index: number) => plan.calls[index] === "run"
    const marketCalls = toolCalls.filter((call, index) => runs(index) && MARKET_DATA_TOOLS.has(call.name)).length
    const marketAllowed = marketCalls === 0 || !limits.chargeMarketData || (await limits.chargeMarketData(marketCalls))

    // One note for each kind of work that runs, not one per call.
    const notes = new Set<string>()
    for (const [index, call] of toolCalls.entries()) {
      if (!runs(index)) continue
      const note = skills.status(call.name, (call.input ?? {}) as Record<string, unknown>) ?? toolStatus(call.name)
      if (note && !notes.has(note)) {
        notes.add(note)
        yield { type: "status", text: note }
      }
    }

    const outcomes: SkillOutcome[] = await Promise.all(
      toolCalls.map(async (call, index): Promise<SkillOutcome> => {
        const planned = plan.calls[index]
        if (planned !== "run") return { content: skippedToolResult(planned), isError: true }
        if (!marketAllowed && MARKET_DATA_TOOLS.has(call.name)) return { content: MARKET_LIMIT_RESULT, isError: true }
        return skills.run(call.name, call.input) ?? (await runTool(call.name, call.input, context))
      })
    )

    toolCalls.forEach((call, index) => {
      const { content, isError } = outcomes[index]
      evidence.push(content)
      if (MARKET_DATA_TOOLS.has(call.name)) usedMarketData = true
      trace?.onToolCall?.({
        name: call.name,
        input: call.input,
        result: content,
        isError: Boolean(isError),
      })
    })

    // Charts and tables appear in the reply where the agent made them.
    for (const outcome of outcomes) {
      if (outcome.artifact) {
        yield { type: "text", text: outcome.artifact }
        replyText += outcome.artifact
        wroteText = true
      }
    }

    messages.push({ role: "assistant", content: message.content })
    messages.push({
      role: "user",
      content: toolCalls.map((call, index): Anthropic.Beta.Messages.BetaToolResultBlockParam => ({
        type: "tool_result",
        tool_use_id: call.id,
        content: outcomes[index].content,
        ...(outcomes[index].isError ? { is_error: true } : {}),
      })),
    })
  }
}

/**
 * One call with no tools, for small talk the router sent here (lib/ai/router.ts). Low effort and a
 * short prompt get the first words out sooner than the full agent would.
 */
async function* streamDirectReply(
  client: Anthropic,
  messages: Anthropic.Beta.Messages.BetaMessageParam[],
  signal: AbortSignal,
  trace?: AgentTrace
): AsyncGenerator<AgentEvent> {
  const stream = client.beta.messages.stream(
    {
      model: MODEL,
      max_tokens: DIRECT_MAX_TOKENS,
      system: buildDirectSystemPrompt(),
      messages,
      output_config: { effort: "low" },
      cache_control: { type: "ephemeral" },
      ...fallbackOptions(),
    },
    { signal }
  )
  let streamedChars = 0
  let finished = false
  let message: Anthropic.Beta.Messages.BetaMessage
  try {
    for await (const event of stream) {
      if (event.type !== "content_block_delta") continue
      streamedChars += deltaLength(event.delta)
      if (event.delta.type === "text_delta") yield { type: "text", text: event.delta.text }
    }
    message = await stream.finalMessage()
    finished = true
    trace?.onUsage?.(roundUsage(message.usage))
  } finally {
    // As in the agent loop: an unfinished call is stopped and still counted.
    if (!finished) {
      stream.abort()
      const snapshot = stream.currentMessage
      if (snapshot) trace?.onUsage?.(roundUsage(unfinishedRoundUsage(snapshot.usage, streamedChars, 0)))
    }
  }
  if (message.stop_reason === "refusal") yield REFUSAL_NOTE
  else if (message.stop_reason === "max_tokens") yield CUT_OFF_NOTE
}

function roundUsage(usage: Usage): RoundUsage {
  return {
    // Cached prompt tokens are reported separately by the API; count them so totals are complete.
    inputTokens: usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0),
    outputTokens: usage.output_tokens,
    webSearches: usage.server_tool_use?.web_search_requests ?? 0,
    costUsd: estimateCostUsd(MODEL, usage),
  }
}

/** Characters of output in one streamed piece: reply text, a tool call's input, or thinking. */
function deltaLength(delta: Anthropic.Beta.Messages.BetaRawContentBlockDeltaEvent["delta"]): number {
  switch (delta.type) {
    case "text_delta":
      return delta.text.length
    case "input_json_delta":
      return delta.partial_json.length
    case "thinking_delta":
      return delta.thinking.length
    default:
      return 0
  }
}

/** Web searches a round had started when it stopped; the API's own count only comes at the end. */
function searchesStarted(message: Anthropic.Beta.Messages.BetaMessage): number {
  return message.content.filter((block) => block.type === "server_tool_use" && block.name === "web_search").length
}

function remember(map: Map<string, Source>, url: string, title: unknown) {
  if (!/^https?:\/\//.test(url) || map.has(url)) return
  map.set(url, { url, title: typeof title === "string" && title.trim() ? title.trim() : url })
}

function collectSources(message: Anthropic.Beta.Messages.BetaMessage, sources: Sources) {
  for (const block of message.content) {
    if (block.type === "text") {
      for (const citation of block.citations ?? []) {
        if (citation.type === "web_search_result_location") remember(sources.cited, citation.url, citation.title)
      }
    } else if (block.type === "web_fetch_tool_result" && block.content.type === "web_fetch_result") {
      remember(sources.cited, block.content.url, block.content.content.title)
    } else if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const result of block.content) remember(sources.searched, result.url, result.title)
    }
  }
}

/** Lists cited pages; when nothing was cited (search filtering can drop citations), the top search results. */
function* sourceList(sources: Sources): Generator<AgentEvent> {
  const cited = sources.cited.size > 0
  const list = [...(cited ? sources.cited : sources.searched).values()].slice(0, cited ? 12 : 6)
  if (list.length === 0) return
  const lines = list.map((source, index) => `${index + 1}. [${source.title.replace(/[[\]]/g, "")}](${source.url})`)
  yield { type: "text", text: `\n\n**${cited ? "Sources" : "Sources searched"}**\n\n${lines.join("\n")}` }
}
