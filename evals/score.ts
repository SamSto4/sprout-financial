// Turns graded answers into the numbers and the Markdown report. Pure, so the arithmetic behind
// the reported pass rates is unit-tested. Kept free of SDK imports so it runs under `node --test`.

import { CATEGORIES, type CaseResult, type Category, type CheckKind } from "./types.ts"

type Tally = { total: number; passed: number }

export type Summary = {
  /** Graded answers. Equal to the number of cases unless --runs is above 1. */
  answers: Tally
  /** Share of answers that passed, 0 to 1. */
  passRate: number
  /** Answers where the agent or grader failed to respond, which count as not passed. */
  errors: number
  byCategory: (Tally & { category: Category; passRate: number })[]
  /**
   * One row per case, with how many of its runs passed, the median time to first text (seconds,
   * null when no run sent text) and the agent's input tokens per run, with how many came from the
   * prompt cache (null for results recorded before cache use was).
   */
  cases: (Tally & {
    id: string
    category: Category
    purpose: string
    firstTextSeconds: number | null
    agentInput: { perRun: number; cacheReadPerRun: number } | null
  })[]
  checks: { code: Tally; grader: Tally }
  tokens: { input: number; output: number }
  /** The agent's own prompt-cache use over every answer (grading excluded). */
  agentCache: { input: number; read: number; write: number }
  /** How long the agent took to answer, in seconds, over answers that completed. Null if none did. */
  answerSeconds: Spread | null
  /** How long until the first reply text arrived, in seconds, over answers that sent text. */
  firstTextSeconds: Spread | null
  /** Answers with at least one tool check, and how many passed all of them. */
  toolSelection: Tally
  /** Answers with at least one grounding check, and how many passed all of them. */
  groundedness: Tally
  /** The agent's estimated spend in US dollars (grading excluded): in total and per conversation. */
  agentCostUsd: { total: number; perConversation: number }
}

type Spread = { median: number; p95: number }

function rate({ total, passed }: Tally) {
  return total > 0 ? passed / total : 0
}

/** The value at or below which `fraction` of the sorted values fall (nearest-rank method). */
export function percentile(values: readonly number[], fraction: number) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1))]
}

export function summarize(results: readonly CaseResult[]): Summary {
  const answers: Tally = { total: results.length, passed: results.filter((result) => result.pass).length }

  const round1 = (seconds: number) => Math.round(seconds * 10) / 10
  const cases: Summary["cases"] = []
  for (const result of results) {
    let entry = cases.find((item) => item.id === result.id)
    if (!entry) {
      entry = { id: result.id, category: result.category, purpose: result.purpose, total: 0, passed: 0, firstTextSeconds: null, agentInput: null }
      cases.push(entry)
    }
    entry.total += 1
    if (result.pass) entry.passed += 1
  }
  for (const entry of cases) {
    const runs = results.filter((result) => result.id === entry.id)
    const firstTexts = runs.flatMap((result) => (result.firstTextMs === null ? [] : [result.firstTextMs / 1000]))
    entry.firstTextSeconds = firstTexts.length > 0 ? round1(percentile(firstTexts, 0.5)) : null
    const counted = runs.flatMap((result) => (result.agentTokens ? [result.agentTokens] : []))
    entry.agentInput =
      counted.length > 0
        ? {
            perRun: Math.round(counted.reduce((sum, tokens) => sum + tokens.input, 0) / counted.length),
            cacheReadPerRun: Math.round(counted.reduce((sum, tokens) => sum + tokens.cacheRead, 0) / counted.length),
          }
        : null
  }

  const byCategory = CATEGORIES.map((category) => {
    const inCategory = results.filter((result) => result.category === category)
    const tally: Tally = { total: inCategory.length, passed: inCategory.filter((result) => result.pass).length }
    return { category, ...tally, passRate: rate(tally) }
  }).filter((row) => row.total > 0)

  const checks = { code: { total: 0, passed: 0 }, grader: { total: 0, passed: 0 } }
  const tokens = { input: 0, output: 0 }
  const agentCache = { input: 0, read: 0, write: 0 }
  for (const result of results) {
    tokens.input += result.tokens.input
    tokens.output += result.tokens.output
    agentCache.input += result.agentTokens?.input ?? 0
    agentCache.read += result.agentTokens?.cacheRead ?? 0
    agentCache.write += result.agentTokens?.cacheWrite ?? 0
    for (const check of result.checks) {
      checks[check.source].total += 1
      if (check.pass) checks[check.source].passed += 1
    }
  }

  // Answers that failed outright (no reply) would drag the timings toward zero, so they're left out.
  const times = results.filter((result) => result.reply.trim()).map((result) => result.answerMs / 1000)

  const spread = (values: number[]): Spread | null =>
    values.length > 0 ? { median: round1(percentile(values, 0.5)), p95: round1(percentile(values, 0.95)) } : null
  const firstTexts = results.flatMap((result) => (result.firstTextMs === null ? [] : [result.firstTextMs / 1000]))
  const agentCost = results.reduce((sum, result) => sum + result.agentCostUsd, 0)

  return {
    answers,
    passRate: rate(answers),
    errors: results.filter((result) => result.error).length,
    byCategory,
    cases,
    checks,
    tokens,
    agentCache,
    answerSeconds: spread(times),
    firstTextSeconds: spread(firstTexts),
    toolSelection: tallyKind(results, "tool"),
    groundedness: tallyKind(results, "grounding"),
    agentCostUsd: { total: agentCost, perConversation: results.length > 0 ? agentCost / results.length : 0 },
  }
}

