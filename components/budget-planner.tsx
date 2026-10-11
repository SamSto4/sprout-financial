"use client"

import { useId, useState } from "react"
import { AlertTriangleIcon, CheckCircle2Icon, InfoIcon } from "lucide-react"
import { cn } from "cn"

import { BUDGET_TARGETS, summarizeBudget, type BudgetCategory } from "@/lib/finance/budget"
import { formatMoney, formatPercent } from "@/lib/format"

const LABELS: Record<BudgetCategory, { name: string; hint: string; color: string }> = {
  needs: { name: "Needs", hint: "Rent, groceries, utilities, minimum debt payments", color: "bg-chart-2" },
  wants: { name: "Wants", hint: "Eating out, subscriptions, hobbies, travel", color: "bg-chart-3" },
  savings: { name: "Savings", hint: "Emergency fund, investing, extra debt payments", color: "bg-brand" },
}

function MoneyInput({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  hint?: string
  value: number
  onChange: (value: number) => void
}) {
  const id = useId()
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="flex h-10 items-center rounded-lg border bg-background px-3 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/25">
        <span className="text-sm text-muted-foreground">$</span>
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={0}
          step={50}
          value={Number.isFinite(value) ? value : ""}
          onChange={(event) => onChange(event.target.value === "" ? 0 : Math.max(0, Number(event.target.value)))}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="figures w-full bg-transparent pl-1 text-sm font-medium outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
      </div>
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  )
}

export function BudgetPlanner() {
  const [income, setIncome] = useState(4000)
  const [amounts, setAmounts] = useState<Record<BudgetCategory, number>>({
    needs: 2300,
    wants: 1100,
    savings: 600,
  })

  const summary = summarizeBudget(income, amounts)
  const overspent = summary.unassigned < 0
  // Scale the bar to income, or to total spending when it's higher than income.
  const scale = Math.max(summary.income, summary.income - summary.unassigned) || 1

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="space-y-4">
        <MoneyInput label="Monthly take-home pay" value={income} onChange={setIncome} />
        {(Object.keys(LABELS) as BudgetCategory[]).map((category) => (
          <MoneyInput
            key={category}
            label={LABELS[category].name}
            hint={LABELS[category].hint}
            value={amounts[category]}
            onChange={(value) => setAmounts((current) => ({ ...current, [category]: value }))}
          />
        ))}
      </div>

      <div className="space-y-6" aria-live="polite">
        <div>
          <div className="flex h-4 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            {summary.lines.map((line) => (
              <div
                key={line.category}
                className={cn("h-full transition-[width] duration-500", LABELS[line.category].color)}
                style={{ width: `${(line.amount / scale) * 100}%` }}
              />
            ))}
          </div>
          {/* Guideline markers at 50% and 80% of income. */}
          <div className="relative mt-1 h-5 text-[11px] text-muted-foreground" aria-hidden="true">
            <span className="absolute -translate-x-1/2" style={{ left: `${(summary.income * 0.5 / scale) * 100}%` }}>
              ▲ 50%
            </span>
            <span className="absolute -translate-x-1/2" style={{ left: `${(summary.income * 0.8 / scale) * 100}%` }}>
              ▲ 80%
            </span>
          </div>
        </div>

        <table className="w-full text-sm">
          <caption className="sr-only">Your budget compared with the 50/30/20 guideline</caption>
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th scope="col" className="pb-2 font-medium">Category</th>
              <th scope="col" className="pb-2 text-right font-medium">Yours</th>
              <th scope="col" className="hidden pb-2 text-right font-medium sm:table-cell">Guideline</th>
              <th scope="col" className="pb-2 text-right font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="figures">
            {summary.lines.map((line) => (
              <tr key={line.category} className="border-b last:border-0">
                <th scope="row" className="py-3 text-left font-medium">
                  <span className="flex items-center gap-2">
                    <span className={cn("size-2.5 rounded-sm", LABELS[line.category].color)} aria-hidden="true" />
                    {LABELS[line.category].name}
                  </span>
                </th>
                <td className="py-3 text-right">
                  {formatMoney(line.amount)}
                  <span className="block text-xs text-muted-foreground">{formatPercent(line.share)}</span>
                </td>
                <td className="hidden py-3 text-right text-muted-foreground sm:table-cell">
                  {formatMoney(line.target)}
                  <span className="block text-xs">{formatPercent(BUDGET_TARGETS[line.category])}</span>
                </td>
                <td className="py-3 text-right">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium",
                      line.status === "on-track"
                        ? "bg-secondary text-primary"
                        : "bg-warning/10 text-[#8a611b]"
                    )}
                  >
                    {line.status === "on-track" ? (
                      <CheckCircle2Icon className="size-3.5" aria-hidden="true" />
                    ) : (
                      <AlertTriangleIcon className="size-3.5" aria-hidden="true" />
                    )}
                    {line.status === "on-track" ? "On track" : line.status === "over" ? "Above" : "Below"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p
          className={cn(
            "flex gap-2 rounded-lg px-3 py-2.5 text-sm",
            overspent ? "bg-destructive/10 text-[#a33b3b]" : "bg-surface text-foreground"
          )}
        >
          <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {summary.income === 0
            ? "Enter your monthly take-home pay to compare your budget."
            : overspent
              ? `You've planned ${formatMoney(-summary.unassigned)} more than you take home. Look at wants first for room to trim.`
              : summary.unassigned > 0
                ? `${formatMoney(summary.unassigned)} isn't assigned yet. Giving every dollar a job makes it easier to stay on plan.`
                : "Every dollar has a job. The 50/30/20 split is a guide, so adjust it to what matters to you."}
        </p>
      </div>
    </div>
  )
}
