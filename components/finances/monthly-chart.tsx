"use client"

import { useState } from "react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { FinanceSummary } from "@/lib/finance/transactions"
import { formatMoney, formatMoneyCompact } from "@/lib/format"

const chartConfig = {
  income: { label: "Money in", color: "var(--chart-1)" },
  spending: { label: "Money out", color: "var(--chart-4)" },
} satisfies ChartConfig

const monthName = new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit", timeZone: "UTC" })

/** Rounds the axis top up to a round number (e.g. 3,700 → 4,000) so ticks land on even steps. */
function niceMax(max: number) {
  if (!(max > 0)) return 100
  const step = 10 ** Math.floor(Math.log10(max)) / 2
  return Math.ceil(max / step) * step
}

export function formatMonth(month: string) {
  return monthName.format(new Date(`${month}-01T00:00:00Z`))
}

// Money in versus money out per month. The two colors only narrowly pass color-blind checks,
// so bars are also separated by a gap, labelled in the legend and tooltip, and available as a table.
export function MonthlyChart({ months }: { months: FinanceSummary["months"] }) {
  const [asTable, setAsTable] = useState(false)
  const data = months.map((month) => ({ ...month, label: formatMonth(month.month) }))

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={() => setAsTable((current) => !current)}
          className="text-xs font-medium text-primary underline-offset-2 hover:underline"
          aria-pressed={asTable}
        >
          {asTable ? "Show chart" : "Show as table"}
        </button>
      </div>

      {asTable ? (
        <div className="overflow-x-auto rounded-xl border">
          <table className="figures w-full text-sm">
            <caption className="sr-only">Money in and out by month</caption>
            <thead className="bg-surface text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-semibold">Month</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Money in</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Money out</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Left over</th>
              </tr>
            </thead>
            <tbody>
              {data.map((month) => (
                <tr key={month.month} className="border-t">
                  <th scope="row" className="px-3 py-2 text-left font-medium">{month.label}</th>
                  <td className="px-3 py-2 text-right">{formatMoney(month.income)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(month.spending)}</td>
                  <td className={`px-3 py-2 text-right font-medium ${month.net < 0 ? "text-[#a33b3b]" : "text-primary"}`}>
                    {formatMoney(month.net)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ChartContainer config={chartConfig} className="aspect-auto h-72 w-full">
          <BarChart accessibilityLayer data={data} margin={{ left: 4, right: 8, top: 8 }} barGap={2} barCategoryGap="24%">
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={8} />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={52}
              domain={[0, niceMax(Math.max(...months.flatMap((month) => [month.income, month.spending])))]}
              tickCount={5}
              tickFormatter={(value: number) => formatMoneyCompact(value)}
            />
            <ChartTooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              content={
                <ChartTooltipContent
                  formatter={(value, name, item) => (
                    <div className="flex w-full items-center justify-between gap-4">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <span className="size-2.5 rounded-[2px]" style={{ background: item.color }} aria-hidden="true" />
                        {chartConfig[name as keyof typeof chartConfig]?.label}
                      </span>
                      <span className="figures font-medium text-foreground">{formatMoney(Number(value))}</span>
                    </div>
                  )}
                />
              }
            />
            <Bar dataKey="income" fill="var(--color-income)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="spending" fill="var(--color-spending)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <ChartLegend content={<ChartLegendContent />} />
          </BarChart>
        </ChartContainer>
      )}
    </div>
  )
}
