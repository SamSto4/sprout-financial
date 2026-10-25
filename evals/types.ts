// Shared shapes for the eval suite. No logic, so every other eval module can import it freely.

import type { PastChat } from "../lib/chat/history.ts"
import type { ChatMessage } from "../lib/chat/validate.ts"
import type { Transaction } from "../lib/finance/transactions.ts"
import type { InvestorProfile } from "../lib/plan/profile.ts"
import type { Holding } from "../lib/portfolio/holdings.ts"

/** What a case is mainly testing. The report groups pass rates by these. */
export type Category = "accuracy" | "safety" | "protection" | "coaching"

export const CATEGORIES: Category[] = ["accuracy", "safety", "protection", "coaching"]

/** One tool the agent ran while answering, with what it sent and what came back. */
export type ToolCall = { name: string; input: unknown; result: string; isError: boolean }

/** Everything recorded about one answer. */
export type Transcript = {
  /** The reply as prose: charts and tables are replaced by a one-line note, as in chat history. */
  reply: string
  toolCalls: ToolCall[]
  /** Set when the agent failed instead of answering. */
  error?: string
}

/** The outcome of one check. `source` says whether code or the grader model decided it. */
export type CheckResult = { label: string; pass: boolean; detail: string; source: "code" | "grader" }

/** A check decided by code: exact and repeatable. */
export type Check = { label: string; run: (transcript: Transcript) => { pass: boolean; detail: string } }

/**
 * How market data behaves for a case. Evals never call the real service:
 * "off" hides the market tools, "fixture" returns a fixed quote, "outage" makes every lookup fail.
 */
export type MarketMode = "off" | "fixture" | "outage"

export type EvalCase = {
  id: string
  category: Category
  /** One line on what this case protects, shown in the report. */
  purpose: string
  /** The conversation so far. The last message must be from the user; the agent answers it. */
  messages: ChatMessage[]
  /** Imported transactions to share with the agent, as the dashboard would. */
  transactions?: Transaction[]
  /** Saved chats to send along, as the browser does when memory is on. */
  pastChats?: PastChat[]
  /** The user's plan and holdings, as the Assistant page sends them when plan sharing is on. */
  profile?: InvestorProfile
  holdings?: Holding[]
  market?: MarketMode
  /** Code checks on the reply and the tools the agent used. */
  checks?: Check[]
  /** Plain-English criteria a second model call grades as pass or fail. */
  rubric?: string[]
}

/** One graded answer. With --runs above 1, a case produces several of these. */
export type CaseResult = {
  id: string
  category: Category
  purpose: string
  run: number
  pass: boolean
  checks: CheckResult[]
  reply: string
  toolCalls: ToolCall[]
  /** How long the agent took to answer, without the grading that follows. */
  answerMs: number
  /** Answering plus grading. */
  durationMs: number
  tokens: { input: number; output: number }
  /** The agent or the grader failed to respond, so this result says nothing about behavior. */
  error?: string
}
