// The working parts of the agent's skills: the chart and table tools the agent can call, the web
// search and page-reading tools Anthropic runs, and the rule for which of them a request gets.
// The prompt text for each skill lives in system-prompt.ts; skill-runtime.ts joins the two.
// Kept free of framework and SDK imports so it can be unit-tested with `node --test`.

import { artifactBlock, executeTable, MAX_TABLE_COLUMNS, MAX_TABLE_ROWS } from "./artifacts.ts"
import { executeGraph, MAX_GRAPH_POINTS, MAX_GRAPH_SERIES, MAX_PIE_SLICES, RENDERED_GRAPH_TYPES } from "./graphs/executor.ts"
import type { SkillMode } from "./skilltypes.ts"

/** Same shape as the SDK's tool definition, without importing the SDK. */
type ToolDefinition = {
  name: string
  description: string
  input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[] }
}

const fieldName = "Letters, numbers, _ or - only, no spaces."

export const CHART_TOOL: ToolDefinition = {
  name: "create_chart",
  description:
    "Show the user an interactive chart inside your reply. Use it when a picture explains numbers better than words: growth over time, comparing scenarios or fees, spending by category or month. Don't chart one or two numbers. Every number must come from a calculator or data tool, the user, or a cited source; never invent data points. The chart appears in the reply at the point where you call this tool.",
  input_schema: {
    type: "object",
    properties: {
      type: {
        type: "string",
        enum: [...RENDERED_GRAPH_TYPES],
        description: `line or area for change over time, bar for comparing categories or scenarios, pie for parts of a whole (one series, ${MAX_PIE_SLICES} slices at most).`,
      },
      title: { type: "string", description: "A short title saying what the chart shows." },
      xAxis: {
        type: "object",
        description: "Which field of each data point is its label along the bottom.",
        properties: {
          key: { type: "string", description: `The field's name, e.g. "year". ${fieldName}` },
          label: { type: "string", description: 'What to call the axis, e.g. "Year".' },
        },
        required: ["key"],
      },
      yAxis: {
        type: "object",
        description: "Optional label for the values.",
        properties: {
          key: { type: "string", description: `Any one of the series keys. ${fieldName}` },
          label: { type: "string", description: 'What the values measure, e.g. "Balance ($)".' },
        },
        required: ["key"],
      },
      series: {
        type: "array",
        description: `The numeric fields to plot, ${MAX_GRAPH_SERIES} at most.`,
        items: {
          type: "object",
          properties: {
            key: { type: "string", description: `The field's name in each data point, e.g. "balance". ${fieldName}` },
            label: { type: "string", description: 'The name shown in the legend, e.g. "With a 1% fee".' },
          },
          required: ["key"],
        },
      },
      data: {
        type: "array",
        description: `The points, ${MAX_GRAPH_POINTS} at most. Each is an object holding the xAxis field and a number for every series field, e.g. {"year": 5, "balance": 21478.5}.`,
        items: { type: "object" },
      },
      source: { type: "string", description: 'Where the numbers came from, e.g. "Compound growth calculator, assuming 7% a year".' },
    },
    required: ["type", "title", "xAxis", "series", "data"],
  },
}

export const TABLE_TOOL: ToolDefinition = {
  name: "create_table",
  description:
    "Show the user a table they can sort and download, inside your reply. Use it for comparisons with several rows: fund fees, a year-by-year projection, a budget breakdown. Keep small 2 to 4 row comparisons as a Markdown table instead. Every number must come from a calculator or data tool, the user, or a cited source.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "A short title saying what the table shows." },
      columns: {
        type: "array",
        description: `The columns, left to right, ${MAX_TABLE_COLUMNS} at most.`,
        items: {
          type: "object",
          properties: {
            key: { type: "string", description: `The field's name in each row, e.g. "balance".` },
            label: { type: "string", description: 'The column heading, e.g. "Balance".' },
            format: {
              type: "string",
              enum: ["money", "percent", "number", "text"],
              description: "How to show the values. percent takes a fraction: 0.05 for 5%. Defaults to text.",
            },
          },
          required: ["key", "label"],
        },
      },
      rows: {
        type: "array",
        description: `The rows, ${MAX_TABLE_ROWS} at most. Each is an object with a value for every column key; money, percent and number columns need numbers, not text.`,
        items: { type: "object" },
      },
      source: { type: "string", description: "Where the numbers came from." },
    },
    required: ["columns", "rows"],
  },
}

/** What a skill tool hands back: text for the model, and for a chart or table the block to show the user. */
export type SkillOutcome = { content: string; artifact?: string; isError?: boolean }

/**
 * Runs a chart or table tool. Returns undefined for any other tool so the caller can try the
 * regular tools. The model's input is validated first; errors are written for it to fix and retry.
 */
export function runSkillTool(name: string, input: unknown, now?: Date): SkillOutcome | undefined {
  if (name === CHART_TOOL.name) {
    const result = executeGraph(input, now)
    if (!result.ok) return { content: `The chart was not shown. ${result.error} Fix the input and call create_chart again.`, isError: true }
    return {
      content: `The chart is now showing in your reply (${result.graph.data.length} points). Don't repeat its numbers as a list or table; point out the one or two things worth noticing.`,
      artifact: artifactBlock("chart", result.graph),
    }
  }
  if (name === TABLE_TOOL.name) {
    const result = executeTable(input)
    if (!result.ok) return { content: `The table was not shown. ${result.error} Fix the input and call create_table again.`, isError: true }
    return {
      content: `The table is now showing in your reply (${result.table.rows.length} rows). Don't repeat it as Markdown; say what it shows.`,
      artifact: artifactBlock("table", result.table),
    }
  }
  return undefined
}

