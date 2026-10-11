"use client"

import { RepeatIcon } from "lucide-react"

import type { FinanceSummary } from "@/lib/finance/transactions"
import { formatMoney, formatPercent } from "@/lib/format"

// Where the money went: categories when the file has them, otherwise the biggest payees.
// One series, so one color; the bars are labelled with the amount and share.
export function SpendingBreakdown({ summary }: { summary: FinanceSummary }) {
  const byCategory = summary.topCategories.length > 0
  const rows = byCategory
    ? summary.topCategories.map((row) => ({ name: row.category, amount: row.spending }))
    : summary.topPayees.map((row) => ({ name: row.payee, amount: row.spending }))
  const shown = rows.slice(0, 7)
  const other = summary.totals.spending - shown.reduce((sum, row) => sum + row.amount, 0)
  if (other > 0.5) shown.push({ name: byCategory ? "Everything else" : "All other payees", amount: other })
  const largest = Math.max(...shown.map((row) => row.amount), 1)

  return (
    <div>
      <p className="mb-4 text-xs text-muted-foreground">
        {byCategory ? "By the categories in your file" : "Your file has no categories, so this groups spending by payee"} ·{" "}
        {formatMoney(summary.totals.spending)} total
      </p>
      <ul className="space-y-3.5">
        {shown.map((row) => {
          const share = summary.totals.spending > 0 ? row.amount / summary.totals.spending : 0
          return (
            <li key={row.name}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate font-medium">{row.name}</span>
                <span className="figures shrink-0">
                  {formatMoney(row.amount)} <span className="text-xs text-muted-foreground">{formatPercent(share)}</span>
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <div className="h-full rounded-full bg-chart-2" style={{ width: `${(row.amount / largest) * 100}%` }} />
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function RegularPayments({ summary }: { summary: FinanceSummary }) {
  const payments = summary.regularPayments
  const fixed = payments.filter((payment) => payment.sameAmountEachTime)
  const fixedMonthly = fixed.reduce((sum, payment) => sum + payment.typicalAmount, 0)

  if (payments.length === 0) {
    return (
      <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
        {summary.period.months < 2
          ? "Import at least two months of transactions to spot regular payments."
          : "No payees showed up in most months."}
      </p>
    )
  }

  return (
    <div>
      {fixed.length > 0 && (
        <div className="mb-4 rounded-xl bg-surface px-4 py-3">
          <p className="figures text-sm">
            <span className="font-heading text-xl font-semibold text-primary">{formatMoney(fixedMonthly)}</span>
            <span className="text-muted-foreground"> a month in fixed bills and subscriptions</span>
          </p>
          <p className="figures mt-0.5 text-xs text-muted-foreground">
            That&apos;s about {formatMoney(fixedMonthly * 12)} a year. Worth reviewing once in a while.
          </p>
        </div>
      )}
      <ul className="divide-y">
        {payments.map((payment) => (
          <li key={payment.payee} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary" aria-hidden="true">
                <RepeatIcon className="size-3.5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{payment.payee}</span>
                <span className="text-xs text-muted-foreground">
                  {payment.sameAmountEachTime ? "Same amount" : "Varies"} · seen in {payment.monthsSeen} months
                </span>
              </span>
            </span>
            <span className="figures shrink-0 text-right">
              {formatMoney(payment.typicalAmount)}
              <span className="block text-xs text-muted-foreground">typical</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
