import "server-only"

import type Anthropic from "@anthropic-ai/sdk"

import { compactArtifacts } from "@/lib/ai/artifacts"
import { createClient, FALLBACK_OPTIONS, MODEL } from "@/lib/ai/client"
import * as skillsRegistry from "@/lib/ai/skillsregistry"

type SkillMode = "standard" | "deep-research"
type SkillToolResult = {
  content: Anthropic.Beta.Messages.BetaToolResultBlockParam["content"]
  artifact?: string
  isError?: boolean
}

type ResolvedSkills = {
  effort: "low" | "medium" | "high"
  maxToolRounds: number
  tools: Anthropic.Beta.Messages.BetaToolUnion[]
  prompt: string
  status: (name: string, input: Record<string, unknown>) => string | undefined
  run: (name: string, input: unknown) => SkillToolResult | undefined
}

const defaultResolveSkills = (
  _options: { mode: SkillMode },
  defaults: { effort: "medium"; maxToolRounds: number }
): ResolvedSkills => ({
  effort: defaults.effort,
  maxToolRounds: defaults.maxToolRounds,
  tools: [],
  prompt: "",
  status: () => undefined,
  run: () => undefined,
})

const resolveSkills = (
  options: { mode: SkillMode },
  defaults: { effort: "medium"; maxToolRounds: number }
): ResolvedSkills => {
  const registry = skillsRegistry as { resolveSkills?: typeof defaultResolveSkills }
  return registry.resolveSkills ? registry.resolveSkills(options, defaults) : defaultResolveSkills(options, defaults)
}

import { buildSystemPrompt } from "@/lib/ai/system-prompt"
import { CALCULATOR_TOOLS, FINANCE_TOOLS, MARKET_TOOLS, MEMORY_TOOLS, runTool } from "@/lib/ai/tools"
import { isMarketDataConfigured } from "@/lib/market/fmp"
import type { ChatContext, ChatMessage } from "@/lib/chat/validate"

// Upper bounds per answer, so one question can't loop (and bill) forever. Deep research raises
// the round limit through its skill.
const DEFAULTS = { effort: "medium" as const, maxToolRounds: 5 }
const MAX_TOKENS: Record<SkillMode, number> = { standard: 8000, "deep-research": 16000 }

/** What the reply stream carries: text for the message, and short progress notes. */
export type AgentEvent = { type: "text"; text: string } | { type: "status"; text: string }

/**
 * Optional hooks for the eval suite (evals/run.mts) to watch what the agent did. The app's request
 * path never passes one, so replies and the stream format are unaffected.
 */
export type AgentTrace = {
  /** Called after each tool the agent ran, with what it sent and what came back. */
  onToolCall?: (call: { name: string; input: unknown; result: string; isError: boolean }) => void
  /** Called after each model round with the tokens it used (input includes cached prompt tokens). */
  onUsage?: (usage: { inputTokens: number; outputTokens: number }) => void
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
  trace?: AgentTrace
): AsyncGenerator<AgentEvent> {
  const client = createClient()
  const features = {
    marketData: isMarketDataConfigured(),
    pastChats: context.pastChats.length > 0,
    finances: context.transactions.length > 0,
  }
  const skills = resolveSkills({ mode }, DEFAULTS)
  const tools: Anthropic.Beta.Messages.BetaToolUnion[] = [
    ...CALCULATOR_TOOLS,
    ...(features.marketData ? MARKET_TOOLS : []),
    ...(features.pastChats ? MEMORY_TOOLS : []),
    ...(features.finances ? FINANCE_TOOLS : []),
    ...skills.tools,
  ]
  const system = buildSystemPrompt(features, context, skills.prompt)
  // Earlier charts and tables go back as short notes, not their full JSON.
  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = history.map((message) =>
    message.role === "assistant" ? { ...message, content: compactArtifacts(message.content) } : message
  )
  const sources: Sources = { cited: new Map(), searched: new Map() }
  let wroteText = false

  for (let round = 0; round <= skills.maxToolRounds; round++) {
    const stream = client.beta.messages.stream(
      {
        model: MODEL,
        max_tokens: MAX_TOKENS[mode],
        system,
        messages,
        // After the last allowed round, withhold tools so the agent has to answer.
        ...(round < skills.maxToolRounds ? { tools } : {}),
        output_config: { effort: skills.effort },
        // Caches the conversation so each follow-up only pays full price for the new turn.
        cache_control: { type: "ephemeral" },
        ...FALLBACK_OPTIONS,
      },
      // Stop generating (and billing) if the user closes the page or presses Stop.
      { signal }
    )

    let needsSeparator = false
    for await (const event of stream) {
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
          const note = skills.status(block.name, block.input)
          if (note) yield { type: "status", text: note }
        }
      } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        if (needsSeparator) {
          yield { type: "text", text: "\n\n" }
          needsSeparator = false
        }
        yield { type: "text", text: event.delta.text }
        wroteText = true
      }
    }

    const message = await stream.finalMessage()
    collectSources(message, sources)
    trace?.onUsage?.({
      // Cached prompt tokens are reported separately by the API; count them so totals are complete.
      inputTokens:
        message.usage.input_tokens +
        (message.usage.cache_creation_input_tokens ?? 0) +
        (message.usage.cache_read_input_tokens ?? 0),
      outputTokens: message.usage.output_tokens,
    })

    switch (message.stop_reason) {
      case "refusal":
        yield { type: "text", text: "\n\n_I can't help with that request. Try asking about a personal finance topic instead._" }
        return
      case "max_tokens":
        yield { type: "text", text: "\n\n_This answer was cut off because it got too long. Ask me to continue._" }
        yield* sourceList(sources)
        return
      case "pause_turn":
        // A long server-side search paused; send the turn back as-is and it resumes.
        messages.push({ role: "assistant", content: message.content })
        continue
      case "tool_use":
        break
      default:
        yield* sourceList(sources)
        return
    }

    const toolCalls = message.content.filter(
      (block): block is Anthropic.Beta.Messages.BetaToolUseBlock => block.type === "tool_use"
    )
    if (toolCalls.length === 0) {
      yield* sourceList(sources)
      return
    }

    for (const call of toolCalls) {
      const note = skills.status(call.name, (call.input ?? {}) as Record<string, unknown>)
      if (note) yield { type: "status", text: note }
    }

    const outcomes: SkillToolResult[] = await Promise.all(
      toolCalls.map(async (call) => skills.run(call.name, call.input) ?? (await runTool(call.name, call.input, context)))
    )

    toolCalls.forEach((call, index) => {
      const { content, isError } = outcomes[index]
      trace?.onToolCall?.({
        name: call.name,
        input: call.input,
        result: typeof content === "string" ? content : JSON.stringify(content ?? ""),
        isError: Boolean(isError),
      })
    })

    // Charts and tables appear in the reply where the agent made them.
    for (const outcome of outcomes) {
      if (outcome.artifact) {
        yield { type: "text", text: outcome.artifact }
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