/** The short progress note shown while a skill tool runs, e.g. "Searching the web: UK ISA allowance". */
export function skillStatus(name: string, input: Record<string, unknown>): string | undefined {
  switch (name) {
    case "web_search": {
      const query = typeof input.query === "string" ? input.query.replace(/\s+/g, " ").trim() : ""
      return query ? `Searching the web: ${query.slice(0, 80)}` : "Searching the web"
    }
    case "web_fetch": {
      let site = ""
      try {
        site = typeof input.url === "string" ? new URL(input.url).hostname.replace(/^www\./, "") : ""
      } catch {
        // Not a readable address: fall back to the generic note.
      }
      return site ? `Reading ${site}` : "Reading a source"
    }
    case CHART_TOOL.name:
      return "Drawing a chart"
    case TABLE_TOOL.name:
      return "Building a table"
    default:
      return undefined
  }
}

// Web search and page reading run on Anthropic's servers and are billed per search, so each
// answer gets a fixed allowance. "direct" asks for plain tool calls with citations, which every
// current model supports.
type WebSearchTool = { type: "web_search_20260209"; name: "web_search"; max_uses: number; allowed_callers: "direct"[] }
type WebFetchTool = {
  type: "web_fetch_20260209"
  name: "web_fetch"
  max_uses: number
  max_content_tokens: number
  citations: { enabled: true }
  allowed_callers: "direct"[]
}

export const WEB_SEARCH_USES: Record<SkillMode, number> = { standard: 3, "deep-research": 10 }
export const WEB_FETCH_USES = 6
const WEB_FETCH_MAX_TOKENS = 20_000

function webSearchTool(mode: SkillMode): WebSearchTool {
  return { type: "web_search_20260209", name: "web_search", max_uses: WEB_SEARCH_USES[mode], allowed_callers: ["direct"] }
}

const WEB_FETCH_TOOL: WebFetchTool = {
  type: "web_fetch_20260209",
  name: "web_fetch",
  max_uses: WEB_FETCH_USES,
  max_content_tokens: WEB_FETCH_MAX_TOKENS,
  citations: { enabled: true },
  allowed_callers: ["direct"],
}

/** WEB_SEARCH=off turns web search and deep research off everywhere (they are billed per search). */
export function isWebSearchEnabled(setting: string | undefined = process.env.WEB_SEARCH) {
  return setting?.trim().toLowerCase() !== "off"
}

export type SkillId = "charts" | "tables" | "web-search" | "deep-research"

export type SkillSet = {
  /** The active skills, in the order their guidance is added to the prompt. */
  skills: SkillId[]
  tools: (ToolDefinition | WebSearchTool | WebFetchTool)[]
  effort: "medium" | "high"
  maxToolRounds: number
}

// Rounds in which the agent may call tools before it has to answer. Four covers a lookup, a
// calculation and a chart with room to spare; most answers use one or two.
export const STANDARD_TOOL_ROUNDS = 4
export const DEEP_RESEARCH_TOOL_ROUNDS = 10

/**
 * How long an answer may spend on tool rounds before it has to answer. The chat route runs for at
 * most 300 seconds (maxDuration in app/api/chat/route.ts), and a final round of deep research can
 * write 16,000 tokens, so it gets the last two minutes. Only deep research comes near this.
 */
export const TOOL_TIME_BUDGET_MS = 180_000

/**
 * Whether this round has to be the answer: the round allowance is used up, or the answer has
 * already taken TOOL_TIME_BUDGET_MS. The agent loop then keeps the tools listed but switches them off.
 */
export function isFinalRound(round: number, maxToolRounds: number, elapsedMs: number, budgetMs = TOOL_TIME_BUDGET_MS): boolean {
  return round >= maxToolRounds || elapsedMs >= budgetMs
}

/**
 * Decides which skills one request gets. Charts and tables are always available. Web search needs
 * to be switched on; deep research is web search with a bigger allowance, page reading, more
 * rounds and higher effort, and falls back to a normal answer when search is off.
 */
export function resolveSkillSet(options: { mode: SkillMode; webSearch: boolean; isOn?: (skill: SkillId) => boolean }): SkillSet {
  const isOn = options.isOn ?? (() => true)
  const skills: SkillId[] = []
  const tools: SkillSet["tools"] = []

  if (isOn("charts")) {
    skills.push("charts")
    tools.push(CHART_TOOL)
  }
  if (isOn("tables")) {
    skills.push("tables")
    tools.push(TABLE_TOOL)
  }

  const searching = options.webSearch && isOn("web-search")
  const researching = searching && options.mode === "deep-research" && isOn("deep-research")
  if (searching) {
    skills.push("web-search")
    tools.push(webSearchTool(researching ? "deep-research" : "standard"))
  }
  if (researching) {
    skills.push("deep-research")
    tools.push(WEB_FETCH_TOOL)
  }

  return {
    skills,
    tools,
    effort: researching ? "high" : "medium",
    maxToolRounds: researching ? DEEP_RESEARCH_TOOL_ROUNDS : STANDARD_TOOL_ROUNDS,
  }
}

/** True for the tools Anthropic runs (web search, page reading), as opposed to ones this app runs. */
export function isServerTool(tool: { name: string }) {
  return tool.name === "web_search" || tool.name === "web_fetch"
}
