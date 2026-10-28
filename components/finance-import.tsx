"use client"

import { useId, useImperativeHandle, useRef, useState, type DragEvent, type Ref } from "react"
import {
  ArrowLeftRightIcon,
  CloudUploadIcon,
  FileSpreadsheetIcon,
  SparklesIcon,
  TriangleAlertIcon,
  UploadIcon,
} from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { importTransactionsFromCsv, MAX_CSV_BYTES, type CsvImport } from "@/lib/finance/csv"
import { summarizeTransactions, type ImportedFinances, type Transaction } from "@/lib/finance/transactions"
import { formatMoney } from "@/lib/format"
import { financesStore } from "@/lib/stores"
import { nextStamp } from "@/lib/sync/stamp"

const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })

function formatDate(isoDate: string) {
  return shortDate.format(new Date(`${isoDate}T00:00:00Z`))
}

function dateRange(transactions: Transaction[]) {
  const dates = transactions.map((transaction) => transaction.date).sort()
  return `${formatDate(dates[0])} – ${formatDate(dates[dates.length - 1])}`
}

type Preview = {
  fileName: string
  text: string
  flipped: boolean
  result: Extract<CsvImport, { ok: true }>
}

/** Lets a parent hand over a file dropped elsewhere on the page. */
export type FinanceImportHandle = { importFile: (file: File) => void }

export function FinanceImport({
  finances,
  onImport,
  onRemove,
  onAskForTips,
  size = "compact",
  ref,
}: {
  finances: ImportedFinances | null
  onImport: (finances: ImportedFinances) => void
  onRemove: () => void
  onAskForTips: () => void
  /** "large" gives the empty state a big drop zone, for use as a page's main call to action. */
  size?: "compact" | "large"
  ref?: Ref<FinanceImportHandle>
}) {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const headingId = useId()

  useImperativeHandle(ref, () => ({ importFile: (file: File) => void readFile(file) }))

  async function readFile(file: File) {
    setError(null)
    if (!/\.(csv|txt)$/i.test(file.name) && file.type !== "text/csv") {
      setError("Choose a .csv file exported from your bank or budgeting app.")
      return
    }
    if (file.size > MAX_CSV_BYTES) {
      setError("That file is over 2 MB. Export a shorter date range and try again.")
      return
    }
    let text: string
    try {
      text = await file.text()
    } catch {
      setError("Couldn't read that file. Try exporting it again.")
      return
    }
    const result = importTransactionsFromCsv(text)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setPreview({ fileName: file.name, text, flipped: false, result })
  }

  function flipSigns() {
    if (!preview) return
    const result = importTransactionsFromCsv(preview.text, { flipSigns: !preview.flipped })
    if (result.ok) setPreview({ ...preview, flipped: !preview.flipped, result })
  }

  function confirm() {
    if (!preview) return
    onImport({
      fileName: preview.fileName,
      // A new import replaces the saved one, so it's stamped later than it (lib/sync/stamp.ts).
      importedAt: nextStamp(financesStore.get()?.importedAt, new Date()),
      transactions: preview.result.transactions,
    })
    setPreview(null)
  }

  function onDrop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files[0]
    if (file) readFile(file)
  }

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept=".csv,text/csv"
      className="sr-only"
      tabIndex={-1}
      aria-hidden="true"
      onChange={(event) => {
        const file = event.target.files?.[0]
        event.target.value = ""
        if (file) readFile(file)
      }}
    />
  )

  const errorMessage = error && (
    <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-[#a33b3b]">
      {error}
    </p>
  )

  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <h2 id={headingId} className="flex items-center gap-2 font-sans text-sm font-semibold">
        <FileSpreadsheetIcon className="size-4 text-primary" aria-hidden="true" />
        Your finances
      </h2>
      {fileInput}

      {preview ? (
        <PreviewCard preview={preview} onConfirm={confirm} onFlip={flipSigns} onCancel={() => setPreview(null)} />
      ) : finances ? (
        <ImportedCard
          finances={finances}
          onAskForTips={onAskForTips}
          onReplace={() => inputRef.current?.click()}
          onRemove={onRemove}
        />
      ) : size === "large" ? (
        <div
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed bg-background px-6 py-10 text-center transition-colors",
            dragging ? "border-brand bg-secondary" : "border-border"
          )}
        >
          <span className="flex size-14 items-center justify-center rounded-2xl bg-secondary text-primary">
            <CloudUploadIcon className="size-7" aria-hidden="true" />
          </span>
          <div>
            <p className="text-lg font-semibold">Drop your CSV file here</p>
            <p className="mt-1 text-sm text-muted-foreground">An export from your bank or budgeting app, up to 2 MB</p>
          </div>
          <Button type="button" size="lg" className="h-10 px-4" onClick={() => inputRef.current?.click()}>
            <UploadIcon />
            Choose a file
          </Button>
          <a href="/sample-transactions.csv" download className="text-sm font-medium text-primary underline underline-offset-2">
            No file handy? Try a sample
          </a>
        </div>
      ) : (
        <div
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "space-y-3 rounded-xl border border-dashed bg-background p-3.5 transition-colors",
            dragging && "border-brand bg-secondary"
          )}
        >
          <p className="text-xs leading-relaxed text-muted-foreground">
            Import a CSV export from your bank or budgeting app, and the assistant can give tips based on your
            real income and spending.
          </p>
          <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => inputRef.current?.click()}>
            <UploadIcon />
            Choose a CSV file
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            or drop it here ·{" "}
            <a href="/sample-transactions.csv" download className="font-medium text-primary underline underline-offset-2">
              try a sample file
            </a>
          </p>
        </div>
      )}

      {errorMessage}
      {!finances && (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          The file stays on this device, and in your account if you&apos;re logged in. It&apos;s only sent to the
          assistant when you ask a question or request a review.
        </p>
      )}
    </section>
  )
}

