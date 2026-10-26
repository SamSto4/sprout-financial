"use client"

import { useId } from "react"
import { AlertTriangleIcon, ArrowDownIcon, ArrowUpIcon, CalendarDaysIcon, CheckCircle2Icon, PlusIcon, Trash2Icon } from "lucide-react"
import { cn } from "cn"

import { ITEM_LABELS } from "@/components/budget/labels"
import { Button } from "@/components/ui/button"
import { BUDGET_ITEMS, type BudgetItem } from "@/lib/finance/budget"
import {
  buildCashFlow,
  dateFor,
  dayInMonth,
  daysInMonth,
  EMPTY_SCHEDULE,
  MAX_BILLS,
  MAX_PAYCHECKS,
  type Bill,
  type MonthSchedule,
  type Paycheck,
  type TimelineEvent,
} from "@/lib/finance/cash-flow"
import { monthLabel } from "@/lib/finance/budget-history"
import { formatDay, formatMoney, formatShortDay } from "@/lib/format"

function newId(prefix: "p" | "b") {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

const inputBox =
  "h-9 w-full rounded-lg border bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"

/**
 * Paychecks and bills on their real dates, and the month day by day: what comes in, what goes
 * out, and whether a bill lands before the paycheck that pays for it.
 */
export function MonthScheduleSection({
  month,
  schedule,
  onChange,
}: {
  month: string
  schedule: MonthSchedule | undefined
  onChange: (schedule: MonthSchedule) => void
}) {
  const current = schedule ?? EMPTY_SCHEDULE
  const headingId = useId()
  const flow = buildCashFlow(current)
  const first = dateFor(month, 1)
  const last = dateFor(month, daysInMonth(month))

  const set = (patch: Partial<MonthSchedule>) => onChange({ ...current, ...patch })
  const setPaycheck = (id: string, patch: Partial<Paycheck>) => set({ paychecks: current.paychecks.map((item) => (item.id === id ? { ...item, ...patch } : item)) })
  const setBill = (id: string, patch: Partial<Bill>) => set({ bills: current.bills.map((item) => (item.id === id ? { ...item, ...patch } : item)) })

  function addPaycheck() {
    // Two weeks after the latest paycheck is a good first guess; otherwise the 1st.
    const latest = current.paychecks.map((item) => dayInMonth(item.date, month) ?? 1).sort((a, b) => b - a)[0]
    const date = dateFor(month, latest ? Math.min(latest + 14, daysInMonth(month)) : 1)
    set({ paychecks: [...current.paychecks, { id: newId("p"), date, amount: 0, label: "" }] })
  }

  function addBill() {
    set({ bills: [...current.bills, { id: newId("b"), date: first, amount: 0, label: "", category: "needs" }] })
  }

  return (
    <section aria-labelledby={headingId} className="space-y-6 border-t pt-8">
      <div className="space-y-1">
        <h3 id={headingId} className="flex items-center gap-2 text-xl font-semibold">
          <CalendarDaysIcon className="size-5 text-primary" aria-hidden="true" />
          Your month, day by day
        </h3>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Add each paycheck and bill on its real date. If you&apos;re paid on different days, Sprout shows whether there&apos;s
          enough in your account when each bill is due.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="space-y-6">
          <AmountField
            label="Cash in your account on the 1st"
            hint={`What's in checking on ${formatShortDay(first)}, before anything below.`}
            value={current.startingBalance}
            onChange={(startingBalance) => set({ startingBalance })}
          />

          <EntryList
            title="Paychecks"
            empty="No paychecks yet. Add each one on the day it arrives."
            addLabel="Add a paycheck"
            canAdd={current.paychecks.length < MAX_PAYCHECKS}
            onAdd={addPaycheck}
          >
            {current.paychecks.map((paycheck) => (
              <EntryRow
                key={paycheck.id}
                kind="Paycheck"
                month={month}
                min={first}
                max={last}
                date={paycheck.date}
                label={paycheck.label}
                labelPlaceholder="Employer or source"
                amount={paycheck.amount}
                onDate={(date) => setPaycheck(paycheck.id, { date })}
                onLabel={(label) => setPaycheck(paycheck.id, { label })}
                onAmount={(amount) => setPaycheck(paycheck.id, { amount })}
                onRemove={() => set({ paychecks: current.paychecks.filter((item) => item.id !== paycheck.id) })}
              />
            ))}
          </EntryList>

          <EntryList
            title="Bills"
            empty="No bills yet. Add rent, card payments and subscriptions on their due dates."
            addLabel="Add a bill"
            canAdd={current.bills.length < MAX_BILLS}
            onAdd={addBill}
          >
            {current.bills.map((bill) => (
              <EntryRow
                key={bill.id}
                kind="Bill"
                month={month}
                min={first}
                max={last}
                date={bill.date}
                label={bill.label}
                labelPlaceholder="Rent, phone, card…"
                amount={bill.amount}
                onDate={(date) => setBill(bill.id, { date })}
                onLabel={(label) => setBill(bill.id, { label })}
                onAmount={(amount) => setBill(bill.id, { amount })}
                onRemove={() => set({ bills: current.bills.filter((item) => item.id !== bill.id) })}
                line={bill.category}
                onLine={(category) => setBill(bill.id, { category })}
              />
            ))}
          </EntryList>
        </div>

        <Timeline month={month} flow={flow} startingBalance={current.startingBalance} />
      </div>
    </section>
  )
}

function AmountField({ label, hint, value, onChange }: { label: string; hint: string; value: number; onChange: (value: number) => void }) {
  const id = useId()
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="flex h-10 max-w-60 items-center rounded-lg border bg-background px-3 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/25">
        <span className="text-sm text-muted-foreground">$</span>
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={0}
          step={10}
          value={value}
          onChange={(event) => onChange(event.target.value === "" ? 0 : Math.max(0, Number(event.target.value)))}
          aria-describedby={`${id}-hint`}
          className="figures h-full w-full bg-transparent pl-1 text-sm font-medium outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
      </div>
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {hint}
      </p>
    </div>
  )
}

