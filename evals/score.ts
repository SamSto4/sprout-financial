// Turns graded answers into the numbers and the Markdown report. Pure, so the arithmetic behind
// the reported pass rates is unit-tested. Kept free of SDK imports so it runs under `node --test`.

import { CATEGORIES, type CaseResult, type Category } from "./types.ts"

type Tally = { total: number; passed: number }

export type Summary = {
  /** Graded answers. Equal to the number of cases unless --runs is above 1. */
  answers: Tally
  /** Share of answers that passed, 0 to 1. */
  passRate: number
  /** Answers where the agent or grader failed to respond, which count as not passed. */
  errors: number
  byCategory: (Tally & { category: Category; passRate: number })[]
  /** One row per case, with how many of its runs passed. */
  cases: (Tally & { id: string; category: Category; purpose: string })[]
  checks: { code: Tally; grader: Tally }
  tokens: { input: number; output: number }
}

function rate({ total, passed }: Tally) {
  return total > 0 ? passed / total : 0
}

export function summarize(results: readonly CaseResult[]): Summary {
  const answers: Tally = { total: results.length, passed: results.filter((result) => result.pass).length }

  const cases: Summary["cases"] = []
  for (const result of results) {
    let entry = cases.find((item) => item.id === result.id)
    if (!entry) {
      entry = { id: result.id, category: result.category, purpose: result.purpose, total: 0, passed: 0 }
      cases.push(entry)
    }
    entry.total += 1
    if (result.pass) entry.passed += 1
  }

  const byCategory = CATEGORIES.map((category) => {
    const inCategory = results.filter((result) => result.category === category)
    const tally: Tally = { total: inCategory.length, passed: inCategory.filter((result) => result.pass).length }
    return { category, ...tally, passRate: rate(tally) }
  }).filter((row) => row.total > 0)

  const checks = { code: { total: 0, passed: 0 }, grader: { total: 0, passed: 0 } }
  const tokens = { input: 0, output: 0 }
  for (const result of results) {
    tokens.input += result.tokens.input
    tokens.output += result.tokens.output
    for (const check of result.checks) {
      checks[check.source].total += 1
      if (check.pass) checks[check.source].passed += 1
    }
  }

  return {
    answers,
    passRate: rate(answers),
    errors: results.filter((result) => result.error).length,
    byCategory,
    cases,
    checks,
    tokens,
  }
}

export function percent(fraction: number) {
  return `${Math.round(fraction * 100)}%`
}

/** Details that describe the run, printed at the top of the report. */
export type RunInfo = {
  date: string // YYYY-MM-DD
  model: string
  graderModel: string
  runsPerCase: number
  durationSeconds: number
}

const MAX_REPLY_CHARS = 1500

function cell(text: string) {
  return text.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ")
}

function quote(text: string) {
  const clipped = text.length > MAX_REPLY_CHARS ? `${text.slice(0, MAX_REPLY_CHARS)}… [shortened]` : text
  return clipped
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n")
}

function title(category: Category) {
  return category[0].toUpperCase() + category.slice(1)
}

/** The report written to evals/results/latest.md: headline numbers, every case, then each failure in full. */
export function renderMarkdown(summary: Summary, results: readonly CaseResult[], info: RunInfo): string {
  const lines: string[] = []
  const repeated = info.runsPerCase > 1

  lines.push("# Eval results", "")
  lines.push(
    `Run on ${info.date} against \`${info.model}\`, graded by \`${info.graderModel}\`. ` +
      `${summary.cases.length} cases${repeated ? `, ${info.runsPerCase} runs each` : ""}, ${Math.round(info.durationSeconds)} seconds.`,
    ""
  )
  lines.push(
    `**${summary.answers.passed} of ${summary.answers.total} ${repeated ? "answers" : "cases"} passed (${percent(summary.passRate)}).**`,
    ""
  )
  if (summary.errors > 0) {
    lines.push(
      `${summary.errors} of those didn't pass because the agent or the grader failed to respond, not because of what the agent said. Re-run before reading anything into them.`,
      ""
    )
  }

  lines.push("| Area | Passed | Rate |", "|---|---|---|")
  for (const row of summary.byCategory) {
    lines.push(`| ${title(row.category)} | ${row.passed} of ${row.total} | ${percent(row.passRate)} |`)
  }
  lines.push("")

  const { code, grader } = summary.checks
  lines.push(
    `Individual checks: ${code.passed} of ${code.total} code checks and ${grader.passed} of ${grader.total} grader checks passed. ` +
      `A case passes only when all of its checks do.`,
    ""
  )
  lines.push(
    `Tokens used by the agent and the grader: ${summary.tokens.input.toLocaleString("en-US")} in, ${summary.tokens.output.toLocaleString("en-US")} out.`,
    ""
  )

  lines.push("## Cases", "", "| Case | Area | Result | What it protects |", "|---|---|---|---|")
  for (const row of summary.cases) {
    const outcome = repeated ? `${row.passed} of ${row.total}` : row.passed === row.total ? "pass" : "FAIL"
    lines.push(`| \`${row.id}\` | ${title(row.category)} | ${outcome} | ${cell(row.purpose)} |`)
  }
  lines.push("")

  const failures = results.filter((result) => !result.pass)
  if (failures.length === 0) {
    lines.push("## Failures", "", "None.", "")
    return lines.join("\n")
  }

  lines.push("## Failures", "")
  for (const failure of failures) {
    lines.push(`### \`${failure.id}\`${repeated ? ` (run ${failure.run})` : ""}`, "")
    if (failure.error) lines.push(`Didn't complete: ${failure.error}`, "")
    for (const check of failure.checks.filter((item) => !item.pass)) {
      lines.push(`- **${check.label}** (${check.source} check): ${check.detail}`)
    }
    lines.push("")
    if (failure.toolCalls.length > 0) {
      lines.push(`Tools called: ${failure.toolCalls.map((call) => `\`${call.name}\`${call.isError ? " (failed)" : ""}`).join(", ")}`, "")
    }
    if (failure.reply.trim()) lines.push("The reply:", "", quote(failure.reply.trim()), "")
  }
  return lines.join("\n")
}
