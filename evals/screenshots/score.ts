// Scores what the screenshot import produced against each case's answer key, and writes the
// report. Pure (no SDK, no files), so the arithmetic behind the reported numbers is unit-tested.
//
// Every row the answer key has ends up exact, wrong (paired with a produced row that has one or
// more fields wrong, each counted by type), or missed; every produced row left over is either a
// row the screen shows but the import must leave out (pending, cut off) or made up.

import { percentile } from "../score.ts"
import type { CollectedHoldings, HoldingRow } from "../../lib/portfolio/csv-import.ts"
import { totalsThatDontAddUp } from "../../lib/screenshots/holding-rows.ts"
import type { ScreenshotProblem } from "../../lib/screenshots/image.ts"
import type { ReviewTransaction, TransactionReview } from "../../lib/screenshots/transaction-rows.ts"
import type { ExpectedHolding, ExpectedTransaction, ScreenshotCase } from "./cases.ts"

export type Check = { label: string; pass: boolean; detail: string }

/** What the import gave for one screenshot, after every rule in lib/screenshots. */
export type Produced =
  | { kind: "transactions"; problem: ScreenshotProblem; review: TransactionReview }
  | {
      kind: "holdings"
      problem: ScreenshotProblem
      holdings: CollectedHoldings
      /** The rows as read, before collectHoldings: needed for funds shown by name only, which it leaves out. */
      rows?: HoldingRow[]
    }

/** A field a row can get wrong. Transactions: date, amount, direction, description. Holdings: symbol, value, type. */
export const FIELD_ERRORS = ["date", "amount", "direction", "description", "symbol", "value", "type"] as const
export type FieldError = (typeof FIELD_ERRORS)[number]

/** Every kind of error the report counts: a wrong field, or a whole row missed, made up or kept. */
export const ERROR_TYPES = [...FIELD_ERRORS, "missed", "invented", "keptLeftOut"] as const
export type ErrorType = (typeof ERROR_TYPES)[number]

export const ERROR_LABELS: Record<ErrorType, string> = {
  date: "Date",
  amount: "Amount",
  direction: "Direction (money in or out)",
  description: "Description",
  symbol: "Ticker",
  value: "Value",
  type: "Asset type",
  missed: "Row missed",
  invented: "Row made up",
  keptLeftOut: "Pending or cut-off row kept",
}

export type Rows = {
  /** Rows the answer key has. */
  expected: number
  /** Of those, found with every field right. */
  exact: number
  /** Found, but with at least one field wrong; `fields` counts each wrong field. */
  wrong: number
  /** In the answer key, but nothing produced matches. */
  missed: number
  /** Produced rows that match nothing on the screen. */
  invented: number
  /** Produced rows the screen shows but the import must leave out (pending, cut off). */
  keptLeftOut: number
  fields: Record<FieldError, number>
}

export const emptyFields = (): Record<FieldError, number> => Object.fromEntries(FIELD_ERRORS.map((field) => [field, 0])) as Record<FieldError, number>
export const emptyRows = (expected = 0): Rows => ({ expected, exact: 0, wrong: 0, missed: 0, invented: 0, keptLeftOut: 0, fields: emptyFields() })

/** A case's errors of each type, for the report. */
export function errorCounts(rows: Rows): Record<ErrorType, number> {
  return { ...rows.fields, missed: rows.missed, invented: rows.invented, keptLeftOut: rows.keptLeftOut }
}

/** What the import produced, compact, for the JSON results (the fixtures' data, never a person's). */
export type Got =
  | { rows: [date: string, description: string, amount: number, yearAssumed: boolean][]; pending: number; skipped: number; duplicates: number }
  | { holdings: [symbol: string, value: number, assetClass: string][]; read: HoldingRow[] }

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
  /** Holdings only: whether the review warned that the rows don't add up to the screen's total. */
  totalWarning?: boolean
  error?: string
  got?: Got
}

