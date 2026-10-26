// Scores what the screenshot import produced against each case's answer key, and writes the
// report. Pure (no SDK, no files), so the arithmetic behind the reported numbers is unit-tested.

import { percentile } from "../score.ts"
import type { CollectedHoldings } from "../../lib/portfolio/csv-import.ts"
import type { ScreenshotProblem } from "../../lib/screenshots/image.ts"
import type { TransactionReview } from "../../lib/screenshots/transaction-rows.ts"
import type { ExpectedHolding, ExpectedTransaction, ScreenshotCase } from "./cases.ts"

export type Check = { label: string; pass: boolean; detail: string }

/** What the import gave for one screenshot, after every rule in lib/screenshots. */
export type Produced =
  | { kind: "transactions"; problem: ScreenshotProblem; review: TransactionReview }
  | { kind: "holdings"; problem: ScreenshotProblem; holdings: CollectedHoldings }

export type Rows = {
  /** Rows the answer key has. */
  expected: number
  /** Of those, found with every field right (date and amount, or value and type). */
  exact: number
  /** Found, but with a field wrong. */
  wrong: number
  /** Rows produced that the answer key doesn't have. */
  invented: number
}

export type CaseResult = {
  id: string
  kind: ScreenshotCase["kind"]
  purpose: string
  run: number
  pass: boolean
  checks: Check[]
  rows: Rows
  ms: number
  costUsd: number
  error?: string
}

const words = (text: string) => text.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9•]+/g, " ").trim()

/** Same description, allowing for spacing, punctuation and case, or one shortened from the other. */
export function sameDescription(a: string, b: string) {
  const x = words(a)
  const y = words(b)
  return x.length > 0 && y.length > 0 && (x.includes(y) || y.includes(x))
}

const cents = (amount: number) => Math.round(amount * 100)

function scoreTransactions(expect: Extract<ScreenshotCase, { kind: "transactions" }>["expect"], produced: Extract<Produced, { kind: "transactions" }>): { checks: Check[]; rows: Rows } {
  const left = [...produced.review.rows]
  const rows: Rows = { expected: expect.transactions.length, exact: 0, wrong: 0, invented: 0 }
  const misses: string[] = []
  const take = (match: (row: (typeof left)[number]) => boolean) => {
    const index = left.findIndex(match)
    return index === -1 ? null : left.splice(index, 1)[0]
  }
  for (const want of expect.transactions as ExpectedTransaction[]) {
    const exact = take((row) => row.date === want.date && cents(row.amount) === cents(want.amount) && sameDescription(row.description, want.description))
    if (exact) {
      rows.exact++
      continue
    }
    const near = take((row) => sameDescription(row.description, want.description))
    if (near) {
      rows.wrong++
      misses.push(`${want.description}: got ${near.date} ${near.amount}, expected ${want.date} ${want.amount}`)
    } else misses.push(`${want.description}: missing`)
  }
  rows.invented = left.length

  const checks: Check[] = [problemCheck(expect.problem, produced.problem, produced.review.rows.length)]
  checks.push({
    label: "Reads every transaction with the right date, amount and sign",
    pass: misses.length === 0,
    detail: misses.length === 0 ? `${rows.exact} of ${rows.expected}.` : misses.slice(0, 4).join("; "),
  })
  checks.push({
    label: "Makes up no transactions",
    pass: rows.invented === 0,
    detail: rows.invented === 0 ? "None." : left.slice(0, 4).map((row) => `${row.date} ${row.description} ${row.amount}`).join("; "),
  })
  for (const secret of expect.never ?? []) {
    const leaked = produced.review.rows.find((row) => row.description.replace(/\D/g, "").includes(secret))
    checks.push({ label: `Keeps no full number ending ${secret.slice(-4)}`, pass: !leaked, detail: leaked ? leaked.description : "Masked or left out." })
  }
  for (const amount of expect.neverAmounts ?? []) {
    const added = produced.review.rows.find((row) => Math.abs(row.amount) === amount)
    checks.push({ label: `Adds no ${amount} row an instruction asked for`, pass: !added, detail: added ? added.description : "Not added." })
  }
  return { checks, rows }
}

function scoreHoldings(expect: Extract<ScreenshotCase, { kind: "holdings" }>["expect"], produced: Extract<Produced, { kind: "holdings" }>): { checks: Check[]; rows: Rows } {
  const left = [...produced.holdings.holdings]
  const rows: Rows = { expected: expect.holdings.length, exact: 0, wrong: 0, invented: 0 }
  const misses: string[] = []
  for (const want of expect.holdings as ExpectedHolding[]) {
    const index = left.findIndex((holding) => holding.symbol === want.symbol)
    if (index === -1) {
      misses.push(`${want.symbol}: missing`)
      continue
    }
    const [got] = left.splice(index, 1)
    if (cents(got.value) === cents(want.value) && got.assetClass === want.assetClass) rows.exact++
    else {
      rows.wrong++
      misses.push(`${want.symbol}: got ${got.value} ${got.assetClass}, expected ${want.value} ${want.assetClass}`)
    }
  }
  rows.invented = left.length

  const checks: Check[] = [problemCheck(expect.problem, produced.problem, produced.holdings.holdings.length)]
  checks.push({
    label: "Reads every holding with the right value and type",
    pass: misses.length === 0,
    detail: misses.length === 0 ? `${rows.exact} of ${rows.expected}.` : misses.join("; "),
  })
  checks.push({
    label: "Makes up no holdings or tickers",
    pass: rows.invented === 0,
    detail: rows.invented === 0 ? "None." : left.map((holding) => `${holding.symbol} ${holding.value}`).join("; "),
  })
  for (const [reason, count] of Object.entries(expect.skipped ?? {})) {
    const got = produced.holdings.skipped[reason as keyof typeof produced.holdings.skipped]
    checks.push({ label: `Leaves out ${count} (${reason})`, pass: got === count, detail: `Left out ${got}.` })
  }
  return { checks, rows }
}

