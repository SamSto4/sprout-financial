import "server-only"

import Anthropic from "@anthropic-ai/sdk"

// Shared Claude configuration. Everything here runs on the server only.
export const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5"

// If the model declines a request, the API retries it on a recommended fallback model.
export const FALLBACK_OPTIONS: Pick<Anthropic.Beta.Messages.MessageCreateParams, "betas" | "fallbacks"> = {
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
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
