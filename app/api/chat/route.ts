import { streamAgentReply, type AgentEvent, type AgentLimits } from "@/lib/ai/agent"
import { isAgentConfigured, MODEL } from "@/lib/ai/client"
import { errorResponse, jsonError } from "@/lib/ai/errors"
import { startRequestLog } from "@/lib/ai/request-log"
import { recordSpend, spendingLimitResponse } from "@/lib/ai/spend-server"
import { MAX_CHAT_REQUEST_BYTES, validateChatRequest } from "@/lib/chat/validate"
import { readJsonBody } from "@/lib/http/body"
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit/server"

// How long one answer may run, in seconds. Deep research can take a few minutes; 300 is the most
// Vercel allows on the Hobby plan (with Fluid compute, the default). The tool loop starts its
// answer after TOOL_TIME_BUDGET_MS (lib/ai/skill-tools.ts); change the two together.
export const maxDuration = 300

// The reply is stopped a little before the platform would end the function, so its cost is still
// counted toward the spending limit, its log line is still written and the reader is told.
const REPLY_DEADLINE_MS = (maxDuration - 15) * 1000
const TIMEOUT_NOTE = "\n\n_This answer took too long and was stopped here. Ask me to continue, or try a narrower question._"

export async function POST(request: Request) {
  // Capped while reading, before anything is parsed or counted (lib/http/body.ts).
  const body = await readJsonBody(request, MAX_CHAT_REQUEST_BYTES)
  if (!body.ok) {
    return body.reason === "too-large"
      ? jsonError("This conversation is too large to send. Start a new chat to keep going.", 413)
      : jsonError("Request body must be valid JSON.", 400)
  }

  const validation = validateChatRequest(body.value)
  if (!validation.ok) {
    return jsonError(validation.error, 400)
  }

  if (!isAgentConfigured()) {
    console.error("No API key: set CLAUDE_API_KEY in .env")
    return jsonError("The assistant isn't set up yet. Please try again later.", 503)
  }

  // The monthly budget (SPENDING_LIMIT) is checked first, so a closed budget doesn't use up visitors' allowances.
  const overBudget = await spendingLimitResponse(MODEL)
  if (overBudget) return overBudget

  // Every answer is a paid model call, so cap how many one visitor (and everyone together) can ask.
  const limited = await rateLimitResponse(validation.mode === "deep-research" ? "deepResearch" : "chat", request)
  if (limited) return limited

  // Market data lookups share the Portfolio page's allowance (per visitor and site-wide), so the
  // assistant can't use up the market data plan for everyone.
  const limits: AgentLimits = {
    chargeMarketData: async (lookups) => (await checkRateLimit("marketData", request.headers, lookups)).allowed,
  }
  const deadline = AbortSignal.timeout(REPLY_DEADLINE_MS)
  const signal = AbortSignal.any([request.signal, deadline])

  // Counts tools, tokens and timing for one log line per request. It never sees message text.
  const log = startRequestLog({ mode: validation.mode, model: MODEL })
  const reply = streamAgentReply(validation.messages, validation.context, signal, validation.mode, log, limits)

  // Wait for the first piece of the answer so setup problems (bad key, rate limits)
  // come back as a proper error status instead of a broken stream.
  let first: IteratorResult<AgentEvent>
  try {
    first = await reply.next()
  } catch (error) {
    // Counted even when it failed or was stopped: the agent adds an unfinished round's cost to the log.
    await recordSpend(log.costUsd())
    if (request.signal.aborted) {
      // Stopped before the first words: the browser has gone, so nothing reads this answer.
      console.log(log.line("stopped"))
      return jsonError("Stopped.", 499)
    }
    console.log(log.line("error"))
    return errorResponse(error)
  }

  // One JSON event per line: {"type":"text","text":"..."} or {"type":"status","text":"..."}.
  // components/chat.tsx reads this format; change both together.
  const encoder = new TextEncoder()
  const line = (event: AgentEvent) => {
    if (event.type === "text") log.onText(event.text)
    return encoder.encode(`${JSON.stringify(event)}\n`)
  }
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (!first.done) {
          controller.enqueue(line(first.value))
          for await (const event of reply) {
            controller.enqueue(line(event))
          }
        }
        await recordSpend(log.costUsd())
        controller.close()
        console.log(log.line("ok"))
      } catch (error) {
        // The agent has already added an unfinished round's cost to the log (unfinishedRoundUsage).
        await recordSpend(log.costUsd())
        if (deadline.aborted && !request.signal.aborted) {
          // Ran too long: end the answer with a note rather than a broken stream.
          controller.enqueue(line({ type: "text", text: TIMEOUT_NOTE }))
          controller.close()
          console.log(log.line("timeout"))
          return
        }
        if (!request.signal.aborted) {
          console.error("Chat stream failed:", error instanceof Error ? error.message : error)
        }
        console.log(log.line(request.signal.aborted ? "stopped" : "error"))
        controller.error(error)
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  })
}