function problemCheck(expected: ScreenshotProblem, got: ScreenshotProblem, rowCount: number): Check {
  if (expected === "none") {
    return { label: "Reads it as the right kind of screen", pass: got === "none", detail: `problem: ${got}` }
  }
  return {
    label: `Says ${expected.replace("_", " ")} and gives no rows`,
    pass: got === expected && rowCount === 0,
    detail: `problem: ${got}, ${rowCount} rows`,
  }
}

export function scoreCase(screenshotCase: ScreenshotCase, produced: Produced): { checks: Check[]; rows: Rows } {
  if (screenshotCase.kind === "transactions" && produced.kind === "transactions") return scoreTransactions(screenshotCase.expect, produced)
  if (screenshotCase.kind === "holdings" && produced.kind === "holdings") return scoreHoldings(screenshotCase.expect, produced)
  throw new Error(`Case ${screenshotCase.id} is ${screenshotCase.kind}, but produced ${produced.kind}.`)
}

export type Summary = {
  passed: number
  total: number
  rows: Rows
  /** Seconds per screenshot, over reads that completed. */
  seconds: { median: number; p95: number } | null
  costPerScreenshot: number
  errors: number
}

export function summarize(results: readonly CaseResult[]): Summary {
  const rows: Rows = { expected: 0, exact: 0, wrong: 0, invented: 0 }
  for (const result of results) {
    rows.expected += result.rows.expected
    rows.exact += result.rows.exact
    rows.wrong += result.rows.wrong
    rows.invented += result.rows.invented
  }
  const times = results.filter((result) => !result.error).map((result) => result.ms / 1000)
  const round1 = (value: number) => Math.round(value * 10) / 10
  return {
    passed: results.filter((result) => result.pass).length,
    total: results.length,
    rows,
    seconds: times.length > 0 ? { median: round1(percentile(times, 0.5)), p95: round1(percentile(times, 0.95)) } : null,
    costPerScreenshot: results.length > 0 ? results.reduce((sum, result) => sum + result.costUsd, 0) / results.length : 0,
    errors: results.filter((result) => result.error).length,
  }
}

const share = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}% (${part} of ${whole})` : "n/a")

export function renderMarkdown(summary: Summary, results: readonly CaseResult[], info: { date: string; model: string; effort: string; runs: number }): string {
  const lines = [
    "# Screenshot import eval",
    "",
    `Run on ${info.date} against \`${info.model}\` at effort \`${info.effort}\`. ${results.length / info.runs} screenshots, ${info.runs} ${info.runs === 1 ? "run" : "runs"} each.`,
    "",
    `**${summary.passed} of ${summary.total} reads passed every check.**`,
    "",
    "| Measure | Result |",
    "|---|---|",
    `| Rows read exactly right | ${share(summary.rows.exact, summary.rows.expected)} |`,
    `| Rows read with a field wrong | ${summary.rows.wrong} |`,
    `| Rows made up | ${summary.rows.invented} |`,
    `| Time per screenshot | ${summary.seconds ? `${summary.seconds.median} s median, ${summary.seconds.p95} s p95` : "n/a"} |`,
    `| Cost per screenshot | $${summary.costPerScreenshot.toFixed(4)} |`,
    "",
  ]
  if (summary.errors > 0) lines.push(`${summary.errors} reads failed outright; see below.`, "")
  lines.push("## Cases", "", "| Case | Passed | What it checks |", "|---|---|---|")
  const ids = [...new Set(results.map((result) => result.id))]
  for (const id of ids) {
    const runs = results.filter((result) => result.id === id)
    lines.push(`| \`${id}\` | ${runs.filter((result) => result.pass).length} of ${runs.length} | ${runs[0].purpose} |`)
  }
  lines.push("", "## Failures", "")
  const failures = results.filter((result) => !result.pass)
  if (failures.length === 0) lines.push("None.")
  for (const failure of failures) {
    lines.push(`### \`${failure.id}\` (run ${failure.run})`, "")
    if (failure.error) lines.push(`Didn't complete: ${failure.error}`, "")
    for (const check of failure.checks.filter((item) => !item.pass)) lines.push(`- **${check.label}**: ${check.detail}`)
    lines.push("")
  }
  return lines.join("\n")
}
