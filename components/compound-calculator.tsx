"use client"

import { useMemo, useState } from "react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { SliderField } from "@/components/slider-field"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { GROWTH_LIMITS, projectGrowth } from "@/lib/finance/compound"
import { formatMoney, formatMoneyCompact } from "@/lib/format"

const chartConfig = {
  contributed: { label: "You put in", color: "var(--chart-3)" },
  growth: { label: "Growth", color: "var(--chart-2)" },
} satisfies ChartConfig

export function CompoundCalculator() {
  const [principal, setPrincipal] = useState(1000)
  const [monthly, setMonthly] = useState(200)
  const [rate, setRate] = useState(6)
  const [years, setYears] = useState(20)

  const points = useMemo(
    () => projectGrowth({ principal, monthlyContribution: monthly, annualRatePercent: rate, years }),
    [principal, monthly, rate, years]
  )
  const final = points[points.length - 1]
  const growthShare = final.balance > 0 ? final.growth / final.balance : 0

  return (
    <div className="grid overflow-hidden rounded-2xl border bg-card shadow-[0_1px_2px_rgb(24_53_42/0.04),0_8px_24px_-12px_rgb(24_53_42/0.12)] lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="space-y-6 border-b bg-surface p-5 sm:p-7 lg:border-r lg:border-b-0">
        <div className="space-y-1">
          <h3 className="text-xl font-semibold">Compound growth calculator</h3>
          <p className="text-sm text-muted-foreground">
            See how a starting amount and a monthly habit can grow.
          </p>
        </div>
        <SliderField
          label="Starting amount"
          prefix="$"
          value={principal}
          onChange={setPrincipal}
          min={GROWTH_LIMITS.principal.min}
          max={50_000}
          step={100}
        />
        <SliderField
          label="Added each month"
          prefix="$"
          value={monthly}
          onChange={setMonthly}
          min={GROWTH_LIMITS.monthlyContribution.min}
          max={2_000}
          step={25}
        />
        <SliderField
          label="Yearly return"
          suffix="%"
          value={rate}
          onChange={setRate}
          min={GROWTH_LIMITS.annualRatePercent.min}
          max={12}
          step={0.5}
          hint="An assumption, not a promise. Real returns change every year and can be negative."
        />
        <SliderField
          label="Years"
          value={years}
          onChange={setYears}
          min={GROWTH_LIMITS.years.min}
          max={GROWTH_LIMITS.years.max}
          step={1}
        />
      </div>

      <div className="flex flex-col gap-6 p-5 sm:p-7">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3" aria-live="polite">
          <div className="col-span-2 sm:col-span-1">
            <dt className="text-xs font-medium text-muted-foreground">Balance after {years} years</dt>
            <dd className="figures font-heading text-3xl font-semibold text-primary">
              {formatMoney(final.balance)}
            </dd>
          </div>
          <div>
            <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <span className="size-2 rounded-sm bg-chart-3" aria-hidden="true" />
              You put in
            </dt>
            <dd className="figures text-lg font-semibold">{formatMoney(final.contributed)}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <span className="size-2 rounded-sm bg-chart-2" aria-hidden="true" />
              Growth
            </dt>
            <dd className="figures text-lg font-semibold">{formatMoney(final.growth)}</dd>
          </div>
        </dl>

        <ChartContainer config={chartConfig} className="aspect-auto h-60 w-full sm:h-72">
          <AreaChart data={points} margin={{ left: 4, right: 8, top: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="year"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={24}
              tickFormatter={(value) => `Yr ${value}`}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={52}
              tickFormatter={(value: number) => formatMoneyCompact(value)}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) => `Year ${payload?.[0]?.payload?.year ?? ""}`}
                  formatter={(value, name) => (
                    <div className="flex w-full justify-between gap-4">
                      <span className="text-muted-foreground">
                        {chartConfig[name as keyof typeof chartConfig]?.label}
                      </span>
                      <span className="figures font-medium">{formatMoney(Number(value))}</span>
                    </div>
                  )}
                />
              }
            />
            <Area
              dataKey="contributed"
              type="monotone"
              stackId="total"
              stroke="var(--color-contributed)"
              fill="var(--color-contributed)"
              fillOpacity={0.55}
              isAnimationActive={false}
            />
            <Area
              dataKey="growth"
              type="monotone"
              stackId="total"
              stroke="var(--color-growth)"
              fill="var(--color-growth)"
              fillOpacity={0.35}
              isAnimationActive={false}
            />
          </AreaChart>
        </ChartContainer>

        <p className="text-sm text-muted-foreground">
          {growthShare >= 0.5
            ? `Over half of the final balance, ${Math.round(growthShare * 100)}%, is growth rather than money you added. That's compounding: growth earning more growth.`
            : growthShare > 0
              ? `Growth makes up ${Math.round(growthShare * 100)}% of the balance so far. Compounding speeds up the longer money stays invested.`
              : "At a 0% return, the balance is exactly what you put in."}
        </p>

        <details className="group rounded-lg border bg-surface px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium marker:text-primary">
            How this is calculated
          </summary>
          <div className="mt-3 space-y-2 text-muted-foreground">
            <p>
              Each month, the balance grows by one twelfth of the yearly return, then your monthly
              amount is added:
            </p>
            <p className="rounded-md bg-background px-3 py-2 font-mono text-xs text-foreground">
              balance = balance × (1 + {rate}% ÷ 12) + {formatMoney(monthly)}
            </p>
            <p>
              It assumes the same return every year. It doesn&apos;t include inflation, fees or
              taxes, which all reduce real-world results.
            </p>
          </div>
        </details>
      </div>
    </div>
  )
}
