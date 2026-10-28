// What the person wants help with: the "What are you working on?" chips on the empty chat. One
// tap saves the focus and sends its starter question. The focus picks the suggested questions and
// tells the assistant what to lean toward; any question is still answered.
// Pure and tested; safe to share between the browser and the server.

import type { RoadmapStep } from "./roadmap.ts"

export const FOCUS = {
  debt: {
    chip: "Getting out of debt",
    label: "paying off debt",
    starter: "I want to get out of debt. Where should I start?",
    more: ["Should I pay off debt or save first?", "What's the difference between the avalanche and snowball methods?"],
  },
  saving: {
    chip: "Building savings",
    label: "building savings",
    starter: "I want to build up my savings. Where should I start?",
    more: ["How big should my emergency fund be?", "Where should I keep my emergency savings?"],
  },
  investing: {
    chip: "Starting to invest",
    label: "starting to invest",
    starter: "I want to start investing. What should I do first?",
    more: ["What's an index fund, and why do people recommend them?", "How much money do I need to start investing?"],
  },
  retirement: {
    chip: "Retirement",
    label: "saving for retirement",
    starter: "How should I start saving for retirement?",
    more: ["How does compound growth help retirement savings?", "What accounts can I use to save for retirement?"],
  },
  home: {
    chip: "Buying a home",
    label: "buying a home",
    starter: "I want to buy a home one day. How do I get ready?",
    more: ["How much should I save for a home deposit?", "Should I invest the money I'm saving for a home?"],
  },
  budget: {
    chip: "Making a budget",
    label: "making a budget",
    starter: "Can you help me make a simple budget?",
    more: ["How does the 50/30/20 budget work?", "How can I cut back on spending without feeling miserable?"],
  },
  learning: {
    chip: "Just learning",
    label: "learning the basics",
    starter: "I'm just learning about money. What basics should I know first?",
    more: ["What's the difference between saving and investing?", "What does compound interest mean?"],
  },
} as const

export type FocusId = keyof typeof FOCUS

/** In the order the chips are shown. */
export const FOCUS_IDS = Object.keys(FOCUS) as FocusId[]

/** A person can pick up to this many; a fourth replaces the oldest. */
export const MAX_FOCUS = 3

export function isFocusId(value: unknown): value is FocusId {
  return typeof value === "string" && Object.hasOwn(FOCUS, value)
}

/** Known topics only, each once, at most MAX_FOCUS, in the stored order (newest first). */
export function parseFocus(raw: unknown): FocusId[] {
  if (!Array.isArray(raw)) return []
  const kept: FocusId[] = []
  for (const value of raw.slice(0, 20)) {
    if (isFocusId(value) && !kept.includes(value)) kept.push(value)
    if (kept.length === MAX_FOCUS) break
  }
  return kept
}

/** Adds a topic (a chip tap) as the newest, keeping the others up to MAX_FOCUS. */
export function addFocus(current: readonly FocusId[], id: FocusId): FocusId[] {
  return [id, ...current.filter((existing) => existing !== id)].slice(0, MAX_FOCUS)
}

/** "paying off debt and building savings", for the summary and receipts. */
export function focusLabels(ids: readonly FocusId[]): string {
  const labels = ids.map((id) => FOCUS[id].label)
  if (labels.length <= 1) return labels[0] ?? ""
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`
}

/** A question about the money roadmap step the person is on, with no figures (screens get shared). */
const STEP_STARTERS: Record<RoadmapStep["id"], string> = {
  "starter-buffer": "How big should my starter emergency buffer be?",
  "high-interest-debt": "Which of my debts should I pay off first?",
  "employer-match": "How does an employer retirement match work, and how do I get all of it?",
  "full-emergency-fund": "How do I grow my emergency fund to 3-6 months of essentials?",
  "tax-advantaged": "Which tax-advantaged accounts should I look at?",
  "invest-more": "What should I invest in once my tax-advantaged accounts are covered?",
}

export function stepStarter(step: RoadmapStep["id"]): string {
  return STEP_STARTERS[step]
}

/**
 * Suggested questions for the empty chat: the roadmap step's question first (pass it only when the
 * plan has real content, see hasPlanDetails in profile.ts), then each focus's questions, newest
 * focus first. No focus and no step gives an empty list, so the page keeps its usual suggestions.
 */
export function starterQuestions(options: { focus: readonly FocusId[]; step?: RoadmapStep["id"] | null }, limit = 4): string[] {
  const questions: string[] = []
  const add = (question: string) => {
    if (!questions.includes(question)) questions.push(question)
  }
  if (options.step) add(STEP_STARTERS[options.step])
  for (const id of options.focus) add(FOCUS[id].more[0])
  for (const id of options.focus) add(FOCUS[id].more[1])
  return questions.slice(0, Math.max(0, limit))
}
