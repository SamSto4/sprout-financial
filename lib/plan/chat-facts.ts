// Facts the person states about themselves in chat, spotted by code (no model call) so the page
// can offer to remember them with one tap. Only the person's own sent message is read, after card
// and ID numbers were masked (lib/chat/redact.ts); a reply, a web page or a saved chat can't
// supply a value. Nothing is saved from here: the page asks first.
// Pure and tested.

import { countryByCode, normalizeCountry, type CountryCode } from "./countries.ts"

export type SpottedCountry = { code: CountryCode; name: string }

// "I live in", "we live in", "I'm in", "I am in", "we're in", "based in" (as in "I'm based in"), "moved to"
// (as in "I just moved to", "we moved to"). Present tense or a completed move only: "I'll move
// to" or "moving to" isn't where someone lives.
const PHRASE = /\b(?:(?:i|we)\s+(?:now\s+|currently\s+)?live\s+in|i['’]?m\s+in|i\s+am\s+in|we['’]re\s+in|we\s+are\s+in|based\s+in|moved\s+to)[^\S\n]+/gi

// "I'm in" and "we're in" also say where someone is today, not where they live: a holiday, a trip
// or a question ("I'm in Germany? No, France"). After those, any of these means it isn't kept.
const WEAK_PHRASE = /^(?:i['’]?m|i\s+am|we['’]re|we\s+are)\s+in\b/i
const VISITING =
  /^\s*(?:\?|,?\s*(?:for|on)\s+(?:(?:a|an|the|my|our|this|some|two|three|a\s+few|a\s+couple\s+of)\s+)?(?:\w+\s+)?(?:holidays?|vacations?|trips?|visits?|week|weeks|weekend|days|months?|semester|term|conference|wedding|work|business|exchange|tour|now|the\s+moment)\b|,?\s*(?:visiting|travel+ing|temporarily|just\s+(?:visiting|for)|until|till|right\s+now|at\s+the\s+moment|this\s+(?:week|weekend|month|summer|winter|spring|autumn|fall))\b)/i

// Words before the phrase, in the same sentence, that mean it isn't where they live now:
// "I don't live in", "not based in", "never moved to", "if I moved to", "I used to live in",
// "my sister lives in" is not matched at all (the phrase needs "I" or "we").
const NEGATION = /\b(?:not|never|no\s+longer|don['’]?t|do\s+not|didn['’]?t|haven['’]?t|hasn['’]?t|wasn['’]?t|aren['’]?t|if|used\s+to|would|wish|whether|unless|before)\b|n['’]t\b/i

// After the country, the sentence has to end or carry on with a small word. "I'm in Canada Goose"
// (a jacket), "I'm in the US Army" and "I'm in India's tech sector" give nothing.
const FOLLOWER = /^(?:$|\s*\n|[.,;:!?)\]—–-]|\s+(?:and|but|so|now|right|too|as|since|for|with|where|which|who|because|though|although|while|currently|at|by|from|on|in|this|these|last|next|already|anyway|btw|by\s+the\s+way|haha|lol)\b|\s*$)/i

/** Longest names first, so "United States of America" wins over "United States". */
const MAX_NAME_WORDS = 4

/**
 * The country the person says they live in ("I live in Ireland", "I'm in the UK by the way",
 * "we're based in Canada", "I just moved to Germany"), or null. Negated or hypothetical mentions
 * are skipped, regions and cities ("I'm in Ontario") give nothing, and two different countries in
 * one message give nothing, since it's unclear which is meant.
 */
export function spotCountry(message: string): SpottedCountry | null {
  if (typeof message !== "string" || message.length === 0) return null
  const text = message.slice(0, 4000)
  const found = new Set<CountryCode>()

  for (const match of text.matchAll(PHRASE)) {
    const start = match.index ?? 0
    // The same clause, up to the phrase: a negation earlier in it counts ("I don't live in the US
    // any more, I moved to Ireland" still gives Ireland).
    const before = text.slice(0, start).split(/[.!?\n,;]|\bbut\b/i).pop() ?? ""
    if (NEGATION.test(before)) continue
    const at = countryAt(text.slice(start + match[0].length))
    if (!at) continue
    if (WEAK_PHRASE.test(match[0]) && VISITING.test(at.after)) continue
    found.add(at.code)
  }
  if (found.size !== 1) return null
  const [code] = found
  return { code, name: countryByCode(code)?.name ?? code }
}

/**
 * The country named at the start of `rest`, followed by the end of the sentence or a small word,
 * and the text after its name.
 */
function countryAt(raw: string): { code: CountryCode; after: string } | null {
  // Runs of spaces become one, so a name split by two spaces still matches; line breaks stay.
  const rest = raw.slice(0, 200).replace(/[^\S\n]+/g, " ")
  const words = /^(?:the )?([\p{L}][\p{L}.'’-]*(?: [\p{L}][\p{L}.'’-]*){0,3})/iu.exec(rest)
  if (!words) return null
  const article = /^the /i.exec(rest)?.[0] ?? ""
  const parts = words[1].split(" ").slice(0, MAX_NAME_WORDS)
  for (let count = parts.length; count >= 1; count--) {
    const name = parts.slice(0, count).join(" ")
    // A trailing dot ends the sentence ("I live in Spain."), unless it's an abbreviation ("U.S.").
    const candidates = /\.$/.test(name) && !/^(?:[A-Za-z]\.){2,}$/.test(name) ? [name.replace(/\.$/, ""), name] : [name]
    for (const candidate of candidates) {
      const code = recognize(candidate)
      if (!code) continue
      // The candidate starts right after the article, so this is where the name ends.
      const after = rest.slice(article.length + candidate.length)
      return FOLLOWER.test(after) ? { code, after } : null
    }
  }
  return null
}

/**
 * Short forms only in capitals ("UK", "US", "U.S.", "UAE"), so "us" in "it's in us" or "in uk
 * pounds" isn't read as a country, and lowercase two-letter words never are.
 */
function recognize(name: string): CountryCode | null {
  const letters = name.replace(/\./g, "")
  if (letters.length <= 3 && letters !== letters.toUpperCase()) return null
  return normalizeCountry(name)
}
