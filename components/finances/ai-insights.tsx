"use client"

import { useEffect, useRef, useState } from "react"
import {
  CheckCircle2Icon,
  MessageSquareTextIcon,
  PiggyBankIcon,
  RefreshCwIcon,
  SparklesIcon,
  TrendingUpIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react"
import { cn } from "cn"

import { BrandMark } from "@/components/brand-mark"
import { Button } from "@/components/ui/button"
import { parseInsights, type Insight, type InsightKind } from "@/lib/ai/insights-format"
import type { ImportedFinances } from "@/lib/finance/transactions"
import { financesKey, insightsStore } from "@/lib/stores"
import { useStoredValue } from "@/lib/use-stored-value"

const KINDS: Record<InsightKind, { label: string; icon: LucideIcon; chip: string; accent: string }> = {
  trend: { label: "Trend", icon: TrendingUpIcon, chip: "bg-secondary text-primary", accent: "bg-chart-2" },
  saving: { label: "Saving idea", icon: PiggyBankIcon, chip: "bg-secondary text-primary", accent: "bg-brand" },
  warning: { label: "Heads up", icon: TriangleAlertIcon, chip: "bg-warning/12 text-[#7a5516]", accent: "bg-warning" },
  positive: { label: "Going well", icon: CheckCircle2Icon, chip: "bg-secondary text-primary", accent: "bg-primary" },
}

const generatedFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })

type Status = "idle" | "loading" | "error"

// The dashboard's AI review: sends the imported transactions to /api/insights only when the user
// asks, then keeps the result in this browser alongside the file it describes.
export function AiInsights({
  finances,
  onAsk,
}: {
  finances: ImportedFinances
  /** Hands a follow-up question to the dashboard chat. */
  onAsk: (question: string) => void
}) {
  const stored = useStoredValue(insightsStore)
  const [status, setStatus] = useState<Status>("idle")
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const sourceKey = financesKey(finances)
  const current = stored?.sourceKey === sourceKey ? stored : null

  useEffect(() => () => abortRef.current?.abort(), [])

  async function review() {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setStatus("loading")
    setError(null)

    try {
      const response = await fetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions: finances.transactions }),
        signal: controller.signal,
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error ?? "The review couldn't be completed. Please try again.")
      const insights = parseInsights(data?.insights)
      if (!insights) throw new Error("The review came back in an unexpected format. Please try again.")
      insightsStore.set({ sourceKey, generatedAt: new Date().toISOString(), insights })
      setStatus("idle")
    } catch (err) {
      if (controller.signal.aborted) return
      setError(err instanceof Error ? err.message : "The review couldn't be completed. Please try again.")
      setStatus("error")
    }
  }

  return (
    <section
      aria-labelledby="ai-insights-title"
      className="overflow-hidden rounded-2xl border bg-card shadow-[0_1px_2px_rgb(24_53_42/0.04),0_12px_32px_-18px_rgb(24_53_42/0.2)]"
    >
      <div className="flex flex-col gap-4 border-b bg-surface px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-3">
          <BrandMark className="size-10 shrink-0" />
          <div>
            <h2 id="ai-insights-title" className="text-xl font-semibold">
              AI spending review
            </h2>
            <p className="text-sm text-muted-foreground">
              {current
                ? `Based on ${finances.fileName} · ${generatedFormat.format(new Date(current.generatedAt))}`
                : "Practical tips and trends from your own transactions"}
            </p>
          </div>
        </div>
        {current && status !== "loading" && (
          <Button type="button" variant="outline" onClick={review}>
            <RefreshCwIcon />
            Refresh
          </Button>
        )}
      </div>

      <div className="p-5 sm:p-6" aria-live="polite" aria-busy={status === "loading"}>
        {status === "loading" ? (
          <Loading count={finances.transactions.length} />
        ) : current ? (
          <Results insights={current.insights.insights} headline={current.insights.headline} nextStep={current.insights.nextStep} onAsk={onAsk} />
        ) : (
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl space-y-2">
              <p className="text-foreground/90">
                Get a short review of your spending: what changed month to month, where money quietly adds up, and one
                concrete thing to try next. All the figures are calculated from your file first; the AI explains them.
              </p>
              <p className="text-xs text-muted-foreground">
                This sends your {finances.transactions.length.toLocaleString()} imported transactions to the assistant
                (Claude) for this review. The review itself is kept only on this device.
              </p>
            </div>
            <Button type="button" size="lg" onClick={review} className="h-10 shrink-0 px-4">
              <SparklesIcon />
              Review my spending
            </Button>
          </div>
        )}

        {status === "error" && error && (
          <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm text-[#a33b3b]">
            {error}
            <Button type="button" size="sm" variant="outline" onClick={review}>
              Try again
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}

function Loading({ count }: { count: number }) {
  return (
    <div>
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        Reviewing {count.toLocaleString()} transactions. This usually takes 10–20 seconds
        <span className="flex gap-1" aria-hidden="true">
          <span className="animate-pulse-dot size-1.5 rounded-full bg-brand" />
          <span className="animate-pulse-dot size-1.5 rounded-full bg-brand [animation-delay:0.15s]" />
          <span className="animate-pulse-dot size-1.5 rounded-full bg-brand [animation-delay:0.3s]" />
        </span>
      </p>
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <div key={index} className="h-44 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    </div>
  )
}

function Results({
  headline,
  insights,
  nextStep,
  onAsk,
}: {
  headline: string
  insights: Insight[]
  nextStep: string
  onAsk: (question: string) => void
}) {
  return (
    <div className="space-y-5">
      <p className="figures max-w-4xl font-heading text-xl leading-snug sm:text-2xl">{headline}</p>

      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {insights.map((insight, index) => {
          const kind = KINDS[insight.kind]
          const Icon = kind.icon
          return (
            <li key={index} className="animate-rise relative flex flex-col overflow-hidden rounded-xl border bg-background p-4 pl-5">
              <span className={cn("absolute inset-y-0 left-0 w-1", kind.accent)} aria-hidden="true" />
              <span className={cn("inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium", kind.chip)}>
                <Icon className="size-3.5" aria-hidden="true" />
                {kind.label}
              </span>
              <h3 className="mt-2.5 font-sans text-base font-semibold">{insight.title}</h3>
              <p className="figures mt-1 font-heading text-2xl font-semibold text-primary">{insight.figure}</p>
              <p className="figures mt-2 text-sm leading-relaxed text-foreground/85">{insight.detail}</p>
              <p className="mt-3 rounded-lg bg-surface px-3 py-2 text-sm leading-relaxed">
                <span className="font-medium text-primary">Try this: </span>
                {insight.action}
              </p>
              <div className="mt-auto pt-3">
                <button
                  type="button"
                  onClick={() => onAsk(`About "${insight.title}": ${insight.detail} Can you explain this and help me act on it?`)}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-2 hover:underline"
                >
                  <MessageSquareTextIcon className="size-4" aria-hidden="true" />
                  Ask about this
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      <div className="figures rounded-xl bg-primary px-5 py-4 text-primary-foreground">
        <p className="text-xs font-semibold tracking-wide uppercase opacity-80">Next step</p>
        <p className="mt-1 leading-relaxed">{nextStep}</p>
      </div>

      <p className="text-xs text-muted-foreground">
        Generated by AI from figures calculated from your file. It can make mistakes, and it&apos;s educational
        information, not financial advice.
      </p>
    </div>
  )
}
