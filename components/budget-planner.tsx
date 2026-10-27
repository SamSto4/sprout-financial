"use client"

import { useId, useState } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { AlertTriangleIcon, CheckCircle2Icon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, InfoIcon } from "lucide-react"
import { cn } from "cn"

import { ITEM_LABELS } from "@/components/budget/labels"
import { MonthScheduleSection } from "@/components/budget/month-schedule"
import { Button } from "@/components/ui/button"
import { BUDGET_TARGETS, groupBudget, summarizeBudget, type BudgetCategory, type BudgetItem } from "@/lib/finance/budget"
import {
  budgetForMonth,
  clearMonthBudget,
  currentMonthFor,
  monthLabel,
  saveMonthBudget,
  shiftMonth,
  type BudgetAmounts,
} from "@/lib/finance/budget-history"
import { budgetPeriod, DEFAULT_START_DAY, MAX_START_DAY, parseStartDay, todayKey, type BudgetPeriod } from "@/lib/finance/budget-period"
import { moveSchedule, totalPaychecks, type MonthSchedule } from "@/lib/finance/cash-flow"
import { formatDateRange, formatMoney, formatOrdinal, formatPercent, formatShortDay } from "@/lib/format"
import { budgetStore } from "@/lib/stores"
import { useHydrated, useStoredValue } from "@/lib/use-stored-value"

/** The three 50/30/20 groups, in order, with the lines that make up each. */
const GROUPS: { category: BudgetCategory; name: string; color: string; items: BudgetItem[] }[] = [
  { category: "needs", name: "Needs", color: "bg-chart-2", items: ["needs", "groceries"] },
  { category: "wants", name: "Wants", color: "bg-chart-3", items: ["recurring", "wants", "misc"] },
  { category: "savings", name: "Savings & investing", color: "bg-brand", items: ["savings", "investments"] },
]


const GROUP_NAME: Record<BudgetCategory, string> = { needs: "Needs", wants: "Wants", savings: "Savings & investing" }
const GROUP_COLOR: Record<BudgetCategory, string> = { needs: "bg-chart-2", wants: "bg-chart-3", savings: "bg-brand" }

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
          step={10}
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

/** The day each budget month starts on, 1st to 31st. Each change saves straight away, like every other field. */
function StartDayField({
  value,
  rangeId,
  hasEntries,
  onChange,
}: {
  value: number
  /** The month bar's range ("Runs Oct 7 to Nov 6"), read out with the field. */
  rangeId: string
  hasEntries: boolean
  onChange: (day: number) => void
}) {
  const id = useId()
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        Budget month starts on
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => {
          const day = parseStartDay(Number(event.target.value))
          if (day !== null) onChange(day)
        }}
        aria-describedby={`${rangeId} ${id}-hint`}
        className="figures flex h-10 w-full max-w-60 rounded-lg border bg-background px-3 text-sm font-medium outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
      >
        {Array.from({ length: MAX_START_DAY }, (_, index) => index + 1).map((day) => (
          <option key={day} value={day}>
            {formatOrdinal(day)}
          </option>
        ))}
      </select>
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        Pick the day your main paycheck usually lands.
        {value >= 29 && " In shorter months it starts on the last day."}
        {hasEntries && " Changing it moves your paychecks and bills to the same day of the month in the new dates."}
      </p>
    </div>
  )
}

