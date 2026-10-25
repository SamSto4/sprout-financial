"use client"

import { useEffect, useMemo, useState } from "react"
import { Area, AreaChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { cn } from "cn"

import { Panel } from "@/components/plan/fields"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { formatMoney, formatMoneyPrecise } from "@/lib/format"
import {
  MARKET_LINEUP,
  plainEnglish,
  RANGES,
  rebase,
  sliceRange,
  summarize,
  thin,
  type MarketId,
  type PricePoint,
  type RangeKey,
} from "@/lib/market/history"

type Loaded = {
  markets: { id: MarketId; symbol: string; points: PricePoint[] }[]
  unavailable: MarketId[]
  source: string
  fetchedAt: string
}

const COLORS: Record<MarketId, string> = {
  "us-stocks": "var(--chart-1)",
  "world-stocks": "var(--chart-2)",
  tech: "var(--chart-3)",
  bonds: "var(--chart-5)",
  bitcoin: "var(--chart-4)",
}

const MAX_CHART_POINTS = 160
const dayFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
const shortFormat = new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit", timeZone: "UTC" })
const dayShort = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
const asDate = (date: string) => new Date(`${date}T00:00:00Z`)

function pct(value: number, signed = true) {
  const rounded = Math.round(value * 1000) / 10
  return `${signed && rounded > 0 ? "+" : ""}${rounded}%`
}

function info(id: MarketId) {
  return MARKET_LINEUP.find((market) => market.id === id)!
}

/**
 * "Markets, explained": live charts of a few broad markets with the numbers that matter to a
 * long-term investor (change, distance from the high, the deepest fall, how bumpy the ride was),
 * in plain English. Read-only; it never suggests buying or selling.
 */
export function MarketSection() {
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [range, setRange] = useState<RangeKey>("1Y")
  const [selected, setSelected] = useState<MarketId>("us-stocks")
  const [compare, setCompare] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch("/api/market/history")
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as (Loaded & { error?: string }) | null
        if (!response.ok || !body?.markets) throw new Error(body?.error ?? "Market data is unavailable right now.")
        if (!cancelled) setData(body)
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Market data is unavailable right now.")
      })
    return () => {
      cancelled = true
    }
  }, [])

  const series = useMemo(
    () =>
      (data?.markets ?? []).map((market) => {
        const points = sliceRange(market.points, range)
        return { ...market, points, summary: summarize(points) }
      }),
    [data, range]
  )
  const current = series.find((market) => market.id === selected) ?? series[0]

  return (
    <Panel
      id="markets"
      title="Markets, explained"
      description="How the big markets have moved, in plain English. Useful for perspective; not a signal to buy or sell."
      action={
        <div role="tablist" aria-label="Time period" className="flex rounded-lg bg-muted p-1">
          {(Object.keys(RANGES) as RangeKey[]).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={range === key}
              onClick={() => setRange(key)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                range === key ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {key}
            </button>
          ))}
        </div>
      }
    >
      {error ? (
        <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">{error}</p>
      ) : !data || !current ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading market data">
          <div className="grid gap-2 sm:grid-cols-3">
            {[0, 1, 2].map((key) => (
              <div key={key} className="h-20 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
          <div className="h-64 animate-pulse rounded-xl bg-muted" />
        </div>
      ) : (
        <div className="space-y-5">
          <div className={cn("grid gap-2", series.length >= 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
            {series.map((market) => {
              const active = !compare && market.id === current.id
              const change = market.summary?.change ?? 0
              return (
                <button
                  key={market.id}
                  type="button"
                  onClick={() => {
                    setSelected(market.id)
                    setCompare(false)
                  }}
                  aria-pressed={active}
                  className={cn(
                    "rounded-xl border px-3.5 py-3 text-left transition-colors hover:border-brand/50",
                    active && "border-primary/50 bg-secondary/50"
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <span className="size-2.5 rounded-full" style={{ background: COLORS[market.id] }} aria-hidden="true" />
                      {info(market.id).label}
                    </span>
                    <span className="text-[11px] text-muted-foreground">{market.symbol}</span>
                  </span>
                  <span className="mt-1 flex items-baseline justify-between gap-2">
                    <span className="figures text-base font-semibold">{formatMoneyPrecise(market.points.at(-1)?.close ?? 0)}</span>
                    <span className={cn("figures text-sm font-medium", change >= 0 ? "text-primary" : "text-[#a33b3b]")}>
                      {pct(change)}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">
              {compare ? `What $1,000 became over ${RANGES[range].label}` : `${info(current.id).label} · ${info(current.id).sublabel}`}
            </p>
            {series.length > 1 && (
              <button
                type="button"
                onClick={() => setCompare((value) => !value)}
                aria-pressed={compare}
                className="text-xs font-medium text-primary underline-offset-2 hover:underline"
              >
                {compare ? "Show one market" : "Compare all"}
              </button>
            )}
          </div>

          {compare ? <CompareChart series={series} /> : <PriceChart id={current.id} points={current.points} range={range} />}

          {!compare && current.summary && (
            <>
              <dl className="grid gap-3 sm:grid-cols-4">
                <Fact label={`Change, ${RANGES[range].label}`} value={pct(current.summary.change)} tone={current.summary.change >= 0 ? "up" : "down"} />
                <Fact
                  label="Below its high"
                  value={current.summary.belowHigh < 0.005 ? "At the high" : pct(-current.summary.belowHigh)}
                  note={`High ${formatMoneyPrecise(current.summary.high.close)} on ${dayFormat.format(asDate(current.summary.high.date))}`}
                />
                <Fact
                  label="Biggest drop in this period"
                  value={current.summary.maxDrop.fall > 0 ? pct(-current.summary.maxDrop.fall) : "None"}
                  note={
                    current.summary.maxDrop.fall > 0
                      ? `${dayShort.format(asDate(current.summary.maxDrop.peak))} to ${dayFormat.format(asDate(current.summary.maxDrop.low))}`
                      : undefined
                  }
                />
                <Fact
                  label="$1,000 at the start"
                  value={formatMoney(current.summary.thousandBecomes)}
                  note={current.summary.volatility !== null ? `Typical yearly swing: ±${Math.round(current.summary.volatility * 100)}%` : undefined}
                />
              </dl>
              <p className="rounded-xl bg-secondary px-4 py-3 text-sm text-secondary-foreground">
                {plainEnglish(`The ${info(current.id).label.toLowerCase()}`, current.summary, RANGES[range].label)}{" "}
                {info(current.id).explainer}
              </p>
            </>
          )}

          <p className="text-xs text-muted-foreground">
            {data.source}. Last updated {dayFormat.format(new Date(data.fetchedAt))}. Past performance doesn&apos;t predict future
            results. &ldquo;Typical yearly swing&rdquo; is the annualized standard deviation of daily moves: bigger means bumpier.
            {data.unavailable.length > 0 && ` Not available right now: ${data.unavailable.map((id) => info(id).label).join(", ")}.`}
          </p>
        </div>
      )}
    </Panel>
  )
}

function Fact({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "up" | "down" }) {
  return (
    <div className="rounded-xl border px-3.5 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("figures mt-0.5 font-heading text-xl font-semibold", tone === "up" && "text-primary", tone === "down" && "text-[#a33b3b]")}>
        {value}
      </dd>
      {note && <dd className="mt-0.5 text-xs text-muted-foreground">{note}</dd>}
    </div>
  )
}

function axisDate(date: string, range: RangeKey) {
  return range === "1M" || range === "6M" ? dayShort.format(asDate(date)) : shortFormat.format(asDate(date))
}

function PriceChart({ id, points, range }: { id: MarketId; points: PricePoint[]; range: RangeKey }) {
  const config = { close: { label: "Price", color: COLORS[id] } } satisfies ChartConfig
  const data = thin(points, MAX_CHART_POINTS)
  const values = data.map((point) => point.close)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const pad = (max - min) * 0.08 || max * 0.02
  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full" role="img" aria-label={`${info(id).label} price over ${RANGES[range].label}`}>
      <AreaChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
        <defs>
          <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-close)" stopOpacity={0.25} />
            <stop offset="100%" stopColor="var(--color-close)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={40} tickFormatter={(date: string) => axisDate(date, range)} />
        <YAxis
          width={64}
          tickLine={false}
          axisLine={false}
          domain={[Math.max(0, min - pad), max + pad]}
          tickFormatter={(value: number) => formatMoney(value)}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const date = payload?.[0]?.payload?.date as string | undefined
                return date ? dayFormat.format(asDate(date)) : ""
              }}
              formatter={(value) => formatMoneyPrecise(Number(value))}
            />
          }
        />
        <Area dataKey="close" type="monotone" stroke="var(--color-close)" strokeWidth={2} fill={`url(#fill-${id})`} isAnimationActive={false} />
      </AreaChart>
    </ChartContainer>
  )
}

function CompareChart({ series }: { series: { id: MarketId; points: PricePoint[] }[] }) {
  const config = Object.fromEntries(series.map((market) => [market.id, { label: info(market.id).label, color: COLORS[market.id] }])) satisfies ChartConfig
  // Join the rebased series by date; each market only has values on its own trading days.
  const byDate = new Map<string, Record<string, number | string>>()
  for (const market of series) {
    for (const point of rebase(thin(market.points, MAX_CHART_POINTS))) {
      const row = byDate.get(point.date) ?? { date: point.date }
      row[market.id] = point.value
      byDate.set(point.date, row)
    }
  }
  const data = [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)))
  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full" role="img" aria-label="Growth of $1,000 in each market">
      <LineChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={40} tickFormatter={(date: string) => shortFormat.format(asDate(date))} />
        <YAxis width={64} tickLine={false} axisLine={false} domain={["auto", "auto"]} tickFormatter={(value: number) => formatMoney(value)} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const date = payload?.[0]?.payload?.date as string | undefined
                return date ? dayFormat.format(asDate(date)) : ""
              }}
              formatter={(value, name) => `${config[name as MarketId]?.label ?? name}: ${formatMoney(Number(value))}`}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        {series.map((market) => (
          <Line key={market.id} dataKey={market.id} type="monotone" stroke={`var(--color-${market.id})`} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
        ))}
      </LineChart>
    </ChartContainer>
  )
}
