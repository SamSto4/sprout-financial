import type { Metadata } from "next"

import { PageHeader } from "@/components/page-header"
import { PlanBuilder } from "@/components/plan/plan-builder"

export const metadata: Metadata = { title: "My plan" }

export default function PlanPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <PageHeader
        eyebrow="My plan"
        title="Your plan, step by step"
        description="Tell Sprout about your goals, savings and debts. You'll get a roadmap of what to do next, a target mix for your investments, and an assistant that already knows your situation."
      />
      <PlanBuilder />
    </main>
  )
}
