"use client"

import { useMemo, useState } from "react"
import { Area, AreaChart, Bar, BarChart, Brush, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, XAxis, YAxis } from "recharts"
import { cn } from "cn"

import { ArtifactFrame, downloadCsv } from "@/components/artifacts/artifact-frame"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import type { GraphConfig } from "@/lib/ai/graphs/graphtypes"
import { formatMoneyCompact, formatMoneyPrecise, formatNumber, formatNumberCompact } from "@/lib/format"

const SERIES_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)", "var(--series-6)"]

type ValueFormat = "money" | "percent" | "number"

/** Values are money when an axis or series label mentions "$", percent when it mentions "%". */
function valueFormat(graph: GraphConfig): ValueFormat {
  const labels = [graph.yAxis?.label, ...graph.series.map((series) => series.label)].join(" ")
  if (/\$/.test(labels)) return "money"
  if (/%/.test(labels)) return "percent"
  return "number"
}

function formatValue(value: number, format: ValueFormat, compact = false) {
  if (format === "money") return compact ? formatMoneyCompact(value) : formatMoneyPrecise(value)
  if (format === "percent") return `${formatNumber(value)}%`
  return compact ? formatNumberCompact(value) : formatNumber(value)
}

// An interactive chart the agent added to a reply: tooltips, a legend that hides and shows
// series, zoom on long series, a table view and CSV download.
export function ChartArtifact({ graph }: { graph: GraphConfig }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [asTable, setAsTable] = useState(false)
  const xKey = graph.xAxis?.key ?? "label"
  const format = valueFormat(graph)
  const interactions = new Set(graph.interactions ?? [])
  const canToggle = graph.type !== "pie" && graph.series.length > 1 && (interactions.has("toggle-series") || interactions.has("legend"))
  const zoom = graph.type !== "pie" && interactions.has("zoom") && graph.data.length > 12

  const config = useMemo(
    () =>
      Object.fromEntries(
        graph.series.map((series, index) => [series.key, { label: series.label ?? series.key, color: SERIES_COLORS[index % SERIES_COLORS.length] }])
      ) satisfies ChartConfig,
    [graph.series]
  )
  const visible = graph.series.filter((series) => !hidden.has(series.key))

  const headers = [graph.xAxis?.label ?? xKey, ...graph.series.map((series) => series.label ?? series.key)]
  const rows = graph.data.map((point) => [point[xKey] as string | number, ...graph.series.map((series) => point[series.key] as number | null)])

  function toggle(key: string) {
    setHidden((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else if (visible.length > 1) next.add(key)
      return next
    })
  }

  const tooltip = (
    <ChartTooltip
      cursor={graph.type === "bar" ? { fill: "var(--muted)", opacity: 0.6 } : true}
      content={
        <ChartTooltipContent
          formatter={(value, name, item) => (
            <div className="flex w-full items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="size-2.5 rounded-[2px]" style={{ background: item.color ?? item.payload?.fill }} aria-hidden="true" />
                {config[String(name)]?.label ?? String(name)}
              </span>
              <span className="figures font-medium text-foreground">{formatValue(Number(value), format)}</span>
            </div>
          )}
        />
      }
    />
  )

  const axes = (
    <>
      <CartesianGrid vertical={false} />
      <XAxis dataKey={xKey} tickLine={false} axisLine={false} tickMargin={8} minTickGap={12} />
      <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={(value: number) => formatValue(value, format, true)} />
    </>
  )
  const brush = zoom ? <Brush dataKey={xKey} height={22} stroke="var(--primary)" travellerWidth={8} /> : null

  let chart
  if (graph.type === "pie") {
    const key = graph.series[0].key
    chart = (
      <PieChart>
        {tooltip}
        <Pie data={graph.data} dataKey={key} nameKey={xKey} innerRadius="45%" outerRadius="80%" stroke="var(--background)" strokeWidth={2} isAnimationActive={false}>
          {graph.data.map((_, index) => (
            <Cell key={index} fill={SERIES_COLORS[index % SERIES_COLORS.length]} />
          ))}
        </Pie>
      </PieChart>
    )
  } else if (graph.type === "bar") {
    chart = (
      <BarChart accessibilityLayer data={graph.data} margin={{ left: 4, right: 8, top: 8 }} barGap={2}>
        {axes}
        {tooltip}
        {visible.map((series) => (
          <Bar key={series.key} dataKey={series.key} fill={`var(--color-${series.key})`} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        ))}
        {brush}
      </BarChart>
    )
  } else if (graph.type === "area") {
    chart = (
      <AreaChart accessibilityLayer data={graph.data} margin={{ left: 4, right: 8, top: 8 }}>
        {axes}
        {tooltip}
        {visible.map((series) => (
          <Area
            key={series.key}
            dataKey={series.key}
            type="monotone"
            stroke={`var(--color-${series.key})`}
            fill={`var(--color-${series.key})`}
            fillOpacity={0.15}
            strokeWidth={2}
            isAnimationActive={false}
          />
        ))}
        {brush}
      </AreaChart>
    )
  } else {
    chart = (
      <LineChart accessibilityLayer data={graph.data} margin={{ left: 4, right: 8, top: 8 }}>
        {axes}
        {tooltip}
        {visible.map((series) => (
          <Line
            key={series.key}
            dataKey={series.key}
            type="monotone"
            stroke={`var(--color-${series.key})`}
            strokeWidth={2}
            dot={graph.data.length <= 24 ? { r: 3 } : false}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
        ))}
        {brush}
      </LineChart>
    )
  }

  // Pie slices are the categories; other charts list their series.
  const legend =
    graph.type === "pie"
      ? graph.data.map((point, index) => ({ key: String(point[xKey]), label: String(point[xKey]), color: SERIES_COLORS[index % SERIES_COLORS.length] }))
      : graph.series.map((series, index) => ({ key: series.key, label: series.label ?? series.key, color: SERIES_COLORS[index % SERIES_COLORS.length] }))

  return (
    <ArtifactFrame
      title={graph.title}
      description={graph.description}
      source={graph.metadata?.source}
      onDownload={() => downloadCsv(graph.title, headers, rows)}
      actions={
        <button
          type="button"
          onClick={() => setAsTable((value) => !value)}
          aria-pressed={asTable}
          className="rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-secondary"
        >
          {asTable ? "Chart" : "Table"}
        </button>
      }
    >
      {asTable ? (
        <div className="max-h-80 overflow-auto">
          <table className="figures w-full text-sm">
            <caption className="sr-only">{graph.title ?? "Chart data"}</caption>
            <thead className="sticky top-0 bg-background text-xs text-muted-foreground">
              <tr>
                {headers.map((header, index) => (
                  <th key={header} scope="col" className={cn("border-b px-2 py-1.5 font-semibold", index === 0 ? "text-left" : "text-right")}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b last:border-0">
                  {row.map((cell, index) =>
                    index === 0 ? (
                      <th key={index} scope="row" className="px-2 py-1.5 text-left font-medium">{cell}</th>
                    ) : (
                      <td key={index} className="px-2 py-1.5 text-right">
                        {typeof cell === "number" ? formatValue(cell, format) : "—"}
                      </td>
                    )
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <ul className="mb-2 flex flex-wrap gap-x-3 gap-y-1" aria-label="Legend">
            {legend.map((item) => {
              const off = hidden.has(item.key)
              const content = (
                <>
                  <span className="size-2.5 rounded-[2px]" style={{ background: item.color, opacity: off ? 0.3 : 1 }} aria-hidden="true" />
                  <span className={cn(off && "text-muted-foreground line-through")}>{item.label}</span>
                </>
              )
              return (
                <li key={item.key}>
                  {canToggle ? (
                    <button
                      type="button"
                      onClick={() => toggle(item.key)}
                      aria-pressed={!off}
                      className="inline-flex items-center gap-1.5 rounded px-1 text-xs hover:bg-muted"
                    >
                      {content}
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-1 text-xs">{content}</span>
                  )}
                </li>
              )
            })}
          </ul>
          <ChartContainer config={config} className={cn("aspect-auto w-full", graph.type === "pie" ? "h-64" : zoom ? "h-80" : "h-72")}>
            {chart}
          </ChartContainer>
          {canToggle && <p className="mt-1 text-[11px] text-muted-foreground">Click a legend item to hide or show it.</p>}
        </>
      )}
    </ArtifactFrame>
  )
}
