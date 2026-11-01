"use client"

import { useId, useRef, useState, type DragEvent } from "react"
import { CloudUploadIcon, FileSpreadsheetIcon, InfoIcon, UploadIcon } from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { formatMoney } from "@/lib/format"
import { ASSET_CLASSES } from "@/lib/portfolio/funds"
import {
  importHoldingsFromCsvFiles,
  MAX_CSV_BYTES,
  MAX_CSV_FILES,
  type HoldingsImport,
  type ImportMode,
  type ImportedHolding,
} from "@/lib/portfolio/csv-import"
import { importLabel } from "@/lib/finance/transactions"

type Preview = { fileNames: string[]; result: Extract<HoldingsImport, { ok: true }> }

/**
 * Reads one or more brokerage positions CSVs in the browser (one per account or brokerage), shows
 * what they hold together, and hands the holdings to the page once the person confirms. The files
 * themselves are never uploaded.
 */
export function HoldingsImport({
  hasHoldings,
  onImport,
  variant = "button",
}: {
  hasHoldings: boolean
  onImport: (holdings: ImportedHolding[], mode: ImportMode, fileName: string, needPrices: number) => void
  /** "dropzone" is the larger box for the empty state. */
  variant?: "button" | "dropzone"
}) {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function readFiles(list: File[]) {
    setErrors([])
    if (list.length === 0) return
    const picked = list.slice(0, MAX_CSV_FILES)
    const named = (fileName: string, message: string) => (picked.length > 1 ? `${fileName}: ${message}` : message)
    const problems: string[] = []
    const texts: { fileName: string; text: string }[] = []
    for (const file of picked) {
      if (!/\.(csv|txt)$/i.test(file.name) && file.type !== "text/csv") {
        problems.push(named(file.name, "Choose a .csv file exported from your brokerage."))
        continue
      }
      if (file.size > MAX_CSV_BYTES) {
        problems.push(named(file.name, "That file is over 2 MB. Export just your positions and try again."))
        continue
      }
      try {
        texts.push({ fileName: file.name, text: await file.text() })
      } catch {
        problems.push(named(file.name, "Couldn't read that file. Try exporting it again."))
      }
    }
    const { result, used, errors: unreadable } = importHoldingsFromCsvFiles(texts)
    problems.push(...unreadable.map((item) => named(item.fileName, item.error)))
    if (list.length > picked.length) {
      problems.push(`Sprout reads up to ${MAX_CSV_FILES} files at a time, so only the first ${MAX_CSV_FILES} were read.`)
    }
    setErrors(problems)
    setPreview(result ? { fileNames: used, result } : null)
  }

  function onDrop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    void readFiles([...event.dataTransfer.files])
  }

  const dragProps = {
    onDragOver: (event: DragEvent) => {
      event.preventDefault()
      setDragging(true)
    },
    onDragLeave: () => setDragging(false),
    onDrop,
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
    <div role="alert" className="mt-3 space-y-1 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-[#a33b3b]">
      {errors.map((message) => (
        <p key={message} className="break-words">
          {message}
        </p>
      ))}
    </div>
  )

  if (preview) {
    return (
      <ImportPreview
        preview={preview}
        hasHoldings={hasHoldings}
        onConfirm={(mode) => {
          onImport(preview.result.holdings, mode, importLabel(preview.fileNames), preview.result.needPrices)
          setPreview(null)
        }}
        onCancel={() => setPreview(null)}
      />
    )
  }

  if (variant === "dropzone") {
    return (
      <div
        {...dragProps}
        className={cn(
          "flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors",
          dragging ? "border-brand bg-secondary" : "border-border"
        )}
      >
        {fileInput}
        <span className="flex size-11 items-center justify-center rounded-xl bg-secondary text-primary">
          <CloudUploadIcon className="size-5" aria-hidden="true" />
        </span>
        <div>
          <p className="font-semibold">Import from your brokerage</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Drop positions CSVs here, or choose them: one per account is fine. Works with Fidelity, Schwab, Vanguard, E*TRADE and simple spreadsheets.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button type="button" onClick={() => inputRef.current?.click()}>
            <UploadIcon />
            Choose CSV files
          </Button>
          <a href="/sample-holdings.csv" download className="inline-flex min-h-9 items-center px-2 text-sm font-medium text-primary underline underline-offset-2">
            Try a sample file
          </a>
        </div>
        <PrivacyNote />
        {errorMessage}
      </div>
    )
  }

  // Placed in a row of buttons: the error takes a line of its own below them (basis-full).
  return (
    <>
      {fileInput}
      <div {...dragProps} className={cn("rounded-lg transition-colors", dragging && "bg-secondary ring-2 ring-brand")}>
        <Button type="button" size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
          <UploadIcon />
          Import CSV
        </Button>
      </div>
      {errorMessage && <div className="basis-full">{errorMessage}</div>}
    </>
  )
}

function PrivacyNote() {
  return (
    <p className="max-w-md text-xs text-muted-foreground">
      Files are read in your browser and aren&apos;t uploaded. Only the holdings are saved, on this device and in your account if
      you&apos;re logged in.
    </p>
  )
}

