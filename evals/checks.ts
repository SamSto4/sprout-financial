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
      const linked = [...reply.matchAll(/\/learn\/([a-z0-9-]+)/g)].map((match) => match[1])
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
