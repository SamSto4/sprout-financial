import { streamAgentReply, type AgentEvent } from "@/lib/ai/agent"
import { isAgentConfigured, MODEL } from "@/lib/ai/client"
import { errorResponse, jsonError } from "@/lib/ai/errors"
import { startRequestLog } from "@/lib/ai/request-log"
import { recordSpend, spendingLimitResponse } from "@/lib/ai/spend-server"
import { validateChatRequest } from "@/lib/chat/validate"
import { rateLimitResponse } from "@/lib/rate-limit/server"

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonError("Request body must be valid JSON.", 400)
  }

  const validation = validateChatRequest(body)
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

  // Counts tools, tokens and timing for one log line per request. It never sees message text.
  const log = startRequestLog({ mode: validation.mode, model: MODEL })
  const reply = streamAgentReply(validation.messages, validation.context, request.signal, validation.mode, log)

  // Wait for the first piece of the answer so setup problems (bad key, rate limits)
  // come back as a proper error status instead of a broken stream.
  let first: IteratorResult<AgentEvent>
  try {
    first = await reply.next()
  } catch (error) {
    console.log(log.line("error"))
    await recordSpend(log.costUsd())
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
        await recordSpend(log.costUsd())
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
