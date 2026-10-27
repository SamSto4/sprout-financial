"use client"

import { useId, useState } from "react"
import { ImageIcon, InfoIcon, TriangleAlertIcon } from "lucide-react"
import { cn } from "cn"

import { useScreenshotReader } from "@/components/screenshots/use-screenshot-reader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatMoney, formatMoneyPrecise } from "@/lib/format"
import type { ImportedHolding, ImportMode } from "@/lib/portfolio/csv-import"
import { ASSET_CLASSES } from "@/lib/portfolio/funds"
import { holdingsFromScreenshots, totalsThatDontAddUp } from "@/lib/screenshots/holding-rows"
import { MAX_SCREENSHOTS, problemMessage } from "@/lib/screenshots/image"

type Row = ImportedHolding & { id: number; include: boolean; valueText: string }

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** The same clean-up as typing a symbol by hand in the holdings list. */
const cleanSymbol = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9.\-^]/g, "").slice(0, 12)

/**
 * The warning shown above the review when a screenshot's rows don't add up to the total it shows
 * (totalsThatDontAddUp). It only asks the person to look: part of a long list is a fine reason.
 */
function totalWarning(label: string, total: number, onlyOne: boolean) {
  const amount = formatMoneyPrecise(total)
  return onlyOne
    ? `These don't add up to the total on the screen (${amount}). If the screenshot shows only part of the account, that's expected; otherwise check the values before saving.`
    : `${label}'s holdings don't add up to the total it shows (${amount}). If it shows only part of the account, that's expected; otherwise check the values before saving.`
}

function valueOf(row: Row) {
  const value = Number(row.valueText.replace(/[$,\s]/g, ""))
  return row.valueText.trim() && Number.isFinite(value) && value >= 0 ? value : null
}

/**
 * Screenshot import for the Portfolio page: `pick` reads the chosen screenshots, and `panel` is
 * the review to show until the person imports the holdings or cancels. Holdings are added with
 * "update and add", so nothing already saved is removed.
 */
export function useHoldingsScreenshots(onImport: (holdings: ImportedHolding[], mode: ImportMode, fileName: string, needPrices: number) => void) {
  const { read, progress } = useScreenshotReader("holdings")
  const [review, setReview] = useState<{ rows: Row[]; notes: string[]; warnings: string[]; key: number } | null>(null)

  async function pick(files: File[]) {
    setReview(null)
    const { reads, tooMany } = await read(files)
    const succeeded = reads.flatMap((item) => (item.ok ? [{ label: item.label, result: item.result }] : []))
    const results = succeeded.map((item) => item.result)
    const found = holdingsFromScreenshots(results)
    // Checked against the totals the screens show; the totals themselves are never imported.
    const warnings = totalsThatDontAddUp(results).map(({ index, total }) => totalWarning(succeeded[index].label, total, reads.length === 1))

    const notes: string[] = []
    for (const item of reads) {
      if (!item.ok) notes.push(`${item.label}: ${item.error}`)
      else if (item.result.problem !== "none" || item.result.rows.length === 0) notes.push(problemMessage("holdings", item.result.problem, item.label))
    }
    if (tooMany > 0) notes.push(`Only the first ${MAX_SCREENSHOTS} screenshots were read. Add the rest next.`)
    if (found.repeated > 0) notes.push(`${count(found.repeated, "holding showed", "holdings showed")} up in more than one screenshot and ${found.repeated === 1 ? "was" : "were"} counted once.`)
    if (found.combined > 0) notes.push(`${count(found.combined, "fund appeared", "funds appeared")} with different values in different places, so the amounts were added together (one fund in two accounts). Fix the value if that's wrong.`)
    if (found.skipped.noSymbol > 0) notes.push(`${count(found.skipped.noSymbol, "investment was", "investments were")} shown without a ticker, as 401(k) plans often do, and left out. Add ${found.skipped.noSymbol === 1 ? "it" : "them"} by hand.`)
    if (found.needPrices > 0) notes.push(`${count(found.needPrices, "holding has", "holdings have")} shares but no value. Use Refresh prices after importing.`)
    if (found.dropped > 0) notes.push(`Sprout keeps up to ${found.holdings.length} holdings, so the ${found.dropped} smallest were left out.`)

    const rows = found.holdings.map((holding, index) => ({ ...holding, id: index, include: true, valueText: holding.value.toFixed(2) }))
    setReview({ rows, notes, warnings, key: Date.now() })
  }

  const panel = review && (
    <HoldingsScreenshotReview
      key={review.key}
      rows={review.rows}
      notes={review.notes}
      warnings={review.warnings}
      onCancel={() => setReview(null)}
      onConfirm={(holdings) => {
        onImport(holdings, "update", "your screenshots", holdings.filter((holding) => holding.value === 0 && holding.shares !== null).length)
        setReview(null)
      }}
    />
  )

  return { pick, progress, panel }
}