export function describeProduced(produced: Produced): Got {
  if (produced.kind === "transactions") {
    const { rows, pending, skipped, duplicates } = produced.review
    return { rows: rows.map((row) => [row.date, row.description, row.amount, row.yearAssumed]), pending, skipped, duplicates }
  }
  return { holdings: produced.holdings.holdings.map((holding) => [holding.symbol, holding.value, holding.assetClass]), read: produced.rows ?? [] }
}

const words = (text: string) => text.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9•]+/g, " ").trim()

/** Same description, allowing for spacing, punctuation and case, or one shortened from the other. */
export function sameDescription(a: string, b: string) {
  const x = words(a)
  const y = words(b)
  return x.length > 0 && y.length > 0 && (x.includes(y) || y.includes(x))
}

/** Edit distance between two short strings (descriptions are cut to a few hundred characters). */
function editDistance(a: string, b: string) {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    previous = current
  }
  return previous[b.length]
}

/** Spelled nearly the same: a misread letter or two ("Tracer Joe's" for "Trader Joe's"), a fifth of the letters at most. */
export function similarDescription(a: string, b: string) {
  const x = words(a).slice(0, 200)
  const y = words(b).slice(0, 200)
  return x.length > 0 && y.length > 0 && editDistance(x, y) <= Math.max(1, Math.floor(Math.max(x.length, y.length) / 5))
}

const cents = (amount: number) => Math.round(amount * 100)

/**
 * Pairs expected rows with produced ones in passes, strictest first, so a near match never takes
 * a row another expected row matches exactly. Returns the pairs and what was left on each side.
 */
function pairRows<W, G>(wanted: readonly W[], produced: readonly G[], passes: ((got: G, want: W) => boolean)[]) {
  const pairs: { want: W; got: G }[] = []
  let wants = [...wanted]
  const left = [...produced]
  for (const match of passes) {
    const unmatched: W[] = []
    for (const want of wants) {
      const index = left.findIndex((got) => match(got, want))
      if (index === -1) unmatched.push(want)
      else pairs.push({ want, got: left.splice(index, 1)[0] })
    }
    wants = unmatched
  }
  return { pairs, missed: wants, left }
}

type Txn = Pick<ReviewTransaction, "date" | "description" | "amount">

/** The fields a produced transaction gets wrong against the expected one. */
export function transactionErrors(got: Txn, want: ExpectedTransaction): FieldError[] {
  const fields: FieldError[] = []
  if (got.date !== want.date) fields.push("date")
  if (Math.abs(cents(got.amount)) !== Math.abs(cents(want.amount))) fields.push("amount")
  if (Math.sign(got.amount) !== Math.sign(want.amount)) fields.push("direction")
  if (!sameDescription(got.description, want.description)) fields.push("description")
  return fields
}

const desc = (got: Txn, want: ExpectedTransaction) => sameDescription(got.description, want.description)
const like = (got: Txn, want: ExpectedTransaction) => similarDescription(got.description, want.description)
const day = (got: Txn, want: ExpectedTransaction) => got.date === want.date
const amount = (got: Txn, want: ExpectedTransaction) => cents(got.amount) === cents(want.amount)
const size = (got: Txn, want: ExpectedTransaction) => Math.abs(cents(got.amount)) === Math.abs(cents(want.amount))

// One field wrong before two; the description (the strongest sign it's the same row), or one
// spelled nearly the same, is needed whenever two fields are wrong. A row that matches nothing
// this loosely is counted as made up.
const TRANSACTION_PASSES: ((got: Txn, want: ExpectedTransaction) => boolean)[] = [
  (got, want) => desc(got, want) && day(got, want) && amount(got, want),
  (got, want) => desc(got, want) && day(got, want) && size(got, want),
  (got, want) => desc(got, want) && amount(got, want),
  (got, want) => day(got, want) && amount(got, want),
  (got, want) => desc(got, want) && size(got, want),
  (got, want) => day(got, want) && size(got, want),
  (got, want) => desc(got, want) && day(got, want),
  (got, want) => like(got, want) && day(got, want) && size(got, want),
  (got, want) => like(got, want) && amount(got, want),
  (got, want) => like(got, want) && day(got, want),
  (got, want) => desc(got, want),
  (got, want) => like(got, want),
]