function PreviewCard({
  preview,
  onConfirm,
  onFlip,
  onCancel,
}: {
  preview: Preview
  onConfirm: () => void
  onFlip: () => void
  onCancel: () => void
}) {
  const { result } = preview
  const summary = summarizeTransactions(result.transactions)!
  // Credit card and some bank exports list purchases as positive numbers.
  const looksFlipped = result.transactions.every((transaction) => transaction.amount >= 0)
  const columns = [result.columns.date, result.columns.description, result.columns.amount, result.columns.category]
    .filter(Boolean)
    .join(" · ")

  return (
    <div className="animate-rise space-y-3 rounded-xl border bg-background p-3.5 text-xs">
      <div>
        <p className="truncate text-sm font-medium" title={preview.fileName}>
          {preview.fileName}
        </p>
        <p className="text-muted-foreground">
          {result.transactions.length.toLocaleString()} transactions · {dateRange(result.transactions)}
        </p>
      </div>

      <dl className="figures grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-surface px-2.5 py-2">
          <dt className="text-muted-foreground">Money in</dt>
          <dd className="text-sm font-semibold text-primary">{formatMoney(summary.totals.income)}</dd>
        </div>
        <div className="rounded-lg bg-surface px-2.5 py-2">
          <dt className="text-muted-foreground">Money out</dt>
          <dd className="text-sm font-semibold">{formatMoney(summary.totals.spending)}</dd>
        </div>
      </dl>

      <ul className="divide-y rounded-lg border" aria-label="First few transactions">
        {result.transactions.slice(0, 3).map((transaction, index) => (
          <li key={index} className="flex items-baseline justify-between gap-2 px-2.5 py-1.5">
            <span className="min-w-0">
              <span className="block truncate">{transaction.description}</span>
              <span className="text-[11px] text-muted-foreground">{formatDate(transaction.date)}</span>
            </span>
            <span className={cn("figures shrink-0 font-medium", transaction.amount >= 0 && "text-primary")}>
              {transaction.amount >= 0 ? "+" : "−"}
              {formatMoney(Math.abs(transaction.amount))}
            </span>
          </li>
        ))}
      </ul>

      <p className="text-muted-foreground">
        Read columns: <span className="text-foreground">{columns}</span>
        {result.skippedRows > 0 && ` · ${result.skippedRows} unreadable rows skipped`}
        {result.truncated && " · only the most recent 2,000 kept"}
      </p>

      {looksFlipped && (
        <p className="flex gap-1.5 rounded-lg bg-warning/10 px-2.5 py-2 text-[#8a611b]">
          <TriangleAlertIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          Every amount counts as money in. If this is a card or spending export, flip the signs.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={onConfirm}>
          Use this file
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onFlip} aria-pressed={preview.flipped}>
          <ArrowLeftRightIcon />
          Flip signs
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

function ImportedCard({
  finances,
  onAskForTips,
  onReplace,
  onRemove,
}: {
  finances: ImportedFinances
  onAskForTips: () => void
  onReplace: () => void
  onRemove: () => void
}) {
  const summary = summarizeTransactions(finances.transactions)!

  return (
    <div className="space-y-3 rounded-xl border bg-background p-3.5 text-xs">
      <div>
        <p className="truncate text-sm font-medium" title={finances.fileName}>
          {finances.fileName}
        </p>
        <p className="text-muted-foreground">
          {finances.transactions.length.toLocaleString()} transactions · {dateRange(finances.transactions)}
        </p>
      </div>

      <dl className="figures grid grid-cols-3 gap-1.5 text-center">
        {[
          { label: "In / mo", value: summary.monthlyAverage.income, tone: "text-primary" },
          { label: "Out / mo", value: summary.monthlyAverage.spending, tone: "" },
          {
            label: "Left / mo",
            value: summary.monthlyAverage.net,
            tone: summary.monthlyAverage.net < 0 ? "text-[#a33b3b]" : "text-primary",
          },
        ].map((item) => (
          <div key={item.label} className="rounded-lg bg-surface px-1.5 py-2">
            <dt className="text-[11px] text-muted-foreground">{item.label}</dt>
            <dd className={cn("text-[13px] font-semibold", item.tone)}>{formatMoney(item.value)}</dd>
          </div>
        ))}
      </dl>

      <Button type="button" size="sm" className="w-full" onClick={onAskForTips}>
        <SparklesIcon />
        Get investing tips
      </Button>
      <div className="flex justify-between">
        <Button type="button" size="xs" variant="ghost" onClick={onReplace}>
          Replace file
        </Button>
        <Button type="button" size="xs" variant="ghost" className="text-[#a33b3b]" onClick={onRemove}>
          Remove
        </Button>
      </div>
    </div>
  )
}
