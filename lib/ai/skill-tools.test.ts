import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { parseArtifact } from "./artifacts.ts"
import {
  CHART_TOOL,
  DEEP_RESEARCH_TOOL_ROUNDS,
  isFinalRound,
  isServerTool,
  isWebSearchEnabled,
  resolveSkillSet,
  runSkillTool,
  skillStatus,
  STANDARD_TOOL_ROUNDS,
  TABLE_TOOL,
  TOOL_TIME_BUDGET_MS,
  WEB_FETCH_USES,
  WEB_SEARCH_USES,
} from "./skill-tools.ts"

const NOW = new Date("2026-10-11T12:00:00Z")

const growthChart = {
  type: "line",
  title: "Saving $300 a month at 7%",
  xAxis: { key: "year", label: "Year" },
  series: [{ key: "balance", label: "Balance" }],
  data: [
    { year: 10, balance: 51925.42 },
    { year: 20, balance: 156278.0 },
    { year: 30, balance: 365991.3 },
  ],
  source: "Compound growth calculator, assuming 7% a year",
}

/** Pulls the kind and JSON back out of an artifact block, the way the chat does. */
function readBlock(artifact: string | undefined) {
  const match = artifact?.match(/```(chart|table)\n([\s\S]*?)\n```/)
  assert.ok(match, "expected an artifact block")
  return parseArtifact(match[1], match[2])
}