function HoldingsScreenshotReview({
  rows: initial,
  notes,
  warnings,
  onConfirm,
  onCancel,
}: {
  rows: Row[]
  notes: string[]
  warnings: string[]
  onConfirm: (holdings: ImportedHolding[]) => void
  onCancel: () => void
}) {
  const [rows, setRows] = useState(initial)
  const headingId = useId()
  const update = (id: number, patch: Partial<Row>) => setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)))

  const included = rows.filter((row) => row.include)
  const invalid = included.filter((row) => !row.symbol || valueOf(row) === null).length
  const total = included.reduce((sum, row) => sum + (valueOf(row) ?? 0), 0)

  return (
    <section aria-labelledby={headingId} className="animate-rise w-full basis-full space-y-4 rounded-xl border bg-background p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
          <ImageIcon className="size-4.5" aria-hidden="true" />
        </span>
        <div>
          <h3 id={headingId} className="font-sans text-sm font-semibold">
            {rows.length > 0 ? "Check what was read" : "No holdings to add"}
          </h3>
          {rows.length > 0 && (
            <p className="figures text-sm text-muted-foreground">
              {included.length} of {rows.length} to add · {formatMoney(total)}
            </p>
          )}
        </div>
      </div>

      {rows.length > 0 &&
        warnings.map((warning) => (
          <p key={warning} className="flex gap-1.5 rounded-lg bg-warning/10 px-2.5 py-2 text-xs text-[#8a611b]">
            <TriangleAlertIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            {warning}
          </p>
        ))}

      {notes.length > 0 && (
        <ul className="space-y-1.5 text-xs text-muted-foreground">
          {notes.map((note) => (
            <li key={note} className="flex gap-1.5">
              <InfoIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
              {note}
            </li>
          ))}
        </ul>
      )}

      {rows.length > 0 && (
        <ul className="divide-y rounded-lg border" aria-label="Holdings read from your screenshots">
          {rows.map((row) => (
            <li key={row.id} className={cn("flex items-center gap-3 px-3 py-2.5", !row.include && "bg-surface/60")}>
              <input
                type="checkbox"
                checked={row.include}
                onChange={(event) => update(row.id, { include: event.target.checked })}
                aria-label={`Add ${row.symbol || "this holding"}`}
                className="size-4 shrink-0 accent-[#216B47]"
              />
              {/* On a phone the name goes under the symbol and value, which keeps it readable. */}
              <div
                className={cn(
                  "grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_7.5rem] items-center gap-2 sm:grid-cols-[5.5rem_minmax(0,1fr)_7.5rem]",
                  !row.include && "opacity-60"
                )}
              >
                <Input
                  value={row.symbol}
                  onChange={(event) => update(row.id, { symbol: cleanSymbol(event.target.value) })}
                  aria-label={`Symbol for ${row.name || row.symbol}`}
                  aria-invalid={row.include && !row.symbol}
                  className="font-medium uppercase"
                />
                <span className="order-last col-span-2 min-w-0 text-sm sm:order-none sm:col-span-1">
                  <span className="block truncate" title={row.name}>
                    {row.name || "—"}
                  </span>
                  <span className="text-xs text-muted-foreground">{ASSET_CLASSES[row.assetClass]}</span>
                </span>
                <Input
                  inputMode="decimal"
                  value={row.valueText}
                  onChange={(event) => update(row.id, { valueText: event.target.value })}
                  aria-label={`Value of ${row.symbol}`}
                  aria-invalid={row.include && valueOf(row) === null}
                  className="figures text-right"
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {invalid > 0 && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-[#a33b3b]">
          {invalid === 1 ? "One ticked holding needs" : `${invalid} ticked holdings need`} a symbol and a value.
        </p>
      )}
      {rows.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Types are a best guess from the fund or company name. Holdings already in your list with the same symbol are updated;
          nothing else is removed.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {rows.length > 0 && (
          <Button
            type="button"
            size="sm"
            disabled={included.length === 0 || invalid > 0}
            onClick={() => onConfirm(included.map((row) => ({ symbol: row.symbol, name: row.name, assetClass: row.assetClass, shares: row.shares, value: valueOf(row) ?? 0 })))}
          >
            Import {included.length} {included.length === 1 ? "holding" : "holdings"}
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {rows.length > 0 ? "Cancel" : "Close"}
        </Button>
      </div>
    </section>
  )
}