const describeErrors = (label: string, fields: string[], got: string, want: string) => `${label}: ${fields.join(" and ")} wrong (got ${got}, expected ${want})`

function scoreTransactions(expect: Extract<ScreenshotCase, { kind: "transactions" }>["expect"], produced: Extract<Produced, { kind: "transactions" }>): { checks: Check[]; rows: Rows } {
  const rows = emptyRows(expect.transactions.length)
  const { pairs, missed, left } = pairRows(expect.transactions, produced.review.rows, TRANSACTION_PASSES)
  const misses: string[] = []
  for (const { want, got } of pairs) {
    const fields = transactionErrors(got, want)
    if (fields.length === 0) {
      rows.exact++
      continue
    }
    rows.wrong++
    for (const field of fields) rows.fields[field]++
    misses.push(describeErrors(want.description, fields, `${got.date} ${got.description} ${got.amount}`, `${want.date} ${want.amount}`))
  }
  rows.missed = missed.length
  misses.push(...missed.map((want) => `${want.description} ${want.amount}: missing`))

  // What's left is either on the screen but meant to be left out, or not on the screen at all.
  const shouldLeaveOut = [...(expect.leftOut ?? [])]
  const kept: string[] = []
  const invented: string[] = []
  for (const got of left) {
    const index = shouldLeaveOut.findIndex((row) => sameDescription(got.description, row.description) || Math.abs(cents(got.amount)) === Math.abs(cents(row.amount)))
    if (index === -1) invented.push(`${got.date} ${got.description} ${got.amount}`)
    else kept.push(`${got.description} (${shouldLeaveOut.splice(index, 1)[0].why})`)
  }
  rows.keptLeftOut = kept.length
  rows.invented = invented.length

  const checks: Check[] = [problemCheck(expect.problem, produced.problem, produced.review.rows.length)]
  checks.push({
    label: "Reads every transaction with the right date, amount and sign",
    pass: misses.length === 0,
    detail:
      misses.length === 0
        ? `${rows.exact} of ${rows.expected}.`
        : `${rows.exact} of ${rows.expected} exact. ${misses.slice(0, 5).join("; ")}${misses.length > 5 ? `; and ${misses.length - 5} more` : ""}`,
  })
  checks.push({ label: "Makes up no transactions", pass: invented.length === 0, detail: invented.length === 0 ? "None." : invented.slice(0, 4).join("; ") })
  if (expect.leftOut?.length) {
    const reasons = [...new Set(expect.leftOut.map((row) => row.why))].join(" and ")
    checks.push({ label: `Leaves out the ${reasons} rows`, pass: kept.length === 0, detail: kept.length === 0 ? "Left out." : `Kept ${kept.join("; ")}` })
  }
  for (const secret of expect.never ?? []) {
    const leaked = produced.review.rows.find((row) => row.description.replace(/\D/g, "").includes(secret))
    checks.push({ label: `Keeps no full number ending ${secret.slice(-4)}`, pass: !leaked, detail: leaked ? leaked.description : "Masked or left out." })
  }
  for (const amount of expect.neverAmounts ?? []) {
    const added = produced.review.rows.find((row) => Math.abs(row.amount) === amount)
    checks.push({ label: `Adds no ${amount} row that isn't a transaction on this account`, pass: !added, detail: added ? added.description : "Not added." })
  }
  return { checks, rows }
}

type Holding = CollectedHoldings["holdings"][number]

/** The fields a produced holding gets wrong against the expected one. */
export function holdingErrors(got: Pick<Holding, "symbol" | "value" | "assetClass">, want: ExpectedHolding): FieldError[] {
  const fields: FieldError[] = []
  if (got.symbol !== want.symbol) fields.push("symbol")
  if (cents(got.value) !== cents(want.value)) fields.push("value")
  if (got.assetClass !== want.assetClass) fields.push("type")
  return fields
}