export function BudgetPlanner({
  schedule: showSchedule = true,
}: {
  /** The start-day picker and the dated paychecks, bills and timeline. */
  schedule?: boolean
}) {
  const saved = useStoredValue(budgetStore)
  const hydrated = useHydrated()
  const signedIn = useSession().status === "authenticated"
  const rangeId = useId()
  // The month on screen; null means the budget month today falls in, worked out in the browser's
  // own time zone and each month's start day.
  const [pickedMonth, setPickedMonth] = useState<string | null>(null)
  const thisMonth = hydrated ? currentMonthFor(saved, todayKey(new Date())) : null
  const month = pickedMonth ?? thisMonth

  // Before the browser takes over (server render), show the example numbers.
  const view = month ? budgetForMonth(saved, month) : budgetForMonth(null, "2000-01")
  // startDay is pulled out by name so `amounts` holds only the budget lines.
  const { income, schedule, source, fromMonth, startDay = DEFAULT_START_DAY, ...amounts } = view
  const lines = amounts as BudgetAmounts
  const paychecks = schedule?.paychecks ?? []
  const period = month ? budgetPeriod(month, startDay) : null
  const hasEntries = Boolean(schedule && (schedule.paychecks.length > 0 || schedule.bills.length > 0))

  // Every change saves this month's plan straight away (and syncs when logged in). The start day
  // goes with every save: without it the month would be read as starting on the 1st and its
  // entries after the calendar month dropped.
  function update(patch: Partial<BudgetAmounts> & { income?: number; schedule?: MonthSchedule; startDay?: number }) {
    if (!month) return
    budgetStore.set(saveMonthBudget(budgetStore.get(), month, { income, ...lines, schedule, startDay, ...patch }, new Date()))
  }

  function changeStartDay(next: number) {
    if (!month || next === startDay) return
    // Keep this month on screen: a new start day can change which budget month today falls in.
    setPickedMonth(month)
    update({ startDay: next, ...(schedule ? { schedule: moveSchedule(schedule, month, next) } : {}) })
  }

  function clearMonth() {
    if (!month) return
    // Clearing can also change which budget month today falls in, so this month stays on screen.
    setPickedMonth(month)
    budgetStore.set(clearMonthBudget(budgetStore.get(), month, new Date()))
  }

  const summary = summarizeBudget(income, groupBudget(lines))
  const overspent = summary.unassigned < 0
  // Scale the bar to income, or to total spending when it's higher than income.
  const scale = Math.max(summary.income, summary.income - summary.unassigned) || 1

  return (
    <div className={cn("space-y-6", !hydrated && "invisible")} aria-busy={!hydrated}>
      <MonthBar
        month={month}
        thisMonth={thisMonth}
        period={period}
        rangeId={rangeId}
        source={source}
        fromMonth={fromMonth}
        hasSchedule={hasEntries}
        signedIn={signedIn}
        onPick={setPickedMonth}
        onClear={clearMonth}
      />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="space-y-6">
          {showSchedule && <StartDayField value={startDay} rangeId={rangeId} hasEntries={hasEntries} onChange={changeStartDay} />}

          {paychecks.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Monthly take-home pay</p>
              <p className="figures flex h-10 items-center rounded-lg border bg-surface px-3 text-sm font-semibold">{formatMoney(totalPaychecks(schedule))}</p>
              <p className="text-xs text-muted-foreground">
                The total of your {paychecks.length} {paychecks.length === 1 ? "paycheck" : "paychecks"}
                {period ? ` from ${formatShortDay(period.start)} to ${formatShortDay(period.end)}.` : " this month."}
                {showSchedule && " Change them in Your month, day by day."}
              </p>
            </div>
          ) : (
            <MoneyInput label="Monthly take-home pay" value={income} onChange={(value) => update({ income: value })} />
          )}

          {GROUPS.map((group) => (
            <fieldset key={group.category} className="space-y-3">
              <legend className="mb-1 flex w-full items-center justify-between gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                <span className="flex items-center gap-2">
                  <span className={cn("size-2.5 rounded-sm", group.color)} aria-hidden="true" />
                  {group.name}
                </span>
                <span className="font-normal normal-case">Guideline {formatPercent(BUDGET_TARGETS[group.category])}</span>
              </legend>
              {group.items.map((item) => (
                <MoneyInput
                  key={item}
                  label={ITEM_LABELS[item].name}
                  hint={ITEM_LABELS[item].hint}
                  value={lines[item]}
                  onChange={(value) => update({ [item]: value })}
                />
              ))}
            </fieldset>
          ))}
        </div>

        <div className="space-y-6 lg:sticky lg:top-24 lg:self-start" aria-live="polite">
          <div>
            <div className="flex h-4 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              {summary.lines.map((line) => (
                <div
                  key={line.category}
                  className={cn("h-full transition-[width] duration-500", GROUP_COLOR[line.category])}
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
                <th scope="col" className="pb-2 font-medium">Group</th>
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
                      <span className={cn("size-2.5 rounded-sm", GROUP_COLOR[line.category])} aria-hidden="true" />
                      {GROUP_NAME[line.category]}
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
                        line.status === "on-track" ? "bg-secondary text-primary" : "bg-warning/10 text-[#8a611b]"
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
                ? `You've planned ${formatMoney(-summary.unassigned)} more than you take home. Look at wants, misc and recurring charges first for room to trim.`
                : summary.unassigned > 0
                  ? `${formatMoney(summary.unassigned)} isn't assigned yet. Giving every dollar a job makes it easier to stay on plan.`
                  : "Every dollar has a job. The 50/30/20 split is a guide, so adjust it to what matters to you."}
          </p>
        </div>
      </div>

      {showSchedule && month && (
        <MonthScheduleSection month={month} startDay={startDay} schedule={schedule} onChange={(next) => update({ schedule: next })} />
      )}
    </div>
  )
}

function MonthBar({
  month,
  thisMonth,
  period,
  rangeId,
  source,
  fromMonth,
  hasSchedule,
  signedIn,
  onPick,
  onClear,
}: {
  month: string | null
  thisMonth: string | null
  /** The days the month on screen covers. */
  period: BudgetPeriod | null
  /** Id of the range text, so the start-day picker can point at it. */
  rangeId: string
  source: "saved" | "carried" | "example"
  fromMonth?: string
  hasSchedule: boolean
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
          {period && (
            <span id={rangeId} className="figures block font-sans text-xs font-normal text-muted-foreground">
              <span aria-hidden="true">{formatDateRange(period.start, period.end)}</span>
              <span className="sr-only">
                Runs {formatShortDay(period.start)} to {formatShortDay(period.end)}
              </span>
            </span>
          )}
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
          <>
            Starting from your {monthLabel(fromMonth)} plan{hasSchedule ? ", with paychecks and bills on the same days" : ""}. Change anything to save
            it for {monthLabel(month)}.
          </>
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
