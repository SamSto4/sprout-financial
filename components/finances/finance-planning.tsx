"use client"

import { useId, useState } from "react"
import Link from "next/link"
import { ArrowRightIcon } from "lucide-react"

import { SliderField } from "@/components/slider-field"
import { projectGrowth } from "@/lib/finance/compound"
import { monthsCovered, type FinanceSummary } from "@/lib/finance/transactions"
import { formatMoney } from "@/lib/format"

/** How far a savings balance goes toward 3–6 months of the user's average spending. */
export function EmergencyFundCheck({ summary }: { summary: FinanceSummary }) {
  const [saved, setSaved] = useState(0)
  const id = useId()
  const monthly = summary.monthlyAverage.spending
  const covered = monthsCovered(saved, monthly)
  const scaleMonths = 8
  const percent = Math.min(100, (covered / scaleMonths) * 100)

  return (
    <div className="space-y-4">
      <p className="figures text-sm text-foreground/90">
        A common target is 3–6 months of spending. Based on your average of {formatMoney(monthly)} a month, that&apos;s{" "}
        <strong className="font-semibold">
          {formatMoney(summary.emergencyFund.threeMonths)}–{formatMoney(summary.emergencyFund.sixMonths)}
        </strong>
        .
      </p>

      <div className="space-y-1.5">
        <label htmlFor={id} className="text-sm font-medium">
          How much do you have in savings now?
        </label>
        <div className="flex h-10 max-w-xs items-center rounded-lg border bg-background px-3 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/25">
          <span className="text-sm text-muted-foreground">$</span>
          <input
            id={id}
            type="number"
            inputMode="decimal"
            min={0}
            step={100}
            value={saved || ""}
            placeholder="0"
            onChange={(event) => setSaved(Math.max(0, Number(event.target.value) || 0))}
            className="figures w-full bg-transparent pl-1 text-sm font-medium outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>
        <p className="text-xs text-muted-foreground">Only used here on this page. It isn&apos;t saved.</p>
      </div>

      <div aria-live="polite">
        <div className="relative h-3 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${percent}%` }} />
        </div>
        <div className="figures relative mt-1 h-4 text-[11px] text-muted-foreground" aria-hidden="true">
          <span className="absolute -translate-x-1/2" style={{ left: `${(3 / scaleMonths) * 100}%` }}>▲ 3 mo</span>
          <span className="absolute -translate-x-1/2" style={{ left: `${(6 / scaleMonths) * 100}%` }}>▲ 6 mo</span>
        </div>
        <p className="figures mt-2 text-sm">
          {saved === 0
            ? "Enter your savings to see how many months they'd cover."
            : covered >= 6
              ? `That covers about ${covered} months. You're past the usual target, so extra money could go toward investing.`
              : covered >= 3
                ? `That covers about ${covered} months, inside the usual range.`
                : `That covers about ${covered} months. Getting to 3 months first gives you a buffer before investing more.`}
        </p>
      </div>
    </div>
  )
}

/** What investing part of the average monthly leftover could grow to. */
export function InvestTheDifference({ summary }: { summary: FinanceSummary }) {
  const leftover = Math.max(0, Math.floor(summary.monthlyAverage.net / 25) * 25)
  const [monthly, setMonthly] = useState(Math.min(2_000, Math.max(25, Math.round(leftover / 2 / 25) * 25)))
  const [rate, setRate] = useState(6)

  if (summary.monthlyAverage.net <= 0) {
    return (
      <div className="space-y-3 text-sm">
        <p>
          In this file, spending averages more than income, so there&apos;s no monthly leftover to invest yet. That&apos;s
          common, and a budget is the place to start.
        </p>
        <a href="#budget-planner" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
          Try the budget planner
          <ArrowRightIcon className="size-3.5" aria-hidden="true" />
        </a>
      </div>
    )
  }

  const horizons = [10, 20, 30].map((years) => {
    const points = projectGrowth({ principal: 0, monthlyContribution: monthly, annualRatePercent: rate, years })
    return { years, ...points[points.length - 1] }
  })

  return (
    <div className="space-y-5">
      <p className="figures text-sm text-foreground/90">
        You have about <strong className="font-semibold">{formatMoney(summary.monthlyAverage.net)}</strong> left over in
        an average month. Here&apos;s what investing part of it could grow to.
      </p>
      <SliderField
        label="Invest each month"
        prefix="$"
        value={monthly}
        onChange={setMonthly}
        min={25}
        max={Math.max(100, Math.min(2_000, leftover || 100))}
        step={25}
      />
      <SliderField
        label="Yearly return"
        suffix="%"
        value={rate}
        onChange={setRate}
        min={0}
        max={10}
        step={0.5}
        hint="An assumption, not a promise. Real returns vary and can be negative."
      />
      <dl className="figures grid grid-cols-3 gap-2" aria-live="polite">
        {horizons.map((horizon) => (
          <div key={horizon.years} className="rounded-xl bg-surface px-3 py-2.5">
            <dt className="text-xs text-muted-foreground">In {horizon.years} years</dt>
            <dd className="font-heading text-lg font-semibold text-primary sm:text-xl">{formatMoney(horizon.balance)}</dd>
            <dd className="text-[11px] text-muted-foreground">{formatMoney(horizon.contributed)} put in</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">
        Before inflation, fees and taxes. Build your emergency fund and pay off high-interest debt first.{" "}
        <Link href="/learn/money-foundation" className="font-medium text-primary hover:underline">
          Why that order?
        </Link>
      </p>
    </div>
  )
}
