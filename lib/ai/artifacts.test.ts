import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { artifactBlock, compactArtifacts, executeTable, parseArtifact, toCsv } from "./artifacts.ts"
import { EXAMPLE_GRAPH, executeGraph, MAX_GRAPH_POINTS } from "./graphs/executor.ts"

const NOW = new Date("2026-10-02T12:00:00Z")

describe("executeGraph", () => {
  it("accepts the example chart and fills defaults", () => {
    const result = executeGraph(EXAMPLE_GRAPH, NOW)
    assert.ok(result.ok)
    assert.equal(result.graph.type, "line")
    assert.deepEqual(result.graph.series, [{ key: "revenue", label: "Revenue" }])
    assert.equal(result.graph.metadata?.createdAt, NOW.toISOString())
    assert.equal(result.graph.metadata?.generatedBy, "assistant")
  })

  it("accepts snake_case axes and a source from the model", () => {
    const result = executeGraph(
      { type: "bar", x_axis: { key: "category" }, series: [{ key: "amount" }], data: [{ category: "Rent", amount: 1400 }], source: "Your CSV" },
      NOW
    )
    assert.ok(result.ok)
    assert.equal(result.graph.xAxis?.key, "category")
    assert.equal(result.graph.metadata?.source, "Your CSV")
  })

  it("explains what's wrong with bad input", () => {
    const cases: [unknown, RegExp][] = [
      [{ type: "radar", xAxis: { key: "x" }, series: [{ key: "y" }], data: [{ x: 1, y: 1 }] }, /type must be/],
      [{ type: "bar", series: [{ key: "y" }], data: [{ x: 1, y: 1 }] }, /xAxis\.key/],
      [{ type: "bar", xAxis: { key: "x" }, series: [], data: [{ x: 1 }] }, /series/],
      [{ type: "bar", xAxis: { key: "x" }, series: [{ key: "y" }], data: [{ x: "a", y: "12" }] }, /must be a number/],
      [{ type: "pie", xAxis: { key: "x" }, series: [{ key: "y" }, { key: "z" }], data: [{ x: "a", y: 1, z: 2 }] }, /exactly one series/],
      [{ type: "pie", xAxis: { key: "x" }, series: [{ key: "y" }], data: [{ x: "a", y: -1 }] }, /negative/],
      [{ type: "line", xAxis: { key: "x" }, series: [{ key: "y" }], data: Array.from({ length: MAX_GRAPH_POINTS + 1 }, (_, x) => ({ x, y: x })) }, /at most/],
      [{ type: "bar", xAxis: { key: "$where" }, series: [{ key: "y" }], data: [{ y: 1 }] }, /xAxis\.key/],
    ]
    for (const [input, message] of cases) {
      const result = executeGraph(input, NOW)
      assert.equal(result.ok, false)
      if (!result.ok) assert.match(result.error, message)
    }
  })
})

describe("executeTable", () => {
  it("validates columns and rows", () => {
    const result = executeTable({
      title: "Fees",
      columns: [{ key: "fund", label: "Fund" }, { key: "fee", label: "Fee", format: "percent" }],
      rows: [{ fund: "Index", fee: 0.0005 }, { fund: "Active", fee: 0.01, extra: "ignored" }],
    })
    assert.ok(result.ok)
    assert.deepEqual(result.table.rows[1], { fund: "Active", fee: 0.01 })
    assert.equal(result.table.columns[0].format, "text")
  })

  it("rejects text in a numeric column", () => {
    const result = executeTable({ columns: [{ key: "fee", format: "money" }], rows: [{ fee: "$5" }] })
    assert.equal(result.ok, false)
  })
})

describe("artifact blocks", () => {
  it("round-trips through reply text and compacts for the model", () => {
    const chart = executeGraph(EXAMPLE_GRAPH, NOW)
    assert.ok(chart.ok)
    const reply = `Here you go.${artifactBlock("chart", chart.graph)}Notice the trend.`
    const match = reply.match(/```chart\n([\s\S]*?)\n```/)
    assert.ok(match)
    const parsed = parseArtifact("chart", match[1])
    assert.equal(parsed?.kind, "chart")
    assert.equal(compactArtifacts(reply).replace(/\s+/g, " "), "Here you go. [Chart shown to the user: Revenue Over Time] Notice the trend.")
    assert.equal(parseArtifact("chart", "{not json"), null)
    assert.equal(parseArtifact("video", "{}"), null)
  })
})

describe("toCsv", () => {
  it("quotes and neutralizes risky cells", () => {
    assert.equal(
      toCsv(["Name", "Amount"], [["Rent, June", -1400], ["=HYPERLINK()", null], ['Say "hi"', 3]]),
      'Name,Amount\r\n"Rent, June",-1400\r\n\'=HYPERLINK(),\r\n"Say ""hi""",3\r\n'
    )
  })
})
