import "server-only"

import Anthropic from "@anthropic-ai/sdk"

// Shared Claude configuration. Everything here runs on the server only.
// Haiku is the default: it's the fastest and cheapest current model, which suits a free public demo.
// Set ANTHROPIC_MODEL to try another one (the eval suite compares them).
export const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5"

type FallbackOptions = Pick<Anthropic.Beta.Messages.MessageCreateParams, "betas" | "fallbacks">

/**
 * If the model declines a request, the API can retry it on a recommended fallback model. Haiku has
 * no server-side fallback, so the option is only sent for models that support it.
 */
export function fallbackOptions(model: string = MODEL): FallbackOptions | Record<string, never> {
  if (model.startsWith("claude-haiku")) return {}
  return { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" }
}

function apiKey() {
  return process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY
}

export function isAgentConfigured() {
  return Boolean(apiKey())
}

export function createClient() {
  return new Anthropic({ apiKey: apiKey() })
}
