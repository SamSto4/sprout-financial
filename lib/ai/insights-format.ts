// The shape of the dashboard's AI spending insights: the JSON schema Claude must follow, and a
// validator used on the server (model output) and in the browser (stored results).
// Kept free of framework imports so it can be unit-tested with `node --test`.

export const INSIGHT_KINDS = ["trend", "saving", "warning", "positive"] as const
export type InsightKind = (typeof INSIGHT_KINDS)[number]

export type Insight = {
  kind: InsightKind
  title: string
  detail: string
  /** The key number, quoted from the computed data, e.g. "$185/yr". */
  figure: string
  action: string
}

export type SpendingInsights = {
  headline: string
  insights: Insight[]
  nextStep: string
}

export const MAX_INSIGHTS = 6

const insightSchema = {
  type: "object",
  properties: {
    kind: { type: "string", enum: [...INSIGHT_KINDS] },
    title: { type: "string", description: "Under 8 words." },
    detail: { type: "string", description: "One or two sentences on what it is and why it matters." },
    figure: { type: "string", description: "The key figure, quoted from the data, e.g. \"$185/yr\"." },
    action: { type: "string", description: "One concrete thing to try this month." },
  },
  required: ["kind", "title", "detail", "figure", "action"],
  additionalProperties: false,
}

/** JSON schema for structured output. Field names are snake_case on the wire. */
export const INSIGHTS_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string", description: "One sentence summing up their spending picture." },
    insights: { type: "array", items: insightSchema, description: "3 to 5 insights, most useful first." },
    next_step: { type: "string", description: "The single most useful thing to do next." },
  },
  required: ["headline", "insights", "next_step"],
  additionalProperties: false,
}

function text(value: unknown, maxLength: number) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : null
}

/** Validates insights from the model (snake_case) or from storage (camelCase). */
export function parseInsights(raw: unknown): SpendingInsights | null {
  if (typeof raw !== "object" || raw === null) return null
  const record = raw as Record<string, unknown>
  const headline = text(record.headline, 300)
  const nextStep = text(record.next_step ?? record.nextStep, 400)
  if (!headline || !nextStep || !Array.isArray(record.insights)) return null

  const insights: Insight[] = []
  for (const item of record.insights) {
    if (insights.length >= MAX_INSIGHTS) break
    if (typeof item !== "object" || item === null) continue
    const { kind, title, detail, figure, action } = item as Record<string, unknown>
    if (!INSIGHT_KINDS.includes(kind as InsightKind)) continue
    const clean = {
      title: text(title, 100),
      detail: text(detail, 500),
      figure: text(figure, 40),
      action: text(action, 300),
    }
    if (!clean.title || !clean.detail || !clean.figure || !clean.action) continue
    insights.push({ kind: kind as InsightKind, ...clean } as Insight)
  }
  return insights.length > 0 ? { headline, insights, nextStep } : null
}

/** Stored insights, tied to the file they describe so a new import doesn't show stale ones. */
export type StoredInsights = { sourceKey: string; generatedAt: string; insights: SpendingInsights }

export function parseStoredInsights(raw: unknown): StoredInsights | null {
  if (typeof raw !== "object" || raw === null) return null
  const { sourceKey, generatedAt, insights } = raw as Record<string, unknown>
  const parsed = parseInsights(insights)
  if (typeof sourceKey !== "string" || typeof generatedAt !== "string" || !parsed) return null
  return { sourceKey, generatedAt, insights: parsed }
}