/** Answers that have checks of this kind, and how many passed every one of them. */
function tallyKind(results: readonly CaseResult[], kind: CheckKind): Tally {
  const scored = results.map((result) => result.checks.filter((check) => check.kind === kind)).filter((checks) => checks.length > 0)
  return { total: scored.length, passed: scored.filter((checks) => checks.every((check) => check.pass)).length }
}

/** Dollars to the nearest hundredth of a cent, since one conversation often costs well under a cent. */
export function usd(value: number) {
  return `$${value.toFixed(4)}`
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
  lines.push("| Measure | Result |", "|---|---|")
  lines.push(`| Task success (cases passing every check) | ${percent(summary.passRate)} |`)
  const share = ({ passed, total }: Tally) => (total > 0 ? `${percent(passed / total)} (${passed} of ${total})` : "no cases")
  lines.push(`| Correct tool selection | ${share(summary.toolSelection)} |`)
  lines.push(`| Groundedness (figures traced to a tool) | ${share(summary.groundedness)} |`)
  const seconds = (spread: Spread | null) => (spread ? `${spread.median} s median, ${spread.p95} s p95` : "n/a")
  lines.push(`| Time to first text | ${seconds(summary.firstTextSeconds)} |`)
  lines.push(`| Time to complete answer | ${seconds(summary.answerSeconds)} |`)
  lines.push(`| Agent cost per conversation | ${usd(summary.agentCostUsd.perConversation)} (total ${usd(summary.agentCostUsd.total)}) |`)
  const cache = summary.agentCache
  lines.push(
    `| Agent prompt cache | ${
      cache.input > 0
        ? `${percent(cache.read / cache.input)} of ${cache.input.toLocaleString("en-US")} input tokens read from cache, ${cache.write.toLocaleString("en-US")} written`
        : "n/a"
    } |`
  )
  lines.push("")
  lines.push(
    "Times and cost cover the agent alone, not the grading. Cost is estimated from list prices in lib/ai/spend.ts, cache reads and writes included. When a case runs more than once, every run after the first reads its whole prompt, question included, from the cache, which a real new chat can't: it reads only the fixed instructions it shares with earlier requests and pays to write the rest. Compare costs only between reports with the same number of runs.",
    ""
  )

  lines.push(
    "## Cases",
    "",
    "First text is the median time to the first words; agent input is tokens per run, with how many were read from the prompt cache.",
    "",
    "| Case | Area | Result | First text | Agent input (cached) | What it protects |",
    "|---|---|---|---|---|---|"
  )
  for (const row of summary.cases) {
    const outcome = repeated ? `${row.passed} of ${row.total}` : row.passed === row.total ? "pass" : "FAIL"
    const firstText = row.firstTextSeconds === null ? "n/a" : `${row.firstTextSeconds} s`
    const input = row.agentInput
      ? `${row.agentInput.perRun.toLocaleString("en-US")} (${row.agentInput.cacheReadPerRun.toLocaleString("en-US")})`
      : "n/a"
    lines.push(`| \`${row.id}\` | ${title(row.category)} | ${outcome} | ${firstText} | ${input} | ${cell(row.purpose)} |`)
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
