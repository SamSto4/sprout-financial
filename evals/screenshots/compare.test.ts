import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { compareRuns, type RunInfo, type SavedRun } from "./compare.ts"
import { emptyRows, summarize, type CaseResult } from "./score.ts"

const result = (id: string, run: number, exact: number, overrides: Partial<CaseResult> = {}): CaseResult => ({
  id,
  kind: "transactions",
  purpose: `Checks ${id}.`,
  run,
  pass: exact === 10,
  checks: [],
  rows: { ...emptyRows(10), exact, missed: 10 - exact },
  ms: 2000,
  costUsd: 0.001,
  ...overrides,
})

const info = (overrides: Partial<RunInfo> = {}): RunInfo => ({
  date: "2026-10-27",
  model: "claude-haiku-5-5",
  effort: "low",
  runs: 2,
  cases: {
    a: { image: "a.jpg", imageSha256: "1111", expectSha256: "aaaa" },
    b: { image: "b.jpg", imageSha256: "2222", expectSha256: "bbbb" },
  },
  ...overrides,
})

const saved = (results: CaseResult[], runInfo: RunInfo | null = info()): SavedRun => ({ ...(runInfo ? { info: runInfo } : {}), summary: summarize(results), results })

const base = saved([result("a", 1, 10), result("a", 2, 8), result("b", 1, 10), result("b", 2, 10)])
const names = { base: "bench", candidate: "change" }

describe("compareRuns", () => {
  it("shows what changed, overall, by error type and by case", () => {
    const candidate = saved([result("a", 1, 10), result("a", 2, 10), result("b", 1, 9), result("b", 2, 10)], info({ model: "claude-sonnet-5-5" }))
    const { problems, notes, markdown } = compareRuns(base, candidate, names)
    assert.deepEqual(problems, [])
    assert.deepEqual(notes, ["Different models: `claude-haiku-5-5` and `claude-sonnet-5-5`."])
    assert.match(markdown, /\| Reads that passed every check \| 3 of 4 \| 3 of 4 \|/)
    assert.match(markdown, /\| Rows read exactly right \| 95% \(38 of 40\) \| 98% \(39 of 40\) \|/)
    assert.match(markdown, /\| Row missed \| 2 \| 1 \| -1 \|/)
    assert.match(markdown, /\| `a` \| 1 → 2 of 2 \| 18 → 20 of 20 \| \+2 \|/)
    assert.match(markdown, /\| `b` \| 2 → 1 of 2 \| 20 → 19 of 20 \| -1 \|/)
  })

  it("refuses runs with other cases, run counts or answer keys", () => {
    const fewer = saved([result("a", 1, 10), result("a", 2, 10)])
    assert.match(compareRuns(base, fewer, names).problems.join(" "), /doesn't have `b`/)

    const oneRun = saved([result("a", 1, 10), result("b", 1, 10)])
    assert.match(compareRuns(base, oneRun, names).problems.join(" "), /ran 2 times in `bench` and 1 in `change`/)

    const newKey = saved(base.results, info({ cases: { ...info().cases, b: { image: "b.jpg", imageSha256: "2222", expectSha256: "cccc" } } }))
    const comparison = compareRuns(base, newKey, names)
    assert.match(comparison.problems.join(" "), /`b`'s answer key changed/)
    assert.match(comparison.markdown, /can't be compared fairly/)

    assert.match(compareRuns(saved(base.results, null), base, names).problems.join(" "), /older run\.mts/)
  })

  it("counts the holdings reads the review warned don't add up, and n/a for runs saved before the warning", () => {
    const warned = saved([
      result("a", 1, 10, { kind: "holdings", totalWarning: true }),
      result("a", 2, 8, { kind: "holdings", totalWarning: true }),
      result("b", 1, 10, { kind: "holdings", totalWarning: false }),
      result("b", 2, 9, { kind: "holdings", totalWarning: false }),
    ])
    assert.deepEqual(warned.summary.totalWarnings, { reads: 2, wrong: 1, byCase: { a: 2 }, wrongUnwarned: 1 })
    const older = { ...base, summary: { ...base.summary, totalWarnings: undefined } }
    const { problems, markdown } = compareRuns(older, warned, names)
    assert.deepEqual(problems, [])
    assert.match(markdown, /\| Holdings reads the review warned don't add up \| n\/a \| 2 \(`a` 2; 1 of them wrong\) \|/)
  })

  it("notes a re-drawn image without refusing", () => {
    const redrawn = saved(base.results, info({ cases: { ...info().cases, a: { image: "a.jpg", imageSha256: "9999", expectSha256: "aaaa" } } }))
    const { problems, notes } = compareRuns(base, redrawn, names)
    assert.deepEqual(problems, [])
    assert.match(notes.join(" "), /`a` read a different image/)
  })
})
