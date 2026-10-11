"use client"

import { useState } from "react"

import { SliderField } from "@/components/slider-field"
import { FEE_LIMITS, projectWithFee } from "@/lib/finance/fees"
import { formatMoney } from "@/lib/format"

// Compares two yearly fees on the same investing plan, e.g. an index fund versus an active fund.
export function FeeCalculator() {
  const [monthly, setMonthly] = useState(200)
  const [years, setYears] = useState(30)
  const [rate, setRate] = useState(7)
  const [lowFee, setLowFee] = useState(0.05)
  const [highFee, setHighFee] = useState(1)

  const plan = { principal: 10_000, monthlyContribution: monthly, annualRatePercent: rate, years }
  const low = projectWithFee({ ...plan, feePercent: lowFee })
  const high = projectWithFee({ ...plan, feePercent: highFee })
  const gap = Math.abs(low.balance - high.balance)
  const larger = Math.max(low.balance, high.balance) || 1

  const funds = [
    { label: "Fund A", fee: lowFee, result: low, color: "bg-brand" },
    { label: "Fund B", fee: highFee, result: high, color: "bg-chart-4" },
  ]

  return (
    <div className="grid overflow-hidden rounded-2xl border bg-card shadow-[0_1px_2px_rgb(24_53_42/0.04),0_8px_24px_-12px_rgb(24_53_42/0.12)] md:grid-cols-2">
      <div className="space-y-5 border-b bg-surface p-5 sm:p-6 md:border-r md:border-b-0">
        <div className="space-y-1">
          <h3 className="text-xl font-semibold">Fee comparison</h3>
          <p className="text-sm text-muted-foreground">Starts with $10,000. Same plan, two different yearly fees.</p>
        </div>
        <SliderField label="Added each month" prefix="$" value={monthly} onChange={setMonthly} min={0} max={2_000} step={25} />
        <SliderField label="Years" value={years} onChange={setYears} min={1} max={50} step={1} />
        <SliderField
          label="Yearly return before fees"
          suffix="%"
          value={rate}
          onChange={setRate}
          min={0}
          max={12}
          step={0.5}
          hint="An assumption, not a promise."
        />
        <SliderField label="Fund A fee" suffix="%" value={lowFee} onChange={setLowFee} min={FEE_LIMITS.min} max={2} step={0.01} />
        <SliderField label="Fund B fee" suffix="%" value={highFee} onChange={setHighFee} min={FEE_LIMITS.min} max={2} step={0.01} />
      </div>

      <div className="flex flex-col gap-6 p-5 sm:p-6" aria-live="polite">
        <p className="text-sm text-muted-foreground">Ending balance after {years} years</p>
        <div className="space-y-5">
          {funds.map((fund) => (
            <div key={fund.label}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium">
                  {fund.label} <span className="figures text-muted-foreground">({fund.fee.toFixed(2)}% fee)</span>
                </span>
                <span className="figures font-heading text-xl font-semibold">{formatMoney(fund.result.balance)}</span>
              </div>
              <div className="mt-2 h-3 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <div
                  className={`h-full rounded-full ${fund.color} transition-[width] duration-500`}
                  style={{ width: `${(fund.result.balance / larger) * 100}%` }}
                />
              </div>
              <p className="figures mt-1 text-xs text-muted-foreground">
                Fees cost about {formatMoney(fund.result.lostToFees)} compared with no fee at all.
              </p>
            </div>
          ))}
        </div>

        <div className="rounded-xl bg-secondary px-4 py-3.5">
          <p className="figures font-heading text-2xl font-semibold text-primary">{formatMoney(gap)}</p>
          <p className="mt-0.5 text-sm">
            {gap < 1
              ? "Same fee, same result."
              : `difference from a ${Math.abs(highFee - lowFee).toFixed(2)} percentage point gap in fees. You put in ${formatMoney(low.contributed)} either way.`}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Fees are taken off the yearly return. Taxes, inflation and trading costs aren&apos;t included.
        </p>
      </div>
    </div>
  )
}
