// Validates the chat history the browser sends to /api/chat.
// Kept free of framework and SDK imports so it can be unit-tested with `node --test`.

import type { SkillMode } from "../ai/skilltypes"
import { parseTransactions, type Transaction } from "../finance/transactions.ts"
import { parsePastChats, type PastChat } from "./history.ts"
import { parseProfile, type InvestorProfile } from "../plan/profile.ts"
import { parsePortfolio, type Holding } from "../portfolio/holdings.ts"

export type ChatRole = "user" | "assistant"

export type ChatMessage = {
  role: ChatRole
  content: string
}

export const MAX_MESSAGES = 40
export const MAX_MESSAGE_LENGTH = 4000
/** Assistant replies can carry charts, tables and source lists, so they're allowed to be longer. */
export const MAX_ASSISTANT_MESSAGE_LENGTH = 40000
/**
 * The whole history together. Each message has its own cap, but the browser sends every turn
 * (including the assistant's), so without this a crafted request could pack in dozens of
 * maximum-length "assistant" turns and make each question cost far more than a real chat.
 */
export const MAX_TOTAL_LENGTH = 150000

/**
 * Optional extras from the browser: earlier chats to look back at, imported transactions, and
 * the investor profile and holdings from My plan and Portfolio (sent when the user shares them).
 */
export type ChatContext = {
  pastChats: PastChat[]
  transactions: Transaction[]
  profile: InvestorProfile | null
  holdings: Holding[]
}

export type ValidationResult =
  | { ok: true; messages: ChatMessage[]; context: ChatContext; mode: SkillMode }
  | { ok: false; error: string }

export function validateChatRequest(body: unknown): ValidationResult {
  if (typeof body !== "object" || body === null || !("messages" in body)) {
    return { ok: false, error: "Request must include a messages array." }
  }

  const { messages } = body as { messages: unknown }

  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: false, error: "Request must include at least one message." }
  }
  if (messages.length > MAX_MESSAGES) {
    return {
      ok: false,
      error: `This conversation is too long. Start a new chat to keep going.`,
    }
  }

  const cleaned: ChatMessage[] = []
  let totalLength = 0

  for (const message of messages) {
    if (typeof message !== "object" || message === null) {
      return { ok: false, error: "Each message must be an object." }
    }

    const { role, content } = message as { role: unknown; content: unknown }

    if (role !== "user" && role !== "assistant") {
      return { ok: false, error: "Message role must be 'user' or 'assistant'." }
    }
    if (typeof content !== "string") {
      return { ok: false, error: "Message content must be text." }
    }

    const trimmed = content.trim()

    const limit = role === "user" ? MAX_MESSAGE_LENGTH : MAX_ASSISTANT_MESSAGE_LENGTH
    if (trimmed.length > limit) {
      return {
        ok: false,
        error:
          role === "user"
            ? `Messages can be at most ${MAX_MESSAGE_LENGTH} characters.`
            : "This conversation has grown too long. Start a new chat to keep going.",
      }
    }
    // An empty assistant turn is left over from a stopped or failed reply; drop it.
    if (trimmed.length === 0) {
      if (role === "user") {
        return { ok: false, error: "Messages can't be empty." }
      }
      continue
    }

    totalLength += trimmed.length
    if (totalLength > MAX_TOTAL_LENGTH) {
      return { ok: false, error: "This conversation has grown too long. Start a new chat to keep going." }
    }

    cleaned.push({ role, content: trimmed })
  }

  if (cleaned[0]?.role !== "user") {
    return { ok: false, error: "The conversation must start with a user message." }
  }
  if (cleaned[cleaned.length - 1].role !== "user") {
    return { ok: false, error: "The last message must be from the user." }
  }

  // Context is best-effort: malformed entries are dropped instead of failing the question.
  const { context } = body as { context?: unknown }
  const extras = typeof context === "object" && context !== null ? (context as Record<string, unknown>) : {}

  return {
    ok: true,
    messages: cleaned,
    mode: (body as { mode?: unknown }).mode === "deep-research" ? "deep-research" : "standard",
    context: {
      pastChats: parsePastChats(extras.pastChats),
      transactions: parseTransactions(extras.transactions),
      profile: parseProfile(extras.profile),
      holdings: parsePortfolio({ holdings: extras.holdings })?.holdings ?? [],
    },
  }
}
