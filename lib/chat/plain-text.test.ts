import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { artifactBlock } from "../ai/artifacts.ts"
import { copyText, spokenText } from "./plain-text.ts"

const chart = artifactBlock("chart", { type: "line", title: "Growth", xAxis: { key: "year" }, data: [{ year: 1, balance: 10 }], series: [{ key: "balance" }] })
const table = artifactBlock("table", { columns: [{ key: "a", label: "A", format: "text" }], rows: [{ a: "x" }] })

describe("copyText", () => {
  it("names charts and tables instead of copying their JSON and keeps the Markdown", () => {
    assert.equal(copyText(`**Hi**${chart}Then${table}`), "**Hi**\n\n[Chart: Growth]\n\nThen\n\n[Table]")
  })
})

describe("spokenText", () => {
  it("drops Markdown symbols", () => {
    const reply = "### How it works\n\n- You put in **$108,000**.\n- The rest is _growth_.\n\n1. Time *helps*.\n\n> Not guaranteed.\n\n---\n\nSee [Starting early](/learn/starting-early) and `7%`."
    assert.equal(spokenText(reply), "How it works. You put in $108,000. The rest is growth. 1. Time helps. Not guaranteed. See Starting early and 7%.")
  })
  it("reads table rows as cells and names artifacts", () => {
    assert.equal(spokenText(`| Rate | After |\n|---|---:|\n| 5% | $249,000 |\n${chart}`), "Rate, After. 5%, $249,000. Chart: Growth.")
  })
  it("leaves arithmetic and snake_case alone", () => {
    assert.equal(spokenText("2 * 3 = 6 and file_name_here"), "2 * 3 = 6 and file_name_here")
  })
  it("cuts long replies at a word", () => {
    const spoken = spokenText("word ".repeat(400), 100)
    assert.ok(spoken.length <= 100)
    assert.ok(spoken.endsWith("word…"))
  })
  it("stays fast on hostile Markdown", () => {
    const started = performance.now()
    const spoken = spokenText("**a ".repeat(10_000) + "\n# " + " #".repeat(10_000))
    assert.ok(spoken.length <= 1500)
    assert.ok(performance.now() - started < 1000)
  })
  it("returns an empty string for an empty reply", () => {
    assert.equal(spokenText("  \n "), "")
  })
})

describe("spokenText rules", () => {
  it("drops spaced horizontal rules", () => {
    assert.equal(spokenText("One\n\n* * *\n\n- - -\n\nTwo"), "One Two")
  })
})
