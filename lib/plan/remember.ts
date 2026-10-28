// The rules for the chat's one-tap "remember this" offers and their Undo. Pure and tested.
//
// An offer to remember something comes only from the person's own sent message (spotCountry reads
// it after card and ID numbers were masked), and never in a conversation about a scam or money
// trouble: someone being pressured or struggling to pay rent shouldn't be asked to fill in a
// profile. That's checked here in code, not left to the model, over the whole conversation, not
// just the last exchange: "I can't pay rent", then "I'm in the UK, who can help?" offers nothing.
// The word lists lean wide on purpose: a missed offer costs nothing.

import { spotCountry, type SpottedCountry } from "./chat-facts.ts"
import { experienceChosen, hasPlanDetails, profileCountryCode, type InvestorProfile } from "./profile.ts"

/** The scams lesson; the assistant links it whenever it spots scam signals (system-prompt.ts). */
const SCAM_LESSON = "/learn/scams-and-biases"

// What the assistant says when it handles money trouble or a scam: credit or debt counselling,
// debt advice charities, food banks, local help, and where to report fraud.
const TROUBLE_REPLY = new RegExp(
  [
    String.raw`\b(?:credit|debt|financial|money)\s+counsel(?:l)?(?:ing|ors?)?\b`,
    String.raw`\bnonprofit\s+(?:credit|debt)\b|\bdebt\s+(?:advice|advisers?|advisors?|charit(?:y|ies)|relief|help\s?line)\b`,
    String.raw`\bfood\s+banks?\b|\blocal\s+assistance\b|\bemergency\s+(?:assistance|housing|rental\s+assistance)\b|\b(?:call|dial)\s+211\b`,
    String.raw`\bcitizens\s+advice\b|\bstepchange\b|\bnational\s+debtline\b|\b(?<!tax\s)shelter\b|\btenant(?:s['’]?)?\s+(?:rights|union)\b`,
    String.raw`\b(?:anti[\s-]?fraud|action\s+fraud|report\s?fraud|fraud\s+(?:centre|center|hotline)|scam(?:s|mer|mers|my)?)\b`,
  ].join("|"),
  "i"
)

// The person's own words about money trouble.
const DISTRESS_QUESTION = new RegExp(
  [
    String.raw`\b(?:can['’]?t|cannot|can\s+not|couldn['’]?t|unable\s+to|struggling\s+to|behind\s+on|late\s+on|fell\s+behind|falling\s+behind)\s+(?:\w+\s+){0,2}(?:afford|pay|make\s+rent|rent|bills?|mortgage|payments?|food|groceries)\b`,
    String.raw`\b(?:evict\w*|foreclos\w*|repossess\w*|bankrupt\w*|collectors?|collection\s+agenc\w*|in\s+collections|sent\s+to\s+collections|payday\s+(?:loans?|lenders?)|loan\s+sharks?|overdrawn|shut[\s-]?off|cut\s+off\s+(?:my|our|the)\s+(?:power|water|gas|electricity|heat|phone)|disconnection|homeless\w*|food\s+banks?|debt\s+advice)\b`,
    String.raw`\b(?:drowning|crushed|overwhelmed|buried|sinking|stuck)\s+(?:in|by|under)\s+(?:\w+\s+){0,2}debts?\b`,
    String.raw`\bstruggling\s+(?:with|under)\s+(?:\w+\s+){0,2}(?:debts?|money|bills?|rent|payments?)\b`,
    String.raw`\bmiss(?:ed|ing)\s+(?:\w+\s+){0,2}(?:payments?|rent|bills?)\b`,
    String.raw`\bno\s+money\s+(?:left\s+)?(?:for|to\s+(?:buy|pay))\b|\b(?:going|gone)\s+hungry\b|\bskip(?:ping)?\s+meals\b`,
  ].join("|"),
  "i"
)

