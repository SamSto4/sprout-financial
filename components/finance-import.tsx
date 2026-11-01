"use client"

import { useId, useImperativeHandle, useMemo, useRef, useState, type DragEvent, type Ref } from "react"
import {
  ArrowLeftRightIcon,
  CloudUploadIcon,
  FileSpreadsheetIcon,
  InfoIcon,
  SparklesIcon,
  TriangleAlertIcon,
  UploadIcon,
} from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { importTransactionsFromCsv, MAX_CSV_BYTES, MAX_CSV_FILES, type CsvImport } from "@/lib/finance/csv"
import {
  combineTransactions,
  importLabel,
  MAX_TRANSACTIONS,
  summarizeTransactions,
  type ImportedFinances,
  type Transaction,
} from "@/lib/finance/transactions"
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

/** One file read for the preview. Signs flip per file: a card export often needs it when checking doesn't. */
type PreviewFile = {
  fileName: string
  text: string
  flipped: boolean
  result: Extract<CsvImport, { ok: true }>
}

/** "add" keeps what's saved and adds what's new in the files; "replace" starts again from the files. */
type ImportMode = "add" | "replace"

/** Lets a parent hand over files dropped elsewhere on the page. */
export type FinanceImportHandle = { importFiles: (files: File[]) => void }

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
  const [preview, setPreview] = useState<PreviewFile[] | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const headingId = useId()

  useImperativeHandle(ref, () => ({ importFiles: (files: File[]) => void readFiles(files) }))

  /** Reads one file, or says what's wrong with it. */
  async function readFile(file: File): Promise<PreviewFile | string> {
    if (!/\.(csv|txt)$/i.test(file.name) && file.type !== "text/csv") {
      return "Choose a .csv file exported from your bank or budgeting app."
    }
    if (file.size > MAX_CSV_BYTES) return "That file is over 2 MB. Export a shorter date range and try again."
    let text: string
    try {
      text = await file.text()
    } catch {
      return "Couldn't read that file. Try exporting it again."
    }
    const result = importTransactionsFromCsv(text)
    return result.ok ? { fileName: file.name, text, flipped: false, result } : result.error
  }

  /** Reads every file picked or dropped. One that can't be used is named, and the rest still preview. */
  async function readFiles(list: File[]) {
    setErrors([])
    if (list.length === 0) return
    const picked = list.slice(0, MAX_CSV_FILES)
    const problems: string[] = []
    const files: PreviewFile[] = []
    for (const file of picked) {
      const read = await readFile(file)
      if (typeof read === "string") problems.push(picked.length > 1 ? `${file.name}: ${read}` : read)
      else files.push(read)
    }
    if (list.length > picked.length) {
      problems.push(`Sprout reads up to ${MAX_CSV_FILES} files at a time, so only the first ${MAX_CSV_FILES} were read.`)
    }
    setErrors(problems)
    setPreview(files.length > 0 ? files : null)
  }

  function flipSigns(index: number) {
    if (!preview) return
    const file = preview[index]
    const result = importTransactionsFromCsv(file.text, { flipSigns: !file.flipped })
    if (!result.ok) return
    setPreview(preview.map((item, i) => (i === index ? { ...file, flipped: !file.flipped, result } : item)))
  }

  function confirm(mode: ImportMode) {
    if (!preview) return
    // Read the saved copy again rather than the one on screen: it may have changed while the preview was open.
    const saved = financesStore.get()
    const base = mode === "add" ? saved : null
    const combined = combineTransactions(
      base?.transactions ?? [],
      preview.map((file) => file.result.transactions)
    )
    onImport({
      fileName: importLabel(
        preview.map((file) => file.fileName),
        base?.fileName
      ),
      // Stamped later than the saved copy either way, so this import wins when synced (lib/sync/stamp.ts).
      importedAt: nextStamp(saved?.importedAt, new Date()),
      transactions: combined.transactions,
    })
    setPreview(null)
  }

  function onDrop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    void readFiles([...event.dataTransfer.files])
  }

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept=".csv,text/csv"
      multiple
      className="sr-only"
      tabIndex={-1}
      aria-hidden="true"
      onChange={(event) => {
        const files = [...(event.target.files ?? [])]
        event.target.value = ""
        void readFiles(files)
      }}
    />
  )

  const errorMessage = errors.length > 0 && (
    <div role="alert" className="space-y-1 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-[#a33b3b]">
      {errors.map((message) => (
        <p key={message} className="break-words">
          {message}
        </p>
      ))}
    </div>
  )

  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <h2 id={headingId} className="flex items-center gap-2 font-sans text-sm font-semibold">
        <FileSpreadsheetIcon className="size-4 text-primary" aria-hidden="true" />
        Your finances
      </h2>
      {fileInput}

      {preview ? (
        <PreviewCard
          files={preview}
          saved={finances}
          onConfirm={confirm}
          onFlip={flipSigns}
          onCancel={() => setPreview(null)}
        />
      ) : finances ? (
        <ImportedCard
          finances={finances}
          onAskForTips={onAskForTips}
          onChooseFiles={() => inputRef.current?.click()}
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
            <p className="text-lg font-semibold">Drop your CSV files here</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Exports from your bank or budgeting app, up to 2 MB each. Add checking and card exports together.
            </p>
          </div>
          <Button type="button" size="lg" className="h-10 px-4" onClick={() => inputRef.current?.click()}>
            <UploadIcon />
            Choose files
          </Button>
          <a href="/sample-transactions.csv" download className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-2">
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
            Choose CSV files
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            or drop them here ·{" "}
            <a href="/sample-transactions.csv" download className="font-medium text-primary underline underline-offset-2">
              try a sample file
            </a>
          </p>
        </div>
      )}

      {errorMessage}
      {!finances && (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Files stay on this device, and in your account if you&apos;re logged in. They&apos;re only sent to the
          assistant when you ask a question or request a review.
        </p>
      )}
    </section>
  )
}