const HOLDING_PASSES: ((got: Holding, want: ExpectedHolding) => boolean)[] = [
  (got, want) => got.symbol === want.symbol && cents(got.value) === cents(want.value) && got.assetClass === want.assetClass,
  (got, want) => got.symbol === want.symbol && cents(got.value) === cents(want.value),
  (got, want) => got.symbol === want.symbol,
  // A misread ticker (VTl for VTI) still shows by its value.
  (got, want) => cents(got.value) === cents(want.value),
]

function scoreHoldings(expect: Extract<ScreenshotCase, { kind: "holdings" }>["expect"], produced: Extract<Produced, { kind: "holdings" }>): { checks: Check[]; rows: Rows } {
  const nameOnly = expect.nameOnly ?? []
  const rows = emptyRows(expect.holdings.length + nameOnly.length)
  const { pairs, missed, left } = pairRows(expect.holdings, produced.holdings.holdings, HOLDING_PASSES)
  const misses: string[] = []
  let holdingsExact = 0
  for (const { want, got } of pairs) {
    const fields = holdingErrors(got, want)
    if (fields.length === 0) {
      holdingsExact++
      continue
    }
    rows.wrong++
    for (const field of fields) rows.fields[field]++
    misses.push(describeErrors(want.symbol, fields, `${got.symbol} ${got.value} ${got.assetClass}`, `${want.symbol} ${want.value} ${want.assetClass}`))
  }
  rows.exact += holdingsExact
  rows.missed = missed.length
  misses.push(...missed.map((want) => `${want.symbol}: missing`))

  // Funds shown by name only: checked in the rows as read, since the import drops them for having no ticker.
  const read = [...(produced.rows ?? [])]
  const nameMisses: string[] = []
  for (const want of nameOnly) {
    const index = read.findIndex((row) => sameDescription(row.name, want.name))
    if (index === -1) {
      rows.missed++
      nameMisses.push(`${want.name}: missing`)
      continue
    }
    const [got] = read.splice(index, 1)
    const fields: FieldError[] = []
    if (got.symbol) fields.push("symbol")
    if (got.value === null || cents(got.value) !== cents(want.value)) fields.push("value")
    if (fields.length === 0) rows.exact++
    else {
      rows.wrong++
      for (const field of fields) rows.fields[field]++
      nameMisses.push(describeErrors(want.name, fields, `${got.symbol || "no ticker"} ${got.value}`, `no ticker ${want.value}`))
    }
  }
  // A ticker made up for a fund shown by name counts as that fund's error, not again as a made-up
  // row; the check below still fails on it.
  rows.invented = left.filter((holding) => !nameOnly.some((fund) => sameDescription(holding.name, fund.name))).length

  const checks: Check[] = [problemCheck(expect.problem, produced.problem, produced.holdings.holdings.length)]
  if (expect.holdings.length > 0) {
    checks.push({
      label: "Reads every holding with the right value and type",
      pass: misses.length === 0,
      detail: misses.length === 0 ? `${holdingsExact} of ${expect.holdings.length}.` : misses.join("; "),
    })
  }
  if (nameOnly.length > 0) {
    checks.push({
      label: "Reads each fund shown by name only, and gives it no ticker",
      pass: nameMisses.length === 0,
      detail: nameMisses.length === 0 ? `${nameOnly.length} of ${nameOnly.length}.` : nameMisses.join("; "),
    })
  }
  checks.push({
    label: "Makes up no holdings or tickers",
    pass: left.length === 0,
    detail: left.length === 0 ? "None." : left.map((holding) => `${holding.symbol} ${holding.value}`).join("; "),
  })
  for (const symbol of expect.valueNotShown ?? []) {
    const row = produced.rows?.find((item) => item.symbol.toUpperCase() === symbol)
    checks.push({
      label: `Leaves ${symbol}'s value empty, since the screen shows only shares and price`,
      pass: !row || row.value === null,
      detail: !row ? "Not read." : row.value === null ? "Left empty; worked out in code." : `Gave ${row.value}.`,
    })
  }
  for (const [reason, count] of Object.entries(expect.skipped ?? {})) {
    const got = produced.holdings.skipped[reason as keyof typeof produced.holdings.skipped]
    checks.push({ label: `Leaves out ${count} (${reason})`, pass: got === count, detail: `Left out ${got}.` })
  }
  if (expect.warnsTotal !== undefined) {
    const warned = warnsTotal(produced)
    checks.push({
      label: expect.warnsTotal ? "The review warns that these don't add up to the screen's total" : "The review doesn't warn about the screen's total",
      pass: warned === expect.warnsTotal,
      detail: warned ? "Warned." : "No warning.",
    })
  }
  return { checks, rows }
}