// Scam signals in the person's own words (the same kinds the prompt names).
const SCAM_QUESTION = new RegExp(
  [
    String.raw`\b(?:double|triple)\s+(?:my|your|the|our)\s+money\b|\bguaranteed\s+(?:returns?|profits?|income)\b`,
    String.raw`\bsend\s+(?:crypto|bitcoin|btc|eth|usdt|money|gift\s+cards?)\b|\bgift\s+cards?\b`,
    String.raw`\b(?:telegram|whatsapp)\b|\bget\s+rich\s+quick\b|\brecovery\s+(?:service|agent|company)\b`,
    String.raw`\bpromis\w*\s+(?:me\s+|us\s+)?(?:\d+\s*%|returns?|profits?|to\s+(?:double|triple))\b|\b\d+\s*%\s+(?:a|per|every)\s+(?:day|week|month)\b`,
    String.raw`\b(?:scam\w*|fraud\w*|ponzi|pyramid\s+scheme|con\s+artist)\b|\breport\s+(?:him|her|them|it|this)\b`,
  ].join("|"),
  "i"
)

type Turn = { role: "user" | "assistant"; content: string }

/**
 * Whether the page may offer to remember something after the latest reply in this conversation:
 * false when any reply links the scams lesson or points to counselling, debt advice, a food bank
 * or a fraud report, or when any of the person's messages reads as a scam or as money trouble.
 * False for an empty latest reply too (a stop or a failure).
 */
export function mayOfferToRemember(messages: readonly Turn[]): boolean {
  const last = messages[messages.length - 1]
  if (!last || last.role !== "assistant" || !last.content.trim()) return false
  return messages.every((turn) =>
    turn.role === "assistant"
      ? !turn.content.includes(SCAM_LESSON) && !TROUBLE_REPLY.test(turn.content)
      : !DISTRESS_QUESTION.test(turn.content) && !SCAM_QUESTION.test(turn.content)
  )
}

/**
 * The country to offer to remember after a finished reply, or null: one the person said they live
 * in, in their latest message, that About you doesn't already have, that they haven't turned down
 * in this chat, and only when mayOfferToRemember allows an offer.
 */
export function countryOffer(options: {
  /** The conversation so far, ending with the reply that just finished (user turns as masked). */
  messages: readonly Turn[]
  profile: InvestorProfile | null
  /** Countries already turned down ("No thanks") in this chat. */
  declined?: readonly string[]
}): SpottedCountry | null {
  if (!mayOfferToRemember(options.messages)) return null
  const question = options.messages.findLast((turn) => turn.role === "user")?.content ?? ""
  const spotted = spotCountry(question)
  if (!spotted) return null
  if (options.profile && profileCountryCode(options.profile) === spotted.code) return null
  if (options.declined?.includes(spotted.code)) return null
  return spotted
}

/** The fields a chat save can change, so Undo puts back exactly those. */
export type SavedFields = "focus" | "country"

const FIELD_KEYS: Record<SavedFields, readonly (keyof InvestorProfile)[]> = {
  focus: ["focus"],
  country: ["country", "countryCode", "currency"],
}

/**
 * The profile after undoing one chat save: `current` with the saved fields put back as they were
 * in `before`, so anything saved since (on My plan, or another tap) stays. When there was no
 * profile before and nothing else is in it now, it goes back to no profile at all; when the
 * profile was deleted since, it stays deleted.
 */
export function undoSave(current: InvestorProfile | null, before: InvestorProfile | null, fields: SavedFields): InvestorProfile | null {
  // Deleted since (Clear my plan, in this tab or another): nothing to undo, and putting `before`
  // back would bring the deleted plan back with a fresh date that wins sync.
  if (!current) return null
  const restored: InvestorProfile = { ...current }
  for (const key of FIELD_KEYS[fields]) {
    const value = before?.[key]
    if (value === undefined) delete restored[key]
    else Object.assign(restored, { [key]: value })
  }
  if (!before && restored.country === undefined) restored.country = ""
  if (!before && isBlank(restored)) return null
  return restored
}

function isBlank(profile: InvestorProfile) {
  return !hasPlanDetails(profile) && !experienceChosen(profile) && !profile.country.trim() && !profile.countryCode && (profile.focus?.length ?? 0) === 0
}

/** "the United Kingdom", "the Netherlands", "Ireland": a country's name as it reads in a sentence. */
export function countryInSentence(name: string): string {
  return /^(?:United\s|Netherlands$|Philippines$|Czech Republic$|Dominican Republic$|Bahamas$|Maldives$)/.test(name) ? `the ${name}` : name
}