function PreviewCard({
  files,
  saved,
  onConfirm,
  onFlip,
  onCancel,
}: {
  files: PreviewFile[]
  /** What's saved now, if anything: adding to it is offered, and is the default. */
  saved: ImportedFinances | null
  onConfirm: (mode: ImportMode) => void
  onFlip: (index: number) => void
  onCancel: () => void
}) {
  const [mode, setMode] = useState<ImportMode>("add")
  const modeName = useId()
  const effectiveMode: ImportMode = saved ? mode : "replace"
  // The same combining the save does (confirm), so the preview shows what will be kept.
  const combined = useMemo(
    () =>
      combineTransactions(
        effectiveMode === "add" ? (saved?.transactions ?? []) : [],
        files.map((file) => file.result.transactions)
      ),
    [effectiveMode, saved, files]
  )
  const added = combined.added
  const summary = summarizeTransactions(added)
  const newest = [...added].sort((a, b) => b.date.localeCompare(a.date))

  const notes: string[] = []
  if (combined.duplicates > 0) {
    const where = effectiveMode === "add" ? "already saved or in another of these files" : "in more than one of these files"
    notes.push(
      combined.duplicates === 1
        ? `1 transaction was ${where}, so it's counted once.`
        : `${combined.duplicates.toLocaleString()} transactions were ${where}, so they're counted once.`
    )
  }
  if (combined.dropped > 0) {
    notes.push(
      `Sprout keeps the most recent ${MAX_TRANSACTIONS.toLocaleString()} transactions, so ${combined.dropped.toLocaleString()} older ${combined.dropped === 1 ? "one was" : "ones were"} left out.`
    )
  }

  const confirmLabel =
    effectiveMode === "add"
      ? `Add ${added.length.toLocaleString()} ${added.length === 1 ? "transaction" : "transactions"}`
      : files.length === 1
        ? "Use this file"
        : "Use these files"

  return (
    <div className="animate-rise space-y-3 rounded-xl border bg-background p-3.5 text-xs">
      <div>
        <p className="truncate text-sm font-medium" title={files.map((file) => file.fileName).join(", ")}>
          {files.length === 1 ? files[0].fileName : `${files.length} files`}
        </p>
        <p className="text-muted-foreground">
          {added.length > 0
            ? `${added.length.toLocaleString()} new ${added.length === 1 ? "transaction" : "transactions"} · ${dateRange(added)}`
            : "Nothing new: every transaction is already saved."}
        </p>
      </div>

      <ul className="space-y-2" aria-label="Files">
        {files.map((file, index) => {
          const { result } = file
          // Credit card and some bank exports list purchases as positive numbers.
          const looksFlipped = result.transactions.every((transaction) => transaction.amount >= 0)
          const columns = [result.columns.date, result.columns.description, result.columns.amount, result.columns.category]
            .filter(Boolean)
            .join(" · ")
          return (
            <li key={`${file.fileName}-${index}`} className="space-y-1.5 rounded-lg border px-2.5 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {files.length > 1 && (
                    <p className="truncate font-medium" title={file.fileName}>
                      {file.fileName}
                    </p>
                  )}
                  <p className="text-muted-foreground">
                    {result.transactions.length.toLocaleString()} rows · {dateRange(result.transactions)}
                  </p>
                </div>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => onFlip(index)}
                  aria-pressed={file.flipped}
                  aria-label={files.length > 1 ? `Flip signs in ${file.fileName}` : undefined}
                >
                  <ArrowLeftRightIcon />
                  Flip signs
                </Button>
              </div>
              <p className="text-muted-foreground">
                Read columns: <span className="text-foreground">{columns}</span>
                {result.skippedRows > 0 && ` · ${result.skippedRows} unreadable rows skipped`}
                {result.truncated && " · only the most recent 2,000 kept"}
              </p>
              {looksFlipped && (
                <p className="flex gap-1.5 rounded-md bg-warning/10 px-2 py-1.5 text-[#8a611b]">
                  <TriangleAlertIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                  Every amount counts as money in. If this is a card or spending export, flip the signs.
                </p>
              )}
            </li>
          )
        })}
      </ul>

      {summary && (
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
      )}

      {newest.length > 0 && (
        <ul className="divide-y rounded-lg border" aria-label="Most recent new transactions">
          {newest.slice(0, 3).map((transaction, index) => (
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
      )}

      {notes.length > 0 && (
        <ul className="space-y-1 text-muted-foreground">
          {notes.map((note) => (
            <li key={note} className="flex gap-1.5">
              <InfoIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
              {note}
            </li>
          ))}
        </ul>
      )}

      {saved && (
        <fieldset className="space-y-1.5">
          <legend className="mb-1 font-medium">You already have transactions saved</legend>
          {(
            [
              ["add", "Add to my transactions", `Keeps ${saved.fileName} and adds anything new from ${files.length === 1 ? "this file" : "these files"}.`],
              ["replace", "Replace them", `Your saved transactions are removed and ${files.length === 1 ? "this file takes" : "these files take"} their place.`],
            ] as const
          ).map(([value, label, help]) => (
            <label
              key={value}
              className={cn(
                "flex cursor-pointer gap-2 rounded-lg border px-2.5 py-2 transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/25",
                mode === value ? "border-brand bg-secondary/60" : "hover:bg-muted"
              )}
            >
              <input
                type="radio"
                name={modeName}
                value={value}
                checked={mode === value}
                onChange={() => setMode(value)}
                className="mt-0.5 accent-[#216B47]"
              />
              <span className="min-w-0">
                <span className="block font-medium">{label}</span>
                <span className="block break-words text-muted-foreground">{help}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => onConfirm(effectiveMode)} disabled={added.length === 0}>
          {confirmLabel}
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
  onChooseFiles,
  onRemove,
}: {
  finances: ImportedFinances
  onAskForTips: () => void
  /** Opens the file picker; the preview then offers adding to these transactions or replacing them. */
  onChooseFiles: () => void
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
        <Button type="button" size="xs" variant="ghost" onClick={onChooseFiles}>
          <UploadIcon />
          Add or replace files
        </Button>
        <Button type="button" size="xs" variant="ghost" className="text-[#a33b3b]" onClick={onRemove}>
          Remove
        </Button>
      </div>
    </div>
  )
}
