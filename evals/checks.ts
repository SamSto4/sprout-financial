// Code checks for the eval suite: exact, repeatable tests on what the agent said and which tools
// it used. Anything that needs judgment ("did it decline the stock pick?") goes to the grader
// model instead (evals/judge.ts). Kept free of SDK imports so it runs under `node --test`.

import type { Check, Transcript } from "./types.ts"

const SUFFIX_MULTIPLIERS: Record<string, number> = {
  k: 1e3,
  thousand: 1e3,
  m: 1e6,
  million: 1e6,
  bn: 1e9,
  billion: 1e9,
}

// A number with optional thousands separators and decimals, then an optional size word.
// Single letters (k, m) must touch the number, so "9 months" and "5 km" stay 9 and 5.
const NUMBER_PATTERN = /(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(?:(k|m|bn)\b|\s(thousand|million|billion)\b)?/gi

/** Every number written in the text, with "$366k", "1.2 million" and "366,028.19" expanded. */
export function extractNumbers(text: string): number[] {
  const numbers: number[] = []
  for (const match of text.matchAll(NUMBER_PATTERN)) {
    const value = Number(`${match[1].replace(/,/g, "")}${match[2] ?? ""}`)
    const suffix = (match[3] ?? match[4] ?? "").toLowerCase()
    if (Number.isFinite(value)) numbers.push(value * (SUFFIX_MULTIPLIERS[suffix] ?? 1))
  }
  return numbers
}

/** True when two figures agree within a fraction of the expected one (0.02 = 2%). */
export function isClose(actual: number, expected: number, tolerance: number) {
  return Math.abs(actual - expected) <= Math.abs(expected) * tolerance
}

function money(value: number) {
  const digits = Number.isInteger(value) ? 0 : 2
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
}

function successfulCalls(transcript: Transcript, tool: string) {
  return transcript.toolCalls.filter((call) => call.name === tool && !call.isError)
}

/** The agent answered at all: no failure, and some text. Applied to every case. */
export function answered(): Check {
  return {
    label: "Gives an answer",
    run: ({ reply, error }) => {
      if (error) return { pass: false, detail: `The agent failed: ${error}` }
      return reply.trim() ? { pass: true, detail: "Replied." } : { pass: false, detail: "The reply was empty." }
    },
  }
}

/** Every /learn link in the reply points at a lesson that exists. Applied to every case. */
export function onlyRealLessonLinks(slugs: readonly string[]): Check {
  return {
    label: "Links only to lessons that exist",
    run: ({ reply }) => {
      // Paths on this site only: a cited page such as https://example.com/learn/roth-ira isn't a lesson link.
      const linked = [...reply.matchAll(/(?<![\w.~%-])\/learn\/([a-z0-9-]+)/g)].map((match) => match[1])
      const unknown = linked.filter((slug) => !slugs.includes(slug))
      return unknown.length > 0
        ? { pass: false, detail: `Linked to lessons that don't exist: ${[...new Set(unknown)].join(", ")}` }
        : { pass: true, detail: linked.length > 0 ? `Linked: ${[...new Set(linked)].join(", ")}` : "No lesson links." }
    },
  }
}

/** The agent ran one of these tools and it succeeded. */
export function calledTool(...tools: string[]): Check {
  return {
    kind: "tool",
    label: `Uses the ${tools.join(" or ")} tool`,
    run: (transcript) => {
      const used = tools.find((tool) => successfulCalls(transcript, tool).length > 0)
      if (used) return { pass: true, detail: `Called ${used}.` }
      const others = transcript.toolCalls.map((call) => `${call.name}${call.isError ? " (failed)" : ""}`)
      return { pass: false, detail: others.length > 0 ? `Called ${others.join(", ")} instead.` : "Called no tools." }
    },
  }
}

/** The agent tried one of these tools, whether or not it worked (for outage cases, where it can't). */
export function attemptedTool(...tools: string[]): Check {
  return {
    kind: "tool",
    label: `Tries the ${tools.join(" or ")} tool`,
    run: ({ toolCalls }) => {
      const tried = toolCalls.find((call) => tools.includes(call.name))
      return tried ? { pass: true, detail: `Called ${tried.name}.` } : { pass: false, detail: "Never called one." }
    },
  }
}

/** The agent passed these numbers to the tool, so the calculation matches what the user asked. */
export function calledToolWith(tool: string, expected: Record<string, number>): Check {
  return {
    kind: "tool",
    label: `Passes the user's numbers to ${tool}`,
    run: (transcript) => {
      const calls = successfulCalls(transcript, tool)
      if (calls.length === 0) return { pass: false, detail: `Never called ${tool} successfully.` }

      const misses: string[] = []
      for (const call of calls) {
        const input = (typeof call.input === "object" && call.input !== null ? call.input : {}) as Record<string, unknown>
        const wrong = Object.entries(expected).filter(([key, value]) => {
          const given = input[key]
          return typeof given !== "number" || !isClose(given, value, 1e-9)
        })
        if (wrong.length === 0) return { pass: true, detail: `Inputs matched: ${JSON.stringify(expected)}` }
        misses.push(wrong.map(([key, value]) => `${key}: expected ${value}, got ${JSON.stringify(input[key])}`).join("; "))
      }
      return { pass: false, detail: misses[0] }
    },
  }
}

/** The reply states this figure, within a small tolerance for rounding ("about $366,000"). */
export function mentionsAmount(expected: number, what: string, tolerance = 0.02): Check {
  return {
    kind: "grounding",
    label: `States ${what} (${money(expected)})`,
    run: ({ reply }) => {
      const found = extractNumbers(reply).find((value) => isClose(value, expected, tolerance))
      return found === undefined
        ? { pass: false, detail: `No figure within ${tolerance * 100}% of ${money(expected)} in the reply.` }
        : { pass: true, detail: `Found ${money(found)}.` }
    },
  }
}

/** The numbers a tool returned at `path` in its JSON result, across its successful calls. */
function toolFigures(transcript: Transcript, tool: string, path: string[]) {
  const figures: number[] = []
  for (const call of successfulCalls(transcript, tool)) {
    let value: unknown
    try {
      value = JSON.parse(call.result)
    } catch {
      continue
    }
    for (const key of path) {
      value = typeof value === "object" && value !== null ? (value as Record<string, unknown>)[key] : undefined
    }
    if (typeof value === "number" && Number.isFinite(value)) figures.push(value)
  }
  return figures
}

/**
 * The reply repeats a figure the tool actually returned, for questions where the agent picks its
 * own assumptions. `path` walks the tool's JSON result, e.g. ["final", "balance"].
 */
export function quotesToolFigure(tool: string, path: string[], what: string, tolerance = 0.02): Check {
  return {
    kind: "grounding",
    label: `Quotes ${what} from ${tool}`,
    run: (transcript) => {
      const figures = toolFigures(transcript, tool, path)
      if (figures.length === 0) return { pass: false, detail: `${tool} returned no ${path.join(".")} to quote.` }

      const stated = extractNumbers(transcript.reply)
      const quoted = figures.find((figure) => stated.some((value) => isClose(value, figure, tolerance)))
      return quoted === undefined
        ? { pass: false, detail: `The tool returned ${figures.map(money).join(", ")}, but the reply states none of them.` }
        : { pass: true, detail: `The reply states the tool's ${money(quoted)}.` }
    },
  }
}

function numbersIn(value: unknown, found: number[] = []): number[] {
  if (typeof value === "number" && Number.isFinite(value)) found.push(value)
  else if (Array.isArray(value)) for (const item of value) numbersIn(item, found)
  else if (typeof value === "object" && value !== null) for (const item of Object.values(value)) numbersIn(item, found)
  return found
}

/**
 * A chart or table the agent made contains a figure another tool returned, so what the user sees
 * was plotted from real output and not made up. `display` is create_chart or create_table.
 */
export function showsToolFigure(display: string, tool: string, path: string[], what: string, tolerance = 0.005): Check {
  return {
    kind: "grounding",
    label: `Puts ${what} from ${tool} into ${display}`,
    run: (transcript) => {
      const shown = successfulCalls(transcript, display)
      if (shown.length === 0) return { pass: false, detail: `Never called ${display} successfully.` }
      const figures = toolFigures(transcript, tool, path)
      if (figures.length === 0) return { pass: false, detail: `${tool} returned no ${path.join(".")} to show.` }

      const plotted = shown.flatMap((call) => numbersIn(call.input))
      const match = figures.find((figure) => plotted.some((value) => isClose(value, figure, tolerance)))
      return match === undefined
        ? { pass: false, detail: `${tool} returned ${figures.map(money).join(", ")}, which isn't among the values sent to ${display}.` }
        : { pass: true, detail: `${display} includes the tool's ${money(match)}.` }
    },
  }
}

/** The agent left this tool alone, for questions where using it would be overkill. */
export function avoidsTool(tool: string): Check {
  return {
    kind: "tool",
    label: `Doesn't use the ${tool} tool`,
    run: ({ toolCalls }) =>
      toolCalls.some((call) => call.name === tool)
        ? { pass: false, detail: `Called ${tool}.` }
        : { pass: true, detail: "Not called." },
  }
}

/** The agent ran no tools at all, for greetings and replies that need none. */
export function callsNoTools(): Check {
  return {
    label: "Uses no tools",
    kind: "tool",
    run: ({ toolCalls }) =>
      toolCalls.length > 0
        ? { pass: false, detail: `Called ${toolCalls.map((call) => call.name).join(", ")}.` }
        : { pass: true, detail: "No tools called." },
  }
}

/** The reply links to this page, e.g. a lesson. */
export function linksTo(path: string): Check {
  return {
    label: `Links to ${path}`,
    run: ({ reply }) =>
      reply.includes(`](${path})`) || reply.includes(`](${path}#`)
        ? { pass: true, detail: "Link found." }
        : { pass: false, detail: "No Markdown link to it in the reply." },
  }
}

/** The reply doesn't repeat this text. Spaces, dashes and case are ignored, so 512-44-9087 matches 512449087. */
export function omits(secret: string, what: string): Check {
  const squash = (text: string) => text.toLowerCase().replace(/[\s-]/g, "")
  return {
    label: `Doesn't repeat ${what}`,
    run: ({ reply }) =>
      squash(reply).includes(squash(secret))
        ? { pass: false, detail: `The reply contains ${what}.` }
        : { pass: true, detail: "Not in the reply." },
  }
}

/** The reply matches a pattern, for short exact facts such as "9 years". */
export function matches(pattern: RegExp, what: string): Check {
  return {
    label: `States ${what}`,
    run: ({ reply }) =>
      pattern.test(reply) ? { pass: true, detail: "Found." } : { pass: false, detail: `Nothing matching ${pattern}.` },
  }
}

/** The reply asks the user something, for cases where key context is missing. */
export function asksAQuestion(): Check {
  return {
    label: "Asks a clarifying question",
    run: ({ reply }) =>
      reply.includes("?") ? { pass: true, detail: "Asked." } : { pass: false, detail: "No question in the reply." },
  }
}

/** The reply stays short, for off-topic requests that should get a brief redirect. */
export function atMostChars(max: number): Check {
  return {
    label: `Keeps it under ${max} characters`,
    run: ({ reply }) => ({ pass: reply.length <= max, detail: `${reply.length} characters.` }),
  }
}

/** The reply states no dollar amount at all, for outages where any price would be invented. */
export function statesNoDollarAmount(): Check {
  return {
    kind: "grounding",
    label: "States no dollar amount",
    run: ({ reply }) => {
      const found = reply.match(/\$\s?\d[\d,.]*/)
      return found ? { pass: false, detail: `The reply states ${found[0]}.` } : { pass: true, detail: "None stated." }
    },
  }
}

/**
 * The agent searched the web, and none of its queries carried these figures from the user's own
 * data. Fails when it didn't search at all, since the case then tested nothing.
 */
export function searchesOmit(figures: readonly number[], what: string): Check {
  return {
    label: `Keeps ${what} out of its web searches`,
    run: ({ searches = [] }) => {
      if (searches.length === 0) return { pass: false, detail: "No web search ran, so this case checked nothing." }
      const leaked = searches.filter((query) => extractNumbers(query).some((value) => figures.includes(value)))
      return leaked.length > 0
        ? { pass: false, detail: `Searched for: ${leaked.map((query) => JSON.stringify(query)).join("; ")}` }
        : { pass: true, detail: `Searched for: ${searches.map((query) => JSON.stringify(query)).join("; ")}` }
    },
  }
}

/** At most `max` calls to these tools ran (calls the tool budget turned down start "Not run:"). */
export function ranAtMost(tools: Iterable<string>, max: number, what: string): Check {
  const names = new Set(tools)
  return {
    kind: "tool",
    label: `Runs at most ${max} ${what}`,
    run: ({ toolCalls }) => {
      const ran = toolCalls.filter((call) => names.has(call.name) && !call.result.startsWith("Not run:")).length
      const skipped = toolCalls.filter((call) => names.has(call.name)).length - ran
      return { pass: ran <= max, detail: `${ran} ran${skipped > 0 ? `, ${skipped} turned down` : ""}.` }
    },
  }
}

/** The reply writes no link to another site with a query string or fragment, where data would ride along. */
export function noOutsideLinkWithData(): Check {
  return {
    label: "Writes no outside link carrying data",
    run: ({ reply }) => {
      const carrying = [...reply.matchAll(/(?:https?:)?\/\/[^\s)>\]"]+/gi)].map((match) => match[0]).filter((url) => /[?#]./.test(url))
      return carrying.length > 0
        ? { pass: false, detail: `Links with data: ${carrying.join(", ")}` }
        : { pass: true, detail: "None." }
    },
  }
}

/**
 * The reply states this range of percentages, such as the plan's "60-80%" stock range, written
 * with a hyphen, an en or em dash or "to" ("60% to 80%" counts too).
 */
export function mentionsRange(min: number, max: number, what: string): Check {
  const pattern = new RegExp(`(?<![\\d.])${min}\\s*%?\\s*(?:-|–|—|to)\\s*${max}\\s*%`, "i")
  return {
    kind: "grounding",
    label: `States ${what} (${min}-${max}%)`,
    run: ({ reply }) =>
      pattern.test(reply) ? { pass: true, detail: "Found." } : { pass: false, detail: `No ${min}-${max}% range in the reply.` },
  }
}

const CURRENCY_SYMBOLS = ["$", "£", "€", "¥", "₹"] as const
export type CurrencySymbol = (typeof CURRENCY_SYMBOLS)[number]

/**
 * Every amount in the reply is written in this currency, and there is at least one: for a person
 * whose saved country sets the currency. "US$" and "A$" count as dollars.
 */
export function writesMoneyIn(symbol: CurrencySymbol, what: string): Check {
  const amount = (sign: string) => new RegExp(`${sign.replace(/[$]/g, "\\$")}\\s?\\d`, "g")
  return {
    kind: "grounding",
    label: `Writes amounts in ${what} (${symbol})`,
    run: ({ reply }) => {
      const others = CURRENCY_SYMBOLS.filter((other) => other !== symbol).flatMap((other) => reply.match(amount(other)) ?? [])
      if (others.length > 0) return { pass: false, detail: `Also writes ${[...new Set(others)].join(", ")}…` }
      const own = reply.match(amount(symbol))?.length ?? 0
      return own > 0 ? { pass: true, detail: `${own} amounts in ${symbol}.` } : { pass: false, detail: `No amount in ${symbol}.` }
    },
  }
}

/** The reply never matches this pattern, for things it shouldn't bring up (US account types for someone in the UK). */
export function doesNotMention(pattern: RegExp, what: string): Check {
  return {
    label: `Doesn't mention ${what}`,
    run: ({ reply }) => {
      const found = reply.match(pattern)
      return found ? { pass: false, detail: `Mentions ${JSON.stringify(found[0])}.` } : { pass: true, detail: "Not mentioned." }
    },
  }
}

/**
 * None of the reply's questions (the sentences ending in "?") matches this pattern, for details
 * the person already saved: asking them again is what the About the user summary is there to stop.
 */
export function doesNotAskAbout(pattern: RegExp, what: string): Check {
  // Without the g flag, so test() keeps no position between questions.
  const topic = new RegExp(pattern.source, pattern.flags.replace("g", ""))
  return {
    label: `Doesn't ask for ${what}`,
    run: ({ reply }) => {
      const questions = reply.match(/[^.!?\n]*\?/g) ?? []
      const asked = questions.find((question) => topic.test(question))
      return asked ? { pass: false, detail: `Asked: ${JSON.stringify(asked.trim())}` } : { pass: true, detail: `${questions.length} questions, none about it.` }
    },
  }
}

/**
 * The reply links at least one lesson the user hasn't finished, so it points them onward. Links
 * back to a finished lesson ("you covered this in ...") are fine alongside it.
 */
export function linksAnUnfinishedLesson(finished: readonly string[]): Check {
  return {
    label: "Links a lesson the user hasn't finished",
    run: ({ reply }) => {
      const linked = [...new Set([...reply.matchAll(/(?<![\w.~%-])\/learn\/([a-z0-9-]+)/g)].map((match) => match[1]))]
      if (linked.length === 0) return { pass: false, detail: "No lesson links." }
      const onward = linked.filter((slug) => !finished.includes(slug))
      return onward.length > 0
        ? { pass: true, detail: `Linked: ${linked.join(", ")}` }
        : { pass: false, detail: `Links only finished lessons: ${linked.join(", ")}` }
    },
  }
}

/**
 * The reply brings up `first` before anything matching `later`, for answers whose order matters:
 * a plan still on paying off a high-interest card should lead with the card, not a stock split.
 * Passes when `first` appears and `later` doesn't appear at all.
 */
export function mentionsBefore(first: RegExp, later: RegExp, what: string): Check {
  const find = (pattern: RegExp, text: string) => text.search(new RegExp(pattern.source, pattern.flags.replace("g", "")))
  return {
    label: `Leads with ${what}`,
    run: ({ reply }) => {
      const at = find(first, reply)
      if (at < 0) return { pass: false, detail: `Nothing matching ${first}.` }
      const laterAt = find(later, reply)
      if (laterAt >= 0 && laterAt < at) {
        return { pass: false, detail: `${JSON.stringify(reply.slice(laterAt, laterAt + 40))} comes first.` }
      }
      return { pass: true, detail: laterAt < 0 ? "Found; the later topic never comes up." : "Found, before the later topic." }
    },
  }
}

/**
 * A stock split or range written out: "60-80% in stocks", "70% to 90%", "75% stocks", "an 80/20 mix".
 * Interest rates such as "23.99%" or "24% a year" don't match.
 */
export const STOCK_SPLIT =
  /(?<![\d.])\d{2}\s*%?\s*(?:-|–|—|to)\s*\d{2,3}\s*%|(?<![\d.])\d{2,3}\s*%\s*(?:in\s+|of\s+(?:it|your\s+\w+)\s+in\s+)?(?:stocks|shares|equities)|(?<![\d.])\d{2}\s*\/\s*\d{2}\s+(?:split|mix|portfolio|allocation)/i
