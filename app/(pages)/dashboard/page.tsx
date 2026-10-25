import type { Metadata } from "next"

import { BudgetPlanner } from "@/components/budget-planner"
import { FinanceOverview } from "@/components/finances/finance-overview"
import { PageHeader } from "@/components/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata: Metadata = { title: "Dashboard" }

export default function DashboardPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <PageHeader
        eyebrow="Dashboard"
        title="Your money, in detail"
        description="Import your transactions to see where your money goes, then plan a budget and explore what investing could do."
      />

      <section aria-label="Your finances" className="mt-10">
        <FinanceOverview />
      </section>

      <Card id="budget-planner" className="mt-10 scroll-mt-24">
        <CardHeader className="border-b pb-4">
          <CardTitle className="text-xl">Budget planner</CardTitle>
          <CardDescription>
            Plan each month and compare it with the 50/30/20 guideline. Your plan is saved for each month, in this browser and in your account when you&apos;re logged in. It isn&apos;t sent to the assistant.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          <BudgetPlanner />
        </CardContent>
      </Card>
    </main>
  )
}
