"use client"

import { useId, useState } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { AlertTriangleIcon, CheckCircle2Icon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, InfoIcon } from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { BUDGET_TARGETS, summarizeBudget, type BudgetCategory } from "@/lib/finance/budget"
import {
  budgetForMonth,
  clearMonthBudget,
  monthKey,
  monthLabel,
  saveMonthBudget,
  shiftMonth,
} from "@/lib/finance/budget-history"
import { formatMoney, formatPercent } from "@/lib/format"
import { budgetStore } from "@/lib/stores"
import { useHydrated, useStoredValue } from "@/lib/use-stored-value"

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
          className="figures h-full w-full bg-transparent pl-1 text-sm font-medium outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
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
  const saved = useStoredValue(budgetStore)
  const hydrated = useHydrated()
  const signedIn = useSession().status === "authenticated"
  // The month on screen; null means "this month", worked out in the browser's own time zone.
  const [pickedMonth, setPickedMonth] = useState<string | null>(null)
  const thisMonth = hydrated ? monthKey(new Date()) : null
  const month = pickedMonth ?? thisMonth

  // Before the browser takes over (server render), show the example numbers.
  const view = month ? budgetForMonth(saved, month) : budgetForMonth(null, "2000-01")
  const income = view.income
  const amounts: Record<BudgetCategory, number> = { needs: view.needs, wants: view.wants, savings: view.savings }

  // Every change saves this month's plan straight away (and syncs when logged in).
  function update(patch: Partial<Record<BudgetCategory | "income", number>>) {
    if (!month) return
    budgetStore.set(saveMonthBudget(budgetStore.get(), month, { income, ...amounts, ...patch }, new Date()))
  }
  const setIncome = (value: number) => update({ income: value })
  const setAmounts = (next: (current: Record<BudgetCategory, number>) => Record<BudgetCategory, number>) => update(next(amounts))

  const summary = summarizeBudget(income, amounts)
  const overspent = summary.unassigned < 0
  // Scale the bar to income, or to total spending when it's higher than income.
  const scale = Math.max(summary.income, summary.income - summary.unassigned) || 1

  return (
    <div className={cn("space-y-6", !hydrated && "invisible")} aria-busy={!hydrated}>
      <MonthBar
        month={month}
        thisMonth={thisMonth}
        source={view.source}
        fromMonth={view.fromMonth}
        signedIn={signedIn}
        onPick={setPickedMonth}
        onClear={() => month && budgetStore.set(clearMonthBudget(budgetStore.get(), month, new Date()))}
      />
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
    </div>
  )
}

function MonthBar({
  month,
  thisMonth,
  source,
  fromMonth,
  signedIn,
  onPick,
  onClear,
}: {
  month: string | null
  thisMonth: string | null
  source: "saved" | "carried" | "example"
  fromMonth?: string
  signedIn: boolean
  onPick: (month: string | null) => void
  onClear: () => void
}) {
  if (!month || !thisMonth) return <div className="h-10" aria-hidden="true" />
  const isThisMonth = month === thisMonth
  const go = (offset: number) => {
    const next = shiftMonth(month, offset)
    onPick(next === thisMonth ? null : next)
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface px-3 py-2.5">
      <div className="flex items-center gap-1">
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => go(-1)}>
          <ChevronLeftIcon />
        </Button>
        <p className="min-w-36 text-center font-heading text-base font-semibold" aria-live="polite">
          {monthLabel(month)}
        </p>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Next month" onClick={() => go(1)} disabled={month >= thisMonth}>
          <ChevronRightIcon />
        </Button>
        {!isThisMonth && (
          <Button type="button" variant="link" size="sm" onClick={() => onPick(null)}>
            Back to this month
          </Button>
        )}
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {source === "saved" ? (
          <>
            <CheckIcon className="size-3.5 text-primary" aria-hidden="true" />
            Saved {signedIn ? "to your account" : "in this browser"}
            <button type="button" onClick={onClear} className="ml-1 underline-offset-4 hover:text-foreground hover:underline">
              Reset
            </button>
          </>
        ) : source === "carried" && fromMonth ? (
          <>Starting from your {monthLabel(fromMonth)} plan. Change anything to save it for {monthLabel(month)}.</>
        ) : (
          <>
            Example numbers. Type yours and they&apos;re saved{signedIn ? " to your account" : ""}.
            {!signedIn && (
              <Link href="/login?mode=signup" className="font-medium text-primary hover:underline">
                Sign up to keep them on every device
              </Link>
            )}
          </>
        )}
      </p>
    </div>
  )
}
