import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { percent, renderMarkdown, summarize, type RunInfo } from "./score.ts"
import type { CaseResult, CheckResult } from "./types.ts"

const check = (pass: boolean, source: CheckResult["source"], label = "A check"): CheckResult => ({
  label,
  pass,
  detail: pass ? "Fine." : "Reason it failed.",
  source,
})

function result(overrides: Partial<CaseResult>): CaseResult {
  const checks = overrides.checks ?? [check(true, "code"), check(true, "grader")]
  return {
    id: "a-case",
    category: "accuracy",
    purpose: "What it protects.",
    run: 1,
    pass: checks.every((item) => item.pass),
    checks,
    reply: "A reply.",
    toolCalls: [],
    durationMs: 1000,
    tokens: { input: 100, output: 20 },
    ...overrides,
  }
}

const info: RunInfo = { date: "2026-10-11", model: "model-a", graderModel: "model-b", runsPerCase: 1, durationSeconds: 61.4 }

describe("summarize", () => {
  const results = [
    result({ id: "one" }),
    result({ id: "two", category: "safety", checks: [check(true, "code"), check(false, "grader", "Declines the pick")] }),
    result({ id: "three", category: "safety" }),
    result({ id: "four", category: "coaching", checks: [check(false, "code")], error: "The grader failed: timeout" }),
  ]
  const summary = summarize(results)

  it("counts answers and the overall pass rate", () => {
    assert.deepEqual(summary.answers, { total: 4, passed: 2 })
    assert.equal(summary.passRate, 0.5)
    assert.equal(summary.errors, 1)
  })

  it("groups by category in a fixed order and skips empty ones", () => {
    assert.deepEqual(
      summary.byCategory.map((row) => [row.category, row.passed, row.total, row.passRate]),
      [
        ["accuracy", 1, 1, 1],
        ["safety", 1, 2, 0.5],
        ["coaching", 0, 1, 0],
      ]
    )
  })

  it("tallies code and grader checks separately, and tokens", () => {
    assert.deepEqual(summary.checks, { code: { total: 4, passed: 3 }, grader: { total: 3, passed: 2 } })
    assert.deepEqual(summary.tokens, { input: 400, output: 80 })
  })

  it("rolls repeated runs up into one row per case", () => {
    const repeated = summarize([
      result({ id: "one", run: 1 }),
      result({ id: "one", run: 2, checks: [check(false, "grader")] }),
      result({ id: "one", run: 3 }),
    ])
    assert.deepEqual(repeated.cases.map((row) => [row.id, row.passed, row.total]), [["one", 2, 3]])
    assert.equal(repeated.answers.total, 3)
  })

  it("handles an empty run", () => {
    const empty = summarize([])
    assert.equal(empty.passRate, 0)
    assert.deepEqual(empty.byCategory, [])
  })
})

describe("renderMarkdown", () => {
  it("leads with the headline numbers and lists every case", () => {
    const results = [result({ id: "one" }), result({ id: "two", category: "safety", purpose: "Declines a pick | holds firm" })]
    const report = renderMarkdown(summarize(results), results, info)
    assert.match(report, /^# Eval results/)
    assert.match(report, /Run on 2026-10-11 against `model-a`, graded by `model-b`\. 2 cases, 61 seconds\./)
    assert.match(report, /\*\*2 of 2 cases passed \(100%\)\.\*\*/)
    assert.match(report, /\| Accuracy \| 1 of 1 \| 100% \|/)
    assert.match(report, /\| `two` \| Safety \| pass \| Declines a pick \\\| holds firm \|/)
    assert.match(report, /## Failures\n\nNone\./)
  })

  it("shows each failure with its failed checks, tools and the reply", () => {
    const failing = result({
      id: "stock-pick",
      category: "safety",
      checks: [check(true, "code"), check(false, "grader", "Does not tell the user to buy")],
      reply: "Yes, buy it.\nRight now.",
      toolCalls: [{ name: "get_stock_quote", input: {}, result: "down", isError: true }],
    })
    const report = renderMarkdown(summarize([failing]), [failing], info)
    assert.match(report, /\*\*0 of 1 cases passed \(0%\)\.\*\*/)
    assert.match(report, /\| `stock-pick` \| Safety \| FAIL \|/)
    assert.match(report, /### `stock-pick`/)
    assert.match(report, /- \*\*Does not tell the user to buy\*\* \(grader check\): Reason it failed\./)
    assert.match(report, /Tools called: `get_stock_quote` \(failed\)/)
    assert.match(report, /> Yes, buy it\.\n> Right now\./)
    assert.doesNotMatch(report, /A check/)
  })

  it("flags answers that didn't complete, and reports repeated runs as counts", () => {
    const results = [
      result({ id: "one", run: 1 }),
      result({ id: "one", run: 2, checks: [check(false, "grader")], error: "The grader failed: overloaded" }),
    ]
    const report = renderMarkdown(summarize(results), results, { ...info, runsPerCase: 2 })
    assert.match(report, /1 cases, 2 runs each/)
    assert.match(report, /\*\*1 of 2 answers passed \(50%\)\.\*\*/)
    assert.match(report, /1 of those didn't pass because the agent or the grader failed to respond/)
    assert.match(report, /\| `one` \| Accuracy \| 1 of 2 \|/)
    assert.match(report, /### `one` \(run 2\)\n\nDidn't complete: The grader failed: overloaded/)
  })

  it("shortens very long replies", () => {
    const failing = result({ checks: [check(false, "code")], reply: "x".repeat(5000) })
    const report = renderMarkdown(summarize([failing]), [failing], info)
    assert.match(report, /… \[shortened\]/)
    assert.ok(report.length < 3500)
  })
})

describe("percent", () => {
  it("rounds to a whole percentage", () => {
    assert.equal(percent(0.935), "94%")
    assert.equal(percent(1), "100%")
  })
})
