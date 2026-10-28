// How many tool calls one answer may run. A round's tool calls all run at once, and nothing in the
// model's output limits how many it asks for: a request like "run the before-you-buy check on
// these 150 tickers" (typed, or planted in a web page) could fire hundreds of market data lookups
// in one go and use up the shared Financial Modeling Prep quota for every user. So each round runs
// at most a handful, and each answer gets a small allowance of market data lookups. Every call that
// doesn't run still gets a result (the API needs one per call), telling the model to answer with
// what it has. Kept free of framework and SDK imports so it can be unit-tested with `node --test`.

import { parseSymbol } from "../market/inputs.ts"
import { MARKET_DATA_TOOLS } from "./grounding.ts"

/** Most tool calls run in one round; a real answer uses one to three. */
export const MAX_TOOL_CALLS_PER_ROUND = 8
/** Most market data lookups (quotes, profiles, company searches, before-you-buy checks) in one answer. */
export const MAX_MARKET_LOOKUPS_PER_ANSWER = 10

/** Whether each call runs, or which allowance stopped it. */
export type ToolCallPlan = "run" | "round-limit" | "answer-limit"

export type ToolPlan = {
  /** One entry per call, in the order the model asked for them. */
  calls: ToolCallPlan[]
  /** Market data lookups used in this answer once the calls marked "run" are done. */
  marketUsed: number
}

/**
 * Decides which of one round's tool calls run, in the order the model asked for them: calls run
 * until MAX_TOOL_CALLS_PER_ROUND have, and market data calls also count against the answer's
 * allowance, which earlier rounds may have used some of.
 */
export function planToolCalls(
  names: readonly string[],
  marketUsedSoFar: number,
  limits: { perRound: number; marketPerAnswer: number } = {
    perRound: MAX_TOOL_CALLS_PER_ROUND,
    marketPerAnswer: MAX_MARKET_LOOKUPS_PER_ANSWER,
  }
): ToolPlan {
  let running = 0
  let marketUsed = marketUsedSoFar
  const calls = names.map((name): ToolCallPlan => {
    if (running >= limits.perRound) return "round-limit"
    if (MARKET_DATA_TOOLS.has(name)) {
      if (marketUsed >= limits.marketPerAnswer) return "answer-limit"
      marketUsed += 1
    }
    running += 1
    return "run"
  })
  return { calls, marketUsed }
}

/**
 * The result sent back for a call that didn't run, written for the model to act on. It names the
 * call's ticker when it has a valid one, so the model can say exactly which ones weren't checked
 * instead of working it out from the order of its calls.
 */
export function skippedToolResult(reason: Exclude<ToolCallPlan, "run">, input?: unknown): string {
  const symbol = parseSymbol(input)
  const which = symbol ? ` This call was for ${symbol}.` : ""
  return reason === "round-limit"
    ? `Not run: at most ${MAX_TOOL_CALLS_PER_ROUND} tools run at once. Answer with the results you have, and if this one still matters, tell the user it wasn't checked.${which}`
    : `Not run: this answer has used its ${MAX_MARKET_LOOKUPS_PER_ANSWER} market data lookups. Answer with the results you have and tell the user which ones weren't checked.${which}`
}

/** The result for market data calls the site-wide market data allowance turned down. */
export const MARKET_LIMIT_RESULT =
  "Not run: the market data allowance is used up for now. Tell the user live market data is unavailable right now, and don't guess figures."
