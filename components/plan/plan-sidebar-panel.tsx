"use client"

import Link from "next/link"
import { ArrowRightIcon, CompassIcon } from "lucide-react"

import { formatMoney } from "@/lib/format"
import { buildRoadmap } from "@/lib/plan/roadmap"
import { portfolioStore, profileStore, sharePlanStore } from "@/lib/stores"
import { useHydrated, useStoredValue } from "@/lib/use-stored-value"

/** The assistant sidebar's view of My plan and Portfolio, with the switch that shares them. */
export function PlanSidebarPanel() {
  const profile = useStoredValue(profileStore)
  const portfolio = useStoredValue(portfolioStore)
  const share = useStoredValue(sharePlanStore)
  const loaded = useHydrated()
  const hasProfile = Boolean(profile?.updatedAt)
  const holdings = portfolio?.holdings ?? []
  const total = holdings.reduce((sum, holding) => sum + holding.value, 0)
  const roadmap = hasProfile && profile ? buildRoadmap(profile) : null

  return (
    <section aria-labelledby="plan-panel-title" className="space-y-2">
      <h2 id="plan-panel-title" className="flex items-center gap-2 font-sans text-sm font-semibold">
        <CompassIcon className="size-4 text-primary" aria-hidden="true" />
        Your plan
      </h2>
      {!loaded ? null : !hasProfile && holdings.length === 0 ? (
        <div className="rounded-xl border border-dashed px-3 py-3 text-xs text-muted-foreground">
          <p>Fill in your plan so answers fit your goals, savings and debts instead of starting from scratch.</p>
          <Link href="/plan" className="mt-2 inline-flex items-center gap-1 font-medium text-primary hover:underline">
            Set up my plan <ArrowRightIcon className="size-3" aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <>
          <div className="space-y-1.5 rounded-xl border bg-background px-3 py-2.5 text-xs">
            {roadmap?.current ? (
              <p>
                <span className="font-medium">
                  Step {roadmap.steps.indexOf(roadmap.current) + 1} of {roadmap.steps.length}:
                </span>{" "}
                {roadmap.current.title}
              </p>
            ) : (
              <p className="text-muted-foreground">No plan yet.</p>
            )}
            <p className="text-muted-foreground">
              {holdings.length > 0
                ? `${holdings.length} ${holdings.length === 1 ? "holding" : "holdings"}, ${formatMoney(total)}`
                : "No holdings entered"}
            </p>
            <div className="flex gap-3 pt-0.5">
              <Link href="/plan" className="font-medium text-primary hover:underline">
                My plan
              </Link>
              <Link href="/portfolio" className="font-medium text-primary hover:underline">
                Portfolio
              </Link>
            </div>
          </div>
          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-xs hover:bg-background">
            <input
              type="checkbox"
              checked={share}
              onChange={(event) => sharePlanStore.set(event.target.checked)}
              className="mt-0.5 size-3.5 accent-primary"
            />
            <span>
              <span className="block font-medium">Let the assistant see my plan and portfolio</span>
              <span className="text-muted-foreground">
                {share ? "Sent with each question so advice fits your situation." : "Off: answers won't use your plan."}
              </span>
            </span>
          </label>
        </>
      )}
    </section>
  )
}
