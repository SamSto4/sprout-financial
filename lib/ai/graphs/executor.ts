// Turns a chart request from the agent into a validated GraphConfig the chat can render.
// The model's input is untrusted, so every field is checked and capped here.
// Kept free of framework imports so it can be unit-tested with `node --test`.

import type { GraphConfig, GraphInteraction, GraphSeries, GraphType } from "./graphtypes"

/** The chart types the chat can draw today (a subset of GraphType). */
export const RENDERED_GRAPH_TYPES = ["bar", "line", "area", "pie"] as const satisfies readonly GraphType[]

const INTERACTIONS: GraphInteraction[] = ["hover", "tooltip", "legend", "zoom", "pan", "filter", "toggle-series", "select"]
const DEFAULT_INTERACTIONS: GraphInteraction[] = ["hover", "tooltip", "legend", "toggle-series"]

export const MAX_GRAPH_POINTS = 120
export const MAX_GRAPH_SERIES = 6
export const MAX_PIE_SLICES = 8
const MAX_KEY_LENGTH = 40
const MAX_LABEL_LENGTH = 60

export type GraphResult = { ok: true; graph: GraphConfig } | { ok: false; error: string }

function text(value: unknown, maxLength: number): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : undefined
}

function isKey(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(value)
}

function axis(value: unknown) {
  if (typeof value !== "object" || value === null) return undefined
  const { key, label } = value as Record<string, unknown>
  if (!isKey(key)) return undefined
  return { key, ...(text(label, MAX_LABEL_LENGTH) ? { label: text(label, MAX_LABEL_LENGTH) } : {}) }
}

/**
 * Validates a chart. `now` is injectable so tests are deterministic.
 * Errors are written for the model, so it can fix its input and try again.
 */
export function executeGraph(input: unknown, now: Date = new Date()): GraphResult {
  if (typeof input !== "object" || input === null) return { ok: false, error: "The chart must be an object." }
  const raw = input as Record<string, unknown>

  const type = raw.type
  if (!RENDERED_GRAPH_TYPES.includes(type as (typeof RENDERED_GRAPH_TYPES)[number])) {
    return { ok: false, error: `type must be one of: ${RENDERED_GRAPH_TYPES.join(", ")}.` }
  }

  const xAxis = axis(raw.xAxis ?? raw.x_axis)
  if (!xAxis) return { ok: false, error: "xAxis.key must name the field holding each point's label (letters, numbers, _ or -, no spaces)." }

  if (!Array.isArray(raw.series) || raw.series.length === 0) {
    return { ok: false, error: "series must list at least one numeric field to plot." }
  }
  const series: GraphSeries[] = []
  for (const item of raw.series.slice(0, MAX_GRAPH_SERIES)) {
    if (typeof item !== "object" || item === null) continue
    const { key, label } = item as Record<string, unknown>
    if (!isKey(key) || key === xAxis.key || series.some((existing) => existing.key === key)) continue
    series.push({ key, ...(text(label, MAX_LABEL_LENGTH) ? { label: text(label, MAX_LABEL_LENGTH) } : {}) })
  }
  if (series.length === 0) return { ok: false, error: "series keys must be field names, different from xAxis.key." }
  if (type === "pie" && series.length !== 1) return { ok: false, error: "A pie chart needs exactly one series." }

  if (!Array.isArray(raw.data) || raw.data.length === 0) return { ok: false, error: "data must be a non-empty array of points." }
  const limit = type === "pie" ? MAX_PIE_SLICES : MAX_GRAPH_POINTS
  if (raw.data.length > limit) return { ok: false, error: `data can have at most ${limit} points for a ${type} chart.` }

  const data: Record<string, string | number | null>[] = []
  for (const [index, point] of raw.data.entries()) {
    if (typeof point !== "object" || point === null) return { ok: false, error: `data[${index}] must be an object.` }
    const values = point as Record<string, unknown>
    const label = values[xAxis.key]
    if (typeof label !== "string" && typeof label !== "number") {
      return { ok: false, error: `data[${index}].${xAxis.key} must be a label (text or number).` }
    }
    const row: Record<string, string | number | null> = {
      [xAxis.key]: typeof label === "string" ? label.slice(0, MAX_KEY_LENGTH * 2) : label,
    }
    for (const { key } of series) {
      const value = values[key]
      if (value === null || value === undefined) row[key] = null
      else if (typeof value === "number" && Number.isFinite(value)) row[key] = value
      else return { ok: false, error: `data[${index}].${key} must be a number or null.` }
    }
    data.push(row)
  }
  if (type === "pie" && data.some((row) => { const value = row[series[0].key]; return typeof value === "number" && value < 0 })) {
    return { ok: false, error: "Pie slices can't be negative. Use a bar chart instead." }
  }

  const interactions = Array.isArray(raw.interactions)
    ? raw.interactions.filter((value): value is GraphInteraction => INTERACTIONS.includes(value as GraphInteraction))
    : DEFAULT_INTERACTIONS

  const yAxis = axis(raw.yAxis ?? raw.y_axis)
  const metadata = typeof raw.metadata === "object" && raw.metadata !== null ? (raw.metadata as Record<string, unknown>) : {}
  const source = text(raw.source ?? metadata.source, 200)

  return {
    ok: true,
    graph: {
      type: type as GraphType,
      ...(text(raw.title, 120) ? { title: text(raw.title, 120) } : {}),
      ...(text(raw.description, 300) ? { description: text(raw.description, 300) } : {}),
      xAxis,
      ...(yAxis ? { yAxis } : {}),
      data,
      series,
      interactions: interactions.length > 0 ? interactions : DEFAULT_INTERACTIONS,
      responsive: true,
      animated: false,
      metadata: { ...(source ? { source } : {}), generatedBy: "assistant", createdAt: now.toISOString() },
    },
  }
}

/** The sample chart this folder started with, kept as a reference input. */
export const EXAMPLE_GRAPH: GraphConfig = {
  type: "line",
  title: "Revenue Over Time",
  xAxis: { key: "month", label: "Month" },
  yAxis: { key: "revenue", label: "Revenue" },
  interactions: ["hover", "tooltip", "legend", "zoom"],
  responsive: true,
  animated: true,
  data: [
    { month: "Jan", revenue: 12000 },
    { month: "Feb", revenue: 14500 },
    { month: "Mar", revenue: 17800 },
    { month: "Apr", revenue: 19200 },
  ],
  series: [{ key: "revenue", label: "Revenue" }],
}