/** Whether the holdings review would warn that these rows don't add up to the total the screen shows. */
export function warnsTotal(produced: Extract<Produced, { kind: "holdings" }>): boolean {
  return totalsThatDontAddUp([{ problem: produced.problem, rows: produced.rows ?? [] }]).length > 0
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

/** How many rows a case's answer key has, for a read that failed before producing anything. */
export function expectedRows(screenshotCase: ScreenshotCase) {
  return screenshotCase.kind === "transactions"
    ? screenshotCase.expect.transactions.length
    : screenshotCase.expect.holdings.length + (screenshotCase.expect.nameOnly?.length ?? 0)
}

export function addRows(total: Rows, rows: Rows): Rows {
  const fields = emptyFields()
  for (const field of FIELD_ERRORS) fields[field] = total.fields[field] + rows.fields[field]
  return {
    expected: total.expected + rows.expected,
    exact: total.exact + rows.exact,
    wrong: total.wrong + rows.wrong,
    missed: total.missed + rows.missed,
    invented: total.invented + rows.invented,
    keptLeftOut: total.keptLeftOut + rows.keptLeftOut,
    fields,
  }
}

export type CaseSummary = { id: string; purpose: string; runs: number; passed: number; rows: Rows }

export type Summary = {
  passed: number
  total: number
  rows: Rows
  /** Each case over all its runs, in the order the cases ran. */
  cases: CaseSummary[]
  /** Seconds per screenshot, over reads that completed. */
  seconds: { median: number; p95: number } | null
  costPerScreenshot: number
  /**
   * Holdings reads the review warned don't add up to the screen's total, by case, and how many of
   * those were wrong reads; and wrong holdings reads it didn't warn about. Older runs have none.
   */
  totalWarnings?: { reads: number; wrong: number; byCase: Record<string, number>; wrongUnwarned: number }
  errors: number
}

export function summarize(results: readonly CaseResult[]): Summary {
  const cases: CaseSummary[] = []
  for (const result of results) {
    let entry = cases.find((item) => item.id === result.id)
    if (!entry) cases.push((entry = { id: result.id, purpose: result.purpose, runs: 0, passed: 0, rows: emptyRows() }))
    entry.runs++
    if (result.pass) entry.passed++
    entry.rows = addRows(entry.rows, result.rows)
  }
  const times = results.filter((result) => !result.error).map((result) => result.ms / 1000)
  const round1 = (value: number) => Math.round(value * 10) / 10
  return {
    passed: results.filter((result) => result.pass).length,
    total: results.length,
    rows: results.reduce((total, result) => addRows(total, result.rows), emptyRows()),
    cases,
    seconds: times.length > 0 ? { median: round1(percentile(times, 0.5)), p95: round1(percentile(times, 0.95)) } : null,
    costPerScreenshot: results.length > 0 ? results.reduce((sum, result) => sum + result.costUsd, 0) / results.length : 0,
    totalWarnings: countTotalWarnings(results),
    errors: results.filter((result) => result.error).length,
  }
}

function countTotalWarnings(results: readonly CaseResult[]): NonNullable<Summary["totalWarnings"]> {
  const warned = results.filter((result) => result.totalWarning)
  const byCase: Record<string, number> = {}
  for (const result of warned) byCase[result.id] = (byCase[result.id] ?? 0) + 1
  return {
    reads: warned.length,
    wrong: warned.filter((result) => !result.pass).length,
    byCase,
    wrongUnwarned: results.filter((result) => result.kind === "holdings" && !result.pass && !result.totalWarning).length,
  }
}

/** "3 (`case-a` 2, `case-b` 1; 1 of them wrong)", for the report and the comparison. */
export function describeTotalWarnings(summary: Summary): string {
  const warnings = summary.totalWarnings
  if (!warnings) return "n/a"
  const where = Object.entries(warnings.byCase).map(([id, count]) => `\`${id}\` ${count}`)
  return warnings.reads === 0 ? "0" : `${warnings.reads} (${where.join(", ")}; ${warnings.wrong} of them wrong)`
}

const share = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}% (${part} of ${whole})` : "n/a")

/** "date 2, amount 1", or "none". */
function fieldList(rows: Rows) {
  const parts = FIELD_ERRORS.filter((field) => rows.fields[field] > 0).map((field) => `${field} ${rows.fields[field]}`)
  return parts.length > 0 ? parts.join(", ") : "none"
}

export function renderMarkdown(
  summary: Summary,
  results: readonly CaseResult[],
  info: { date: string; model: string; effort: string; runs: number }
): string {
  const lines = [
    "# Screenshot import eval",
    "",
    `Run on ${info.date} against \`${info.model}\` at effort \`${info.effort}\`. ${summary.cases.length} screenshots, ${info.runs} ${info.runs === 1 ? "run" : "runs"} each.`,
    "",
    `**${summary.passed} of ${summary.total} reads passed every check.**`,
    "",
    "| Measure | Result |",
    "|---|---|",
    `| Rows read exactly right | ${share(summary.rows.exact, summary.rows.expected)} |`,
    `| Rows read with a field wrong | ${summary.rows.wrong} |`,
    `| Rows missed | ${summary.rows.missed} |`,
    `| Rows made up | ${summary.rows.invented} |`,
    `| Pending or cut-off rows kept | ${summary.rows.keptLeftOut} |`,
    `| Time per screenshot | ${summary.seconds ? `${summary.seconds.median} s median, ${summary.seconds.p95} s p95` : "n/a"} |`,
    `| Cost per screenshot | $${summary.costPerScreenshot.toFixed(4)} |`,
    `| Holdings reads the review warned don't add up to the screen's total | ${describeTotalWarnings(summary)} |`,
    `| Wrong holdings reads with no such warning | ${summary.totalWarnings?.wrongUnwarned ?? "n/a"} |`,
    "",
  ]
  if (summary.errors > 0) lines.push(`${summary.errors} reads failed outright; see below.`, "")

  lines.push("## Errors by type", "", "Totals over every run. A row with two fields wrong counts once for each.", "", "| Error | Count | Where |", "|---|---|---|")
  for (const type of ERROR_TYPES) {
    const where = summary.cases.map((item) => ({ id: item.id, count: errorCounts(item.rows)[type] })).filter((item) => item.count > 0)
    lines.push(`| ${ERROR_LABELS[type]} | ${errorCounts(summary.rows)[type]} | ${where.map((item) => `\`${item.id}\` ${item.count}`).join(", ") || "-"} |`)
  }

  lines.push("", "## Cases", "", "| Case | Passed | Rows exact | Fields wrong | Missed | Made up | Kept | What it checks |", "|---|---|---|---|---|---|---|---|")
  for (const item of summary.cases) {
    const { rows } = item
    lines.push(`| \`${item.id}\` | ${item.passed} of ${item.runs} | ${rows.exact} of ${rows.expected} | ${fieldList(rows)} | ${rows.missed} | ${rows.invented} | ${rows.keptLeftOut} | ${item.purpose} |`)
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
