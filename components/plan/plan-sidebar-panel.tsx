"use client"

import Link from "next/link"
import { ArrowRightIcon, CompassIcon } from "lucide-react"

import { SettingSwitch } from "@/components/setting-switch"
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
      <h2 id="plan-panel-title" className="flex items-center gap-2 px-0.5 font-sans text-sm font-semibold">
        <CompassIcon className="size-4 text-primary" aria-hidden="true" />
        Your plan
      </h2>
      {!loaded ? null : !hasProfile && holdings.length === 0 ? (
        <div className="rounded-xl bg-surface px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
          <p>Fill in your plan so answers fit your goals, savings and debts instead of starting from scratch.</p>
          <Link
            href="/plan"
            className="group/link -mx-1 mt-1.5 inline-flex min-h-8 items-center gap-1 rounded-md px-1 font-medium text-primary hover:underline hover:underline-offset-4"
          >
            Set up my plan
            <ArrowRightIcon
              className="size-3 transition-transform duration-(--duration-fast) ease-out group-hover/link:translate-x-0.5"
              aria-hidden="true"
            />
          </Link>
        </div>
      ) : (
        <>
          <div className="space-y-1 rounded-xl bg-surface px-3.5 py-3 text-xs leading-relaxed">
            {roadmap?.current ? (
              <p>
                <span className="figures font-semibold text-primary">
                  Step {roadmap.steps.indexOf(roadmap.current) + 1} of {roadmap.steps.length}:
                </span>{" "}
                <span className="font-medium">{roadmap.current.title}</span>
              </p>
            ) : (
              <p className="text-muted-foreground">No plan yet.</p>
            )}
            <p className="figures text-muted-foreground">
              {holdings.length > 0
                ? `${holdings.length} ${holdings.length === 1 ? "holding" : "holdings"}, ${formatMoney(total)}`
                : "No holdings entered"}
            </p>
            <div className="-mx-1 flex gap-1 pt-0.5">
              <Link
                href="/plan"
                className="inline-flex min-h-8 items-center rounded-md px-1 font-medium text-primary hover:underline hover:underline-offset-4"
              >
                My plan
              </Link>
              <Link
                href="/portfolio"
                className="inline-flex min-h-8 items-center rounded-md px-1 font-medium text-primary hover:underline hover:underline-offset-4"
              >
                Portfolio
              </Link>
            </div>
          </div>
          <SettingSwitch
            checked={share}
            onCheckedChange={(on) => sharePlanStore.set(on)}
            label="Let the assistant see my plan and portfolio"
            description={share ? "Sent with each question so advice fits your situation." : "Off: answers won't use your plan."}
          />
        </>
      )}
    </section>
  )
}
