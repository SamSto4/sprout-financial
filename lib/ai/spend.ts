// The monthly spending limit (SPENDING_LIMIT): what each model call costs, and whether the month's
// budget is used up. This file is the logic only; where the running total lives is in spend-server.ts.
// Kept free of framework and SDK imports so it can be unit-tested with `node --test`.

import { MAX_PATCHES } from "../screenshots/image.ts"

/** Token counts from one API response (the SDK's `usage` object). */
export type Usage = {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens?: number | null
  cache_read_input_tokens?: number | null
  server_tool_use?: { web_search_requests?: number | null } | null
}

/** US dollars per million tokens. */
type Rates = { input: number; cacheWrite: number; cacheRead: number; output: number }
type ModelPricing = { standard: Rates; longPrompt?: { overTokens: number; rates: Rates } }

// Anthropic's published list prices (platform.claude.com/docs/en/about-claude/pricing), October 2026.
// Cache writes are the 5-minute kind, which is what `cache_control: { type: "ephemeral" }` uses.
const PRICING: Record<string, ModelPricing> = {
  "claude-haiku-5-5": {
    standard: { input: 0.1, cacheWrite: 0.125, cacheRead: 0.01, output: 0.5 },
    // Haiku 5.5 bills a whole request at the higher rate once its prompt passes 100k tokens.
    longPrompt: { overTokens: 100_000, rates: { input: 0.5, cacheWrite: 0.625, cacheRead: 0.05, output: 2.5 } },
  },
  "claude-sonnet-5-5": { standard: { input: 2, cacheWrite: 2.5, cacheRead: 0.1, output: 10 } },
  "claude-opus-5-5": { standard: { input: 4, cacheWrite: 5, cacheRead: 0.2, output: 20 } },
  "claude-fable-5-1": { standard: { input: 10, cacheWrite: 12.5, cacheRead: 0.25, output: 50 } },
}

/** A model missing from the table is priced like the most expensive one, so the limit errs toward stopping early. */
const UNKNOWN_MODEL = PRICING["claude-fable-5-1"]

/** Web search is billed per search on top of tokens. */
const WEB_SEARCH_USD = 10 / 1000

export function isKnownModel(model: string) {
  return model in PRICING
}

/** The estimated cost of one API response, in US dollars. */
export function estimateCostUsd(model: string, usage: Usage): number {
  const pricing = PRICING[model] ?? UNKNOWN_MODEL
  const cacheWrite = usage.cache_creation_input_tokens ?? 0
  const cacheRead = usage.cache_read_input_tokens ?? 0
  const promptTokens = usage.input_tokens + cacheWrite + cacheRead
  const rates =
    pricing.longPrompt && promptTokens > pricing.longPrompt.overTokens ? pricing.longPrompt.rates : pricing.standard

  const tokens =
    usage.input_tokens * rates.input +
    cacheWrite * rates.cacheWrite +
    cacheRead * rates.cacheRead +
    usage.output_tokens * rates.output
  const searches = usage.server_tool_use?.web_search_requests ?? 0
  return tokens / 1_000_000 + searches * WEB_SEARCH_USD
}

/**
 * The usage of a model round that was stopped or failed before it finished. Anthropic still bills
 * it: the prompt (known from the stream's first event, which `usage` comes from), the output
 * generated so far and any searches already run. The final output count only arrives at the end
 * of the stream, so it's estimated from the characters streamed (text, tool inputs and thinking)
 * at three characters a token, which errs high.
 */
export function unfinishedRoundUsage(usage: Usage, streamedChars: number, searchesStarted: number): Usage {
  return {
    ...usage,
    output_tokens: Math.max(usage.output_tokens, Math.ceil(Math.max(0, streamedChars) / 3)),
    server_tool_use: { web_search_requests: Math.max(usage.server_tool_use?.web_search_requests ?? 0, searchesStarted) },
  }
}

/** The screenshot prompt and its output schema together, rounded up. */
const SCREENSHOT_PROMPT_TOKENS = 2000

/**
 * What a screenshot call is counted at when it was stopped or lost before its response arrived,
 * so its real usage is never known: the largest image (one token per patch) for each image sent
 * (a tall capture is sent in pieces), the prompt and a full-length answer. The spending limit errs
 * toward stopping early.
 */
export function unfinishedScreenshotCostUsd(model: string, maxOutputTokens: number, images = 1): number {
  const imageTokens = MAX_PATCHES * Math.max(1, Math.floor(images))
  return estimateCostUsd(model, { input_tokens: imageTokens + SCREENSHOT_PROMPT_TOKENS, output_tokens: maxOutputTokens })
}

/**
 * Running totals are kept in whole micro-dollars (millionths of a dollar), so adding thousands of
 * tiny costs never drifts the way repeated floating-point addition can.
 */
export function toMicroUsd(usd: number): number {
  return Number.isFinite(usd) && usd > 0 ? Math.ceil(usd * 1_000_000) : 0
}

/** Reads SPENDING_LIMIT: US dollars per calendar month. Unset, zero or not a number means no limit. */
export function parseSpendingLimit(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null
  const parsed = Number(value.trim().replace(/^\$/, ""))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

/** The calendar month a moment falls in (UTC), e.g. "2026-10". Each month's total starts from zero. */
export function monthKey(now: number): string {
  return new Date(now).toISOString().slice(0, 7)
}

/** When the month's total can be thrown away: the start of the next month, plus a day of slack. */
export function monthExpiry(now: number): Date {
  const date = new Date(now)
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 2))
}

/** True when the month's spending has reached the limit, so new AI calls should stop. */
export function isOverLimit(spentMicroUsd: number, limitUsd: number | null): boolean {
  return limitUsd !== null && spentMicroUsd >= toMicroUsd(limitUsd)
}
