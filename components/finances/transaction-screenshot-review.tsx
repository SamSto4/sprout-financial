"use client"

import { useId, useState } from "react"
import { ArrowLeftRightIcon, ImageIcon, InfoIcon, TriangleAlertIcon } from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { parseTransactions, type Transaction } from "@/lib/finance/transactions"
import { formatMoney } from "@/lib/format"
import type { ReviewTransaction } from "@/lib/screenshots/transaction-rows"

type Row = ReviewTransaction & { amountText: string }

const DATE = /^\d{4}-\d{2}-\d{2}$/

function amountOf(row: Row) {
  const value = Number(row.amountText.replace(/[$,\s]/g, ""))
  return row.amountText.trim() && Number.isFinite(value) ? value : null
}

const isValid = (row: Row) => DATE.test(row.date) && row.description.trim() !== "" && amountOf(row) !== null

/**
 * Every transaction read from the screenshots, editable, before anything is saved. Likely
 * duplicates start unticked; money out is negative, as everywhere else in the app.
 */
export function TransactionScreenshotReview({
  rows: initial,
  notes,
  onConfirm,
  onCancel,
}: {
  rows: ReviewTransaction[]
  notes: string[]
  onConfirm: (transactions: Transaction[]) => void
  onCancel: () => void
}) {
  const [rows, setRows] = useState<Row[]>(() => initial.map((row) => ({ ...row, amountText: row.amount.toFixed(2) })))
  const headingId = useId()

  const update = (id: string, patch: Partial<Row>) => setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  const flipSigns = () =>
    setRows((current) =>
      current.map((row) => {
        const amount = amountOf(row)
        return amount === null ? row : { ...row, amountText: (-amount).toFixed(2) }
      })
    )

  const included = rows.filter((row) => row.include)
  const invalid = included.filter((row) => !isValid(row)).length
  const amounts = included.map(amountOf).filter((amount): amount is number => amount !== null)
  const moneyIn = amounts.filter((amount) => amount > 0).reduce((sum, amount) => sum + amount, 0)
  const moneyOut = amounts.filter((amount) => amount < 0).reduce((sum, amount) => sum - amount, 0)

  function confirm() {
    onConfirm(parseTransactions(included.map((row) => ({ date: row.date, description: row.description, amount: amountOf(row), category: row.category }))))
  }

  return (
    <section aria-labelledby={headingId} className="animate-rise space-y-4 rounded-2xl border bg-card p-4 shadow-[0_1px_2px_rgb(24_53_42/0.04)] sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
          <ImageIcon className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h3 id={headingId} className="font-sans text-base font-semibold">
            {rows.length > 0 ? "Check what was read" : "No transactions to add"}
          </h3>
          {rows.length > 0 && (
            <p className="figures text-sm text-muted-foreground">
              {included.length} of {rows.length} to add · in {formatMoney(moneyIn)} · out {formatMoney(moneyOut)}
            </p>
          )}
        </div>
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

      {rows.length > 0 && (
        <ul className="divide-y rounded-xl border" aria-label="Transactions read from your screenshots">
          {rows.map((row, index) => {
            const bad = row.include && !isValid(row)
            return (
              <li key={row.id} className={cn("flex gap-3 px-3 py-2.5", !row.include && "bg-surface/60")}>
                <input
                  type="checkbox"
                  checked={row.include}
                  onChange={(event) => update(row.id, { include: event.target.checked })}
                  aria-label={`Add ${row.description || `row ${index + 1}`}`}
                  className="mt-2 size-4 shrink-0 accent-[#216B47]"
                />
                {/* Phones: the description on its own line, then date and amount. Wider: one line. */}
                <div className={cn("grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_7rem] gap-2 sm:grid-cols-[9.5rem_minmax(0,1fr)_7.5rem]", !row.include && "opacity-60")}>
                  <Input
                    type="date"
                    value={row.date}
                    onChange={(event) => update(row.id, { date: event.target.value })}
                    aria-label={`Date, row ${index + 1}`}
                    aria-invalid={bad && !DATE.test(row.date)}
                    className="figures sm:order-1"
                  />
                  <Input
                    value={row.description}
                    maxLength={120}
                    onChange={(event) => update(row.id, { description: event.target.value })}
                    aria-label={`Description, row ${index + 1}`}
                    aria-invalid={bad && row.description.trim() === ""}
                    className="order-first col-span-2 sm:order-2 sm:col-span-1"
                  />
                  <Input
                    inputMode="decimal"
                    value={row.amountText}
                    onChange={(event) => update(row.id, { amountText: event.target.value })}
                    aria-label={`Amount, row ${index + 1}, negative for money out`}
                    aria-invalid={bad && amountOf(row) === null}
                    className={cn("figures text-right sm:order-3", (amountOf(row) ?? 0) > 0 && "text-primary")}
                  />
                  {row.maybeDuplicate && (
                    <p className="col-span-2 flex items-center gap-1.5 text-xs text-[#8a611b] sm:order-4 sm:col-span-3">
                      <TriangleAlertIcon className="size-3.5 shrink-0" aria-hidden="true" />
                      Same day and amount as one you already have. Tick it if it&apos;s a different transaction.
                    </p>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {invalid > 0 && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-[#a33b3b]">
          {invalid === 1 ? "One ticked row needs" : `${invalid} ticked rows need`} a date, a description and an amount.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {rows.length > 0 && (
          <Button type="button" size="sm" onClick={confirm} disabled={included.length === 0 || invalid > 0}>
            Add {included.length} {included.length === 1 ? "transaction" : "transactions"}
          </Button>
        )}
        {rows.length > 0 && (
          <Button type="button" size="sm" variant="outline" onClick={flipSigns}>
            <ArrowLeftRightIcon />
            Flip signs
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {rows.length > 0 ? "Cancel" : "Close"}
        </Button>
      </div>
    </section>
  )
}
