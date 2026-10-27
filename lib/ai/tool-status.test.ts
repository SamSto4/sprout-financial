import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import { toolStatus } from "./tool-status.ts"

describe("toolStatus", () => {
  it("describes the app's tools in plain words", () => {
    assert.equal(toolStatus("compound_growth"), "Running the numbers")
    assert.equal(toolStatus("get_finance_summary"), "Reading your transactions")
    assert.equal(toolStatus("get_my_plan"), "Reading your plan")
  })
  it("has nothing for unknown names, including Object's own keys", () => {
    assert.equal(toolStatus("web_search"), undefined)
    assert.equal(toolStatus("constructor"), undefined)
    assert.equal(toolStatus("toString"), undefined)
  })

  it("covers every tool the agent's own code defines", () => {
    const names = ["tools.ts", "calculators.ts", "plan-tools.ts"].flatMap((file) =>
      [...readFileSync(new URL(file, import.meta.url), "utf8").matchAll(/^\s+name: "([a-z_]+)",$/gm)].map((match) => match[1])
    )
    assert.ok(names.length >= 17, "the tool definitions were not found")
    for (const name of names) assert.ok(toolStatus(name), `no progress note for ${name}`)
  })
})
