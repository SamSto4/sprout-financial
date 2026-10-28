// Validates the chat history the browser sends to /api/chat.
// Kept free of framework and SDK imports so it can be unit-tested with `node --test`.

import type { SkillMode } from "../ai/skilltypes"
import { parseTransactions, type Transaction } from "../finance/transactions.ts"
import { parsePastChats, type PastChat } from "./history.ts"
import { redactSensitiveNumbers } from "./redact.ts"
import { parseProfile, type InvestorProfile } from "../plan/profile.ts"
import { MAX_HOLDINGS, parsePortfolio, type Holding } from "../portfolio/holdings.ts"

export type ChatRole = "user" | "assistant"

/** Longest question another page can pre-fill with /assistant?q=; the site's own are one sentence. */
export const MAX_PREFILL_LENGTH = 500

/** A pre-filled question as the message box gets it: one line, whitespace collapsed, at most MAX_PREFILL_LENGTH. */
export function prefilledQuestion(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_PREFILL_LENGTH)
}

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
 * The largest request body /api/chat reads. The biggest real one, with every part at its limit
 * (the history above, 20 past chats, 2,000 shared transactions, the plan and 40 holdings, all in
 * three-byte characters), is a little over 2 MB; anything larger is refused before it's parsed.
 */
export const MAX_CHAT_REQUEST_BYTES = 3 * 1024 * 1024

/** At most this many finished lessons are read from a request (the course has fewer). */
export const MAX_COMPLETED_LESSONS = 40

const LESSON_SLUG = /^[a-z0-9-]{1,80}$/

/**
 * Optional extras from the browser: earlier chats to look back at, imported transactions, and
 * the investor profile and holdings from My plan and Portfolio (sent when the user shares them).
 */
export type ChatContext = {
  pastChats: PastChat[]
  transactions: Transaction[]
  /** The saved profile, sent while About you is on. */
  profile: InvestorProfile | null
  /** Holdings, sent while the portfolio switch is on. */
  holdings: Holding[]
  /**
   * Whether About you is on in the browser. The plan tools are offered whenever it is, even before
   * anything is saved, so a first save partway through a chat doesn't change the tool list (and
   * the cached prompt). Always set by validateChatRequest; optional so pages can leave it out.
   */
  aboutYou?: boolean
  /** Finished lesson slugs, sent while About you is on unless "Don't use these" is chosen. */
  completedLessons?: string[]
}

export type ValidateOptions = {
  /** The course's lesson slugs: finished lessons not among them are dropped (the server passes these). */
  lessonSlugs?: readonly string[]
}

/** Well-formed slugs, each once, at most MAX_COMPLETED_LESSONS, and only the course's own when given. */
export function parseCompletedLessons(raw: unknown, lessonSlugs?: readonly string[]): string[] {
  if (!Array.isArray(raw)) return []
  const known = lessonSlugs ? new Set(lessonSlugs) : null
  const kept: string[] = []
  // Cut before checking: anyone can send this, before any rate limit.
  for (const slug of raw.slice(0, MAX_COMPLETED_LESSONS * 2)) {
    if (typeof slug !== "string" || !LESSON_SLUG.test(slug) || kept.includes(slug)) continue
    if (known && !known.has(slug)) continue
    kept.push(slug)
    if (kept.length === MAX_COMPLETED_LESSONS) break
  }
  return kept
}

export type ValidationResult =
  | { ok: true; messages: ChatMessage[]; context: ChatContext; mode: SkillMode }
  | { ok: false; error: string }

/**
 * Checks a chat request. The "About the user" summary is never read from it: the server builds
 * that from the parsed profile and lessons (buildAboutCard in lib/plan/about-card.ts).
 */
export function validateChatRequest(body: unknown, options: ValidateOptions = {}): ValidationResult {
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

    // Card, account and ID numbers a person typed are masked before anything else sees them; the
    // browser already does this, so this covers older pages and hand-made requests (redact.ts).
    const trimmed = (role === "user" ? redactSensitiveNumbers(content).text : content).trim()

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
  const profile = parseProfile(extras.profile)
  // Pages from before the About you switch send the profile only while sharing is on, with no flag.
  const aboutYou = extras.aboutYou === true || profile !== null

  return {
    ok: true,
    messages: cleaned,
    mode: (body as { mode?: unknown }).mode === "deep-research" ? "deep-research" : "standard",
    context: {
      pastChats: parsePastChats(extras.pastChats),
      transactions: parseTransactions(extras.transactions),
      profile,
      // Anyone can send this, signed in or not, before any rate limit: cut the list before parsing.
      holdings: parsePortfolio({ holdings: Array.isArray(extras.holdings) ? extras.holdings.slice(0, MAX_HOLDINGS) : [] })?.holdings ?? [],
      aboutYou,
      // Lessons belong to About you: with it off they're not used, whatever was sent.
      completedLessons: aboutYou ? parseCompletedLessons(extras.completedLessons, options.lessonSlugs) : [],
    },
  }
}
