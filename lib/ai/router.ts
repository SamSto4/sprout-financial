// Decides how much machinery a message needs before any model call is made. Most messages go to
// the full agent (tools, skills, up to STANDARD_TOOL_ROUNDS of tool use). Pure small talk such as
// "hi" or "thanks, that helps!" goes to a single fast call with no tools, so it starts streaming
// sooner and costs less. This runs in code, not on a model: the app already answers with the
// smallest model, so a model-based router would add a round trip before every reply.
// Kept free of framework and SDK imports so it can be unit-tested with `node --test`.

import type { SkillMode } from "./skilltypes.ts"

export type Route = "direct" | "agent"

// A message is small talk when every word is in this list and at least one is a greeting, thanks
// or goodbye. "ok", "yes" and "sure" are left out on purpose: after "want me to run the numbers?"
// they're a request for the agent to act, which needs tools.
const SMALL_TALK_CORE = new Set([
  "hi", "hello", "hey", "hiya", "howdy", "greetings", "morning", "afternoon", "evening",
  "thanks", "thank", "thx", "ty", "cheers", "appreciate", "appreciated",
  "bye", "goodbye", "cya", "later",
])
const SMALL_TALK_FILLER = new Set([
  "there", "sprout", "good", "you", "so", "much", "a", "lot", "very", "it", "that", "this", "for", "the", "help",
  "helps", "helped", "helpful", "makes", "sense", "got", "great", "perfect", "awesome", "nice", "cool", "ok",
  "okay", "see", "again", "all", "and", "oh", "really", "super", "have", "day", "night",
])
// Longer messages are almost never pure small talk, and checking a bounded number of words keeps this cheap.
const MAX_SMALL_TALK_WORDS = 8

/** Picks the path for the latest user message. Deep research always gets the full agent. */
export function routeMessage(lastUserMessage: string, mode: SkillMode): Route {
  if (mode !== "standard") return "agent"
  const words = lastUserMessage
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/'/g, "")
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0 || words.length > MAX_SMALL_TALK_WORDS) return "agent"
  const smallTalk = words.every((word) => SMALL_TALK_CORE.has(word) || SMALL_TALK_FILLER.has(word))
  return smallTalk && words.some((word) => SMALL_TALK_CORE.has(word)) ? "direct" : "agent"
}