function EntryList({
  title,
  empty,
  addLabel,
  canAdd,
  onAdd,
  children,
}: {
  title: string
  empty: string
  addLabel: string
  canAdd: boolean
  onAdd: () => void
  children: React.ReactNode[]
}) {
  return (
    <div className="space-y-3">
      <h4 className="font-sans text-sm font-semibold">{title}</h4>
      {children.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-3 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-2">{children}</ul>
      )}
      {canAdd && (
        <Button type="button" size="sm" variant="outline" onClick={onAdd}>
          <PlusIcon />
          {addLabel}
        </Button>
      )}
    </div>
  )
}

function EntryRow({
  kind,
  month,
  min,
  max,
  date,
  label,
  labelPlaceholder,
  amount,
  onDate,
  onLabel,
  onAmount,
  onRemove,
  line,
  onLine,
}: {
  kind: "Paycheck" | "Bill"
  month: string
  min: string
  max: string
  date: string
  label: string
  labelPlaceholder: string
  amount: number
  onDate: (date: string) => void
  onLabel: (label: string) => void
  onAmount: (amount: number) => void
  onRemove: () => void
  line?: BudgetItem
  onLine?: (line: BudgetItem) => void
}) {
  const name = label || kind.toLowerCase()
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border p-2.5 sm:grid-cols-[9.5rem_minmax(0,1fr)_7rem_auto]">
      <input
        type="date"
        aria-label={`Date of ${name}`}
        value={date}
        min={min}
        max={max}
        // Only dates in this month are kept; anything else (or a cleared field) is ignored.
        onChange={(event) => dayInMonth(event.target.value, month) !== null && onDate(event.target.value)}
        className={cn(inputBox, "figures")}
      />
      <input
        type="text"
        aria-label={`${kind} name`}
        placeholder={labelPlaceholder}
        maxLength={60}
        value={label}
        onChange={(event) => onLabel(event.target.value)}
        className={cn(inputBox, "col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto")}
      />
      <div className={cn(inputBox, "flex items-center focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/25")}>
        <span className="text-sm text-muted-foreground">$</span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step={10}
          aria-label={`Amount of ${name}`}
          value={amount || ""}
          placeholder="0"
          onChange={(event) => onAmount(event.target.value === "" ? 0 : Math.max(0, Number(event.target.value)))}
          className="figures h-full w-full bg-transparent pl-1 text-sm font-medium outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
      </div>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${name}`} onClick={onRemove}>
        <Trash2Icon />
      </Button>
      {line && onLine && (
        <select
          aria-label={`Budget line for ${name}`}
          value={line}
          onChange={(event) => onLine(event.target.value as BudgetItem)}
          className={cn(inputBox, "col-span-3 sm:col-span-4")}
        >
          {BUDGET_ITEMS.map((item) => (
            <option key={item} value={item}>
              {ITEM_LABELS[item].name}
            </option>
          ))}
        </select>
      )}
    </li>
  )
}

function Timeline({ month, flow, startingBalance }: { month: string; flow: ReturnType<typeof buildCashFlow>; startingBalance: number }) {
  // Group the events by day, keeping their order.
  const days: { date: string; events: TimelineEvent[] }[] = []
  for (const event of flow.events) {
    const day = days.at(-1)
    if (day?.date === event.date) day.events.push(event)
    else days.push({ date: event.date, events: [event] })
  }

  return (
    <div className="space-y-5 lg:sticky lg:top-24 lg:self-start" aria-live="polite">
      <dl className="figures grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Money in", value: formatMoney(flow.moneyIn), tone: "text-primary" },
          { label: "Bills", value: formatMoney(flow.billsOut), tone: "" },
          { label: "Left after bills", value: formatMoney(flow.endBalance), tone: flow.endBalance < 0 ? "text-[#a33b3b]" : "" },
          {
            label: "Lowest point",
            value: flow.lowest ? formatMoney(flow.lowest.balance) : "—",
            note: flow.lowest ? formatShortDay(flow.lowest.date) : undefined,
            tone: flow.lowest && flow.lowest.balance < 0 ? "text-[#a33b3b]" : "",
          },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg bg-surface px-3 py-2.5">
            <dt className="text-xs text-muted-foreground">{stat.label}</dt>
            <dd className={cn("text-base font-semibold", stat.tone)}>
              {stat.value}
              {stat.note && <span className="ml-1 text-xs font-normal text-muted-foreground">{stat.note}</span>}
            </dd>
          </div>
        ))}
      </dl>

      {flow.events.length === 0 ? (
        <p className="rounded-lg bg-surface px-3 py-3 text-sm text-muted-foreground">
          Add a paycheck or a bill to see {monthLabel(month)} day by day.
        </p>
      ) : flow.shortfalls.length > 0 ? (
        <ul className="space-y-2">
          {flow.shortfalls.map((shortfall) => (
            <li key={shortfall.bill.id} role="alert" className="flex gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-[#a33b3b]">
              <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                {shortfall.bill.label || "A bill"} ({formatMoney(shortfall.bill.amount)}) on {formatShortDay(shortfall.bill.date)} leaves you
                up to {formatMoney(shortfall.short)} short
                {shortfall.nextPaycheck
                  ? ` until your ${formatShortDay(shortfall.nextPaycheck.date)} paycheck.`
                  : ", and no paycheck comes after it this month."}{" "}
                Moving the due date, or keeping more cash on hand, would cover it.
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex gap-2 rounded-lg bg-secondary px-3 py-2.5 text-sm text-primary">
          <CheckCircle2Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Every bill is covered on the day it&apos;s due.
        </p>
      )}

      {days.length > 0 && (
        <ol className="relative space-y-1 border-l border-border pl-4" aria-label={`${monthLabel(month)}, day by day`}>
          <li className="figures pb-2 text-xs text-muted-foreground">Start of the month: {formatMoney(startingBalance)}</li>
          {days.map((day) => {
            const end = day.events.at(-1)!.balance
            return (
              <li key={day.date} className="relative pb-3">
                <span
                  className={cn("absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-background", end < 0 ? "bg-destructive" : "bg-brand")}
                  aria-hidden="true"
                />
                <p className="text-xs font-semibold text-muted-foreground">{formatDay(day.date)}</p>
                <ul className="mt-1 space-y-1">
                  {day.events.map((event) => (
                    <li key={event.id} className="figures flex items-baseline justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-center gap-1.5">
                        {event.kind === "paycheck" ? (
                          <ArrowDownIcon className="size-3.5 shrink-0 text-primary" aria-label="Money in" />
                        ) : (
                          <ArrowUpIcon className="size-3.5 shrink-0 text-muted-foreground" aria-label="Bill" />
                        )}
                        <span className="truncate">{event.label || (event.kind === "paycheck" ? "Paycheck" : "Bill")}</span>
                      </span>
                      <span className={cn("shrink-0 font-medium", event.kind === "paycheck" && "text-primary")}>
                        {event.kind === "paycheck" ? "+" : "−"}
                        {formatMoney(event.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className={cn("figures mt-1 text-right text-xs", end < 0 ? "font-semibold text-[#a33b3b]" : "text-muted-foreground")}>
                  Balance {end < 0 ? "−" : ""}
                  {formatMoney(Math.abs(end))}
                </p>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