function ImportPreview({
  preview,
  hasHoldings,
  onConfirm,
  onCancel,
}: {
  preview: Preview
  hasHoldings: boolean
  onConfirm: (mode: ImportMode) => void
  onCancel: () => void
}) {
  // "Update and add" never deletes anything, so it's the default; replacing is a deliberate choice.
  const [mode, setMode] = useState<ImportMode>("update")
  const headingId = useId()
  const { result } = preview
  const total = result.holdings.reduce((sum, holding) => sum + holding.value, 0)
  const shown = result.holdings.slice(0, 6)
  const fileWord = preview.fileNames.length === 1 ? "file" : "files"

  const notes: string[] = []
  if (result.combined > 0) {
    notes.push(
      result.combined === 1
        ? "1 holding was in more than one account, so its amounts were added together."
        : `${result.combined} holdings were in more than one account, so their amounts were added together.`
    )
  }
  if (result.needPrices > 0) {
    notes.push(
      `${result.needPrices} ${result.needPrices === 1 ? "holding is" : "holdings are"} missing a value in the ${fileWord}. Use Refresh prices after importing to work ${result.needPrices === 1 ? "it" : "them"} out from the shares.`
    )
  }
  if (result.dropped > 0) notes.push(`Sprout keeps up to ${result.holdings.length} holdings, so the ${result.dropped} smallest were left out.`)
  const { totals, pending, noSymbol, negative, noValue, outOfRange } = result.skipped
  const skippedParts = [
    totals > 0 && `${totals} total ${totals === 1 ? "row" : "rows"}`,
    pending > 0 && "pending activity",
    noSymbol > 0 && `${noSymbol} without a ticker (like options)`,
    negative > 0 && `${negative} short or negative`,
    noValue > 0 && `${noValue} with no value`,
    outOfRange > 0 && `${outOfRange} with a value too large to be real`,
  ].filter(Boolean)
  if (skippedParts.length > 0) notes.push(`Left out: ${skippedParts.join(", ")}.`)

  return (
    <section aria-labelledby={headingId} className="animate-rise w-full basis-full space-y-4 rounded-xl border bg-background p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
          <FileSpreadsheetIcon className="size-4.5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 id={headingId} className="truncate font-sans text-sm font-semibold" title={preview.fileNames.join(", ")}>
            {preview.fileNames.length === 1 ? preview.fileNames[0] : `${preview.fileNames.length} files`}
          </h3>
          {preview.fileNames.length > 1 && (
            <p className="truncate text-xs text-muted-foreground" title={preview.fileNames.join(", ")}>
              {preview.fileNames.join(", ")}
            </p>
          )}
          <p className="figures text-sm text-muted-foreground">
            {result.holdings.length} {result.holdings.length === 1 ? "holding" : "holdings"} · {formatMoney(total)}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="figures w-full text-left text-sm">
          <caption className="sr-only">Holdings found in the {fileWord}</caption>
          <thead className="bg-surface text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Symbol</th>
              <th scope="col" className="hidden px-3 py-2 font-medium sm:table-cell">Name</th>
              <th scope="col" className="px-3 py-2 font-medium">Type</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Value</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((holding) => (
              <tr key={holding.symbol} className="border-t">
                <td className="px-3 py-2 font-medium">{holding.symbol}</td>
                <td className="hidden max-w-56 truncate px-3 py-2 text-muted-foreground sm:table-cell">{holding.name}</td>
                <td className="px-3 py-2 text-muted-foreground">{ASSET_CLASSES[holding.assetClass]}</td>
                <td className="px-3 py-2 text-right">{holding.value > 0 ? formatMoney(holding.value) : "Needs price"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {result.holdings.length > shown.length && (
          <p className="border-t px-3 py-2 text-xs text-muted-foreground">and {result.holdings.length - shown.length} more</p>
        )}
      </div>

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
      <p className="text-xs text-muted-foreground">
        Types are a best guess from the fund name or the {fileWord}. Check them in the list after importing.
      </p>

      {hasHoldings && (
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium">You already have holdings saved</legend>
          {(
            [
              ["update", "Update and add", `Holdings in the ${fileWord} update the same symbol in your list. Everything else you added stays.`],
              ["replace", `Replace my list with ${preview.fileNames.length === 1 ? "this file" : "these files"}`, `Anything not in the ${fileWord}, like savings you added by hand, is removed.`],
            ] as const
          ).map(([value, label, help]) => (
            <label
              key={value}
              className={cn(
                "flex cursor-pointer gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/25",
                mode === value ? "border-brand bg-secondary/60" : "hover:bg-muted"
              )}
            >
              <input
                type="radio"
                name="import-mode"
                value={value}
                checked={mode === value}
                onChange={() => setMode(value)}
                className="mt-0.5 accent-[#216B47]"
              />
              <span>
                <span className="block font-medium">{label}</span>
                <span className="block text-xs text-muted-foreground">{help}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => onConfirm(hasHoldings ? mode : "replace")}>
          Import {result.holdings.length} {result.holdings.length === 1 ? "holding" : "holdings"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </section>
  )
}
