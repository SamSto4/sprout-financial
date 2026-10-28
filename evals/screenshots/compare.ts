// Compares two saved runs of the screenshot eval (evals/results/screenshots-<name>.json): first
// whether they can be compared fairly (the same cases, answer keys and number of runs), then what
// changed overall, by error type and by case. Pure, so it's unit-tested; compare.mts reads the files.

import { describeTotalWarnings, ERROR_LABELS, ERROR_TYPES, errorCounts, type CaseResult, type Rows, type Summary } from "./score.ts"

/** What a run read and scored against, saved beside its results by run.mts. */
export type RunInfo = {
  date: string
  model: string
  effort: string
  runs: number
  cases: Record<string, { image: string; imageSha256: string; expectSha256: string }>
}

export type SavedRun = { info?: RunInfo; summary: Summary; results: CaseResult[] }

export type Comparison = {
  /** Reasons the two runs can't be compared fairly. */
  problems: string[]
  /** Differences worth knowing that don't rule a comparison out: another model or effort, a re-drawn image. */
  notes: string[]
  markdown: string
}

const runsPerCase = (run: SavedRun) => {
  const counts = new Map<string, number>()
  for (const result of run.results) counts.set(result.id, (counts.get(result.id) ?? 0) + 1)
  return counts
}

function fairness(base: SavedRun, candidate: SavedRun, names: { base: string; candidate: string }) {
  const problems: string[] = []
  const notes: string[] = []
  for (const [name, run] of [
    [names.base, base],
    [names.candidate, candidate],
  ] as const) {
    if (!run.info) problems.push(`\`${name}\` doesn't record which images and answer keys it used (it was saved by an older run.mts). Run it again.`)
  }
  const baseRuns = runsPerCase(base)
  const candidateRuns = runsPerCase(candidate)
  const missing = [...baseRuns.keys()].filter((id) => !candidateRuns.has(id))
  const extra = [...candidateRuns.keys()].filter((id) => !baseRuns.has(id))
  if (missing.length > 0) problems.push(`\`${names.candidate}\` doesn't have ${missing.map((id) => `\`${id}\``).join(", ")}. Run every case (no --filter).`)
  if (extra.length > 0) problems.push(`\`${names.candidate}\` has cases \`${names.base}\` doesn't: ${extra.map((id) => `\`${id}\``).join(", ")}. Compare new cases on their own.`)
  for (const [id, count] of baseRuns) {
    const other = candidateRuns.get(id)
    if (other !== undefined && other !== count) problems.push(`\`${id}\` ran ${count} times in \`${names.base}\` and ${other} in \`${names.candidate}\`. Use the same --runs.`)
  }
  if (base.info && candidate.info) {
    for (const [id, saved] of Object.entries(base.info.cases)) {
      const other = candidate.info.cases[id]
      if (!other) continue
      if (other.expectSha256 !== saved.expectSha256) problems.push(`\`${id}\`'s answer key changed. A change can't be measured against a different answer key.`)
      if (other.imageSha256 !== saved.imageSha256) {
        notes.push(
          `\`${id}\` read a different image. That's fair only when the change is to how the browser prepares screenshots (lib/screenshots/prepare-image.ts), mirrored in render.mts.`
        )
      }
    }
    if (base.info.model !== candidate.info.model) notes.push(`Different models: \`${base.info.model}\` and \`${candidate.info.model}\`.`)
    if (base.info.effort !== candidate.info.effort) notes.push(`Different effort: \`${base.info.effort}\` and \`${candidate.info.effort}\`.`)
  }
  return { problems, notes }
}

const share = (rows: Rows) => (rows.expected > 0 ? `${Math.round((rows.exact / rows.expected) * 100)}% (${rows.exact} of ${rows.expected})` : "n/a")
const signed = (value: number) => (value > 0 ? `+${value}` : `${value}`)

export function compareRuns(base: SavedRun, candidate: SavedRun, names: { base: string; candidate: string }): Comparison {
  const { problems, notes } = fairness(base, candidate, names)
  const lines = [`# Screenshot eval: \`${names.base}\` against \`${names.candidate}\``, ""]
  if (problems.length > 0) {
    lines.push("**These runs can't be compared fairly:**", "", ...problems.map((problem) => `- ${problem}`), "")
    return { problems, notes, markdown: lines.join("\n") }
  }
  if (notes.length > 0) lines.push(...notes.map((note) => `- ${note}`), "")

  const a = base.summary
  const b = candidate.summary
  const runs = base.info?.runs ?? 1
  const seconds = (summary: Summary) => (summary.seconds ? `${summary.seconds.median} s` : "n/a")
  lines.push(
    `| Measure | \`${names.base}\` | \`${names.candidate}\` |`,
    "|---|---|---|",
    `| Model, effort | ${base.info?.model}, ${base.info?.effort} | ${candidate.info?.model}, ${candidate.info?.effort} |`,
    `| Reads that passed every check | ${a.passed} of ${a.total} | ${b.passed} of ${b.total} |`,
    `| Rows read exactly right | ${share(a.rows)} | ${share(b.rows)} |`,
    `| Rows with a field wrong | ${a.rows.wrong} | ${b.rows.wrong} |`,
    `| Rows missed | ${a.rows.missed} | ${b.rows.missed} |`,
    `| Rows made up | ${a.rows.invented} | ${b.rows.invented} |`,
    `| Pending or cut-off rows kept | ${a.rows.keptLeftOut} | ${b.rows.keptLeftOut} |`,
    `| Time per screenshot (median) | ${seconds(a)} | ${seconds(b)} |`,
    `| Cost per screenshot | $${a.costPerScreenshot.toFixed(4)} | $${b.costPerScreenshot.toFixed(4)} |`,
    `| Holdings reads the review warned don't add up | ${describeTotalWarnings(a)} | ${describeTotalWarnings(b)} |`,
    "",
    "## Errors by type",
    "",
    `| Error | \`${names.base}\` | \`${names.candidate}\` | Change |`,
    "|---|---|---|---|"
  )
  const errorsA = errorCounts(a.rows)
  const errorsB = errorCounts(b.rows)
  for (const type of ERROR_TYPES) lines.push(`| ${ERROR_LABELS[type]} | ${errorsA[type]} | ${errorsB[type]} | ${signed(errorsB[type] - errorsA[type])} |`)

  lines.push("", "## Cases", "", `| Case | Passed | Rows exact | Change in rows exact |`, "|---|---|---|---|")
  for (const item of a.cases) {
    const other = b.cases.find((entry) => entry.id === item.id)
    if (!other) continue
    lines.push(`| \`${item.id}\` | ${item.passed} → ${other.passed} of ${item.runs} | ${item.rows.exact} → ${other.rows.exact} of ${item.rows.expected} | ${signed(other.rows.exact - item.rows.exact)} |`)
  }
  lines.push(
    "",
    `Each case ran ${runs} ${runs === 1 ? "time" : "times"} on each side, and the model doesn't read a screen the same way every time: a change of one run in one case, or a few rows in a long capture, is within the noise. Look for changes that hold across runs and cases, and for new errors of a kind the base run didn't have.`
  )
  return { problems, notes, markdown: lines.join("\n") }
}