describe("create_chart", () => {
  it("returns a block the chat can render, and tells the model not to repeat the data", () => {
    const outcome = runSkillTool("create_chart", growthChart, NOW)
    assert.ok(outcome && !outcome.isError)
    assert.match(outcome.content, /now showing in your reply \(3 points\)/)
    assert.match(outcome.content, /Don't repeat its numbers/)

    const artifact = readBlock(outcome.artifact)
    assert.ok(artifact && artifact.kind === "chart")
    assert.equal(artifact.graph.title, growthChart.title)
    assert.deepEqual(artifact.graph.data[2], { year: 30, balance: 365991.3 })
    assert.equal(artifact.graph.metadata?.source, growthChart.source)
  })

  it("explains bad input to the model and shows nothing", () => {
    const outcome = runSkillTool("create_chart", { ...growthChart, type: "radar" }, NOW)
    assert.ok(outcome)
    assert.equal(outcome.isError, true)
    assert.equal(outcome.artifact, undefined)
    assert.match(outcome.content, /The chart was not shown\. type must be one of: bar, line, area, pie\./)
    assert.match(outcome.content, /call create_chart again/)
  })

  it("rejects text where a number belongs, so nothing unplottable reaches the page", () => {
    const outcome = runSkillTool("create_chart", { ...growthChart, data: [{ year: 10, balance: "about 52k" }] }, NOW)
    assert.equal(outcome?.isError, true)
    assert.match(outcome?.content ?? "", /data\[0\]\.balance must be a number/)
  })

  it("offers only the chart types the chat can draw", () => {
    const type = CHART_TOOL.input_schema.properties.type as { enum: string[] }
    assert.deepEqual(type.enum, ["bar", "line", "area", "pie"])
    assert.deepEqual(CHART_TOOL.input_schema.required, ["type", "title", "xAxis", "series", "data"])
  })
})

describe("create_table", () => {
  const table = {
    title: "Year by year",
    columns: [
      { key: "year", label: "Year", format: "number" },
      { key: "balance", label: "Balance", format: "money" },
    ],
    rows: [
      { year: 1, balance: 2467.11 },
      { year: 2, balance: 5086.39 },
    ],
  }

  it("returns a block the chat can render", () => {
    const outcome = runSkillTool("create_table", table)
    assert.ok(outcome && !outcome.isError)
    assert.match(outcome.content, /now showing in your reply \(2 rows\)/)
    const artifact = readBlock(outcome.artifact)
    assert.ok(artifact && artifact.kind === "table")
    assert.deepEqual(artifact.table.rows[1], { year: 2, balance: 5086.39 })
  })

  it("explains bad input to the model", () => {
    const outcome = runSkillTool("create_table", { ...table, rows: [{ year: 1, balance: "$2,467" }] })
    assert.equal(outcome?.isError, true)
    assert.match(outcome?.content ?? "", /The table was not shown\. rows\[0\]\.balance must be a number/)
  })

  it("requires columns and rows", () => {
    assert.deepEqual(TABLE_TOOL.input_schema.required, ["columns", "rows"])
  })
})

describe("runSkillTool", () => {
  it("leaves every other tool to the regular tool runner", () => {
    assert.equal(runSkillTool("compound_growth", {}), undefined)
    assert.equal(runSkillTool("web_search", { query: "ISA allowance" }), undefined)
  })
})

describe("skillStatus", () => {
  it("describes searches and page reads without leaking long input", () => {
    assert.equal(skillStatus("web_search", { query: "  UK  ISA allowance\n2026 " }), "Searching the web: UK ISA allowance 2026")
    assert.equal(skillStatus("web_search", {}), "Searching the web")
    assert.equal(skillStatus("web_search", { query: "x".repeat(300) })?.length, "Searching the web: ".length + 80)
    assert.equal(skillStatus("web_fetch", { url: "https://www.investor.gov/introduction-investing" }), "Reading investor.gov")
    assert.equal(skillStatus("web_fetch", { url: "not a url" }), "Reading a source")
  })

  it("names chart and table work, and stays quiet for everything else", () => {
    assert.equal(skillStatus("create_chart", {}), "Drawing a chart")
    assert.equal(skillStatus("create_table", {}), "Building a table")
    assert.equal(skillStatus("compound_growth", {}), undefined)
  })
})

describe("resolveSkillSet", () => {
  const names = (set: ReturnType<typeof resolveSkillSet>) => set.tools.map((tool) => tool.name)

  it("gives a standard answer charts, tables and a small search allowance", () => {
    const set = resolveSkillSet({ mode: "standard", webSearch: true })
    assert.deepEqual(set.skills, ["charts", "tables", "web-search"])
    assert.deepEqual(names(set), ["create_chart", "create_table", "web_search"])
    assert.deepEqual(set.tools[2], {
      type: "web_search_20260209",
      name: "web_search",
      max_uses: WEB_SEARCH_USES.standard,
      allowed_callers: ["direct"],
    })
    assert.equal(set.effort, "medium")
    assert.equal(set.maxToolRounds, STANDARD_TOOL_ROUNDS)
  })

  it("gives deep research more searches, page reading, more rounds and higher effort", () => {
    const set = resolveSkillSet({ mode: "deep-research", webSearch: true })
    assert.deepEqual(set.skills, ["charts", "tables", "web-search", "deep-research"])
    assert.deepEqual(names(set), ["create_chart", "create_table", "web_search", "web_fetch"])
    const search = set.tools[2] as { max_uses: number }
    const fetch = set.tools[3] as { max_uses: number; type: string }
    assert.equal(search.max_uses, WEB_SEARCH_USES["deep-research"])
    assert.equal(fetch.max_uses, WEB_FETCH_USES)
    assert.equal(fetch.type, "web_fetch_20260209")
    assert.equal(set.effort, "high")
    assert.equal(set.maxToolRounds, DEEP_RESEARCH_TOOL_ROUNDS)
  })

  it("answers normally when search is off, even if deep research was asked for", () => {
    for (const mode of ["standard", "deep-research"] as const) {
      const set = resolveSkillSet({ mode, webSearch: false })
      assert.deepEqual(names(set), ["create_chart", "create_table"])
      assert.equal(set.effort, "medium")
      assert.equal(set.maxToolRounds, STANDARD_TOOL_ROUNDS)
    }
  })

  it("leaves out skills the registry has switched off", () => {
    const withoutCharts = resolveSkillSet({ mode: "standard", webSearch: true, isOn: (skill) => skill !== "charts" })
    assert.deepEqual(names(withoutCharts), ["create_table", "web_search"])

    const withoutSearch = resolveSkillSet({ mode: "deep-research", webSearch: true, isOn: (skill) => skill !== "web-search" })
    assert.deepEqual(names(withoutSearch), ["create_chart", "create_table"])

    const withoutResearch = resolveSkillSet({ mode: "deep-research", webSearch: true, isOn: (skill) => skill !== "deep-research" })
    assert.deepEqual(names(withoutResearch), ["create_chart", "create_table", "web_search"])
    assert.equal((withoutResearch.tools[2] as { max_uses: number }).max_uses, WEB_SEARCH_USES.standard)
  })
})

describe("isWebSearchEnabled and isServerTool", () => {
  it("is on unless WEB_SEARCH is set to off", () => {
    assert.equal(isWebSearchEnabled(undefined), true)
    assert.equal(isWebSearchEnabled(""), true)
    assert.equal(isWebSearchEnabled("on"), true)
    assert.equal(isWebSearchEnabled("off"), false)
    assert.equal(isWebSearchEnabled(" OFF "), false)
  })

  it("tells Anthropic-run tools from the app's own", () => {
    assert.equal(isServerTool({ name: "web_search" }), true)
    assert.equal(isServerTool({ name: "web_fetch" }), true)
    assert.equal(isServerTool({ name: "create_chart" }), false)
  })
})

describe("isFinalRound", () => {
  it("makes the round after the allowance the answer", () => {
    assert.equal(isFinalRound(0, STANDARD_TOOL_ROUNDS, 0), false)
    assert.equal(isFinalRound(STANDARD_TOOL_ROUNDS - 1, STANDARD_TOOL_ROUNDS, 0), false)
    assert.equal(isFinalRound(STANDARD_TOOL_ROUNDS, STANDARD_TOOL_ROUNDS, 0), true)
  })

  it("answers early once the time budget is used, whatever the round", () => {
    assert.equal(isFinalRound(2, DEEP_RESEARCH_TOOL_ROUNDS, TOOL_TIME_BUDGET_MS - 1), false)
    assert.equal(isFinalRound(2, DEEP_RESEARCH_TOOL_ROUNDS, TOOL_TIME_BUDGET_MS), true)
    assert.equal(isFinalRound(1, DEEP_RESEARCH_TOOL_ROUNDS, 5_000, 4_000), true)
  })

  it("leaves the final round time to write a long answer before the route's 300-second limit", () => {
    assert.ok(TOOL_TIME_BUDGET_MS <= 300_000 - 90_000)
  })
})
