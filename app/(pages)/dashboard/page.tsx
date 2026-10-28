import type { Metadata } from "next"
import { ArrowDownIcon } from "lucide-react"
import { cn } from "cn"

import { BudgetPlanner } from "@/components/budget-planner"
import { FinanceOverview } from "@/components/finances/finance-overview"
import { PageHeader } from "@/components/page-header"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card"
import { pageMetadata } from "@/lib/seo/metadata"
import { PUBLIC_PAGES } from "@/lib/seo/pages"
import { siteFeatures } from "@/lib/site-features"

export const metadata: Metadata = pageMetadata(PUBLIC_PAGES.dashboard)

export default function DashboardPage() {
  const { accounts } = siteFeatures()
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <PageHeader
        eyebrow="Dashboard"
        title="Your money, in detail"
        description="Plan each month's budget from the day you're paid, then import your transactions to see where your money goes and what investing could do."
        actions={
          <a href="#your-finances" className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
            Your transactions
            <ArrowDownIcon aria-hidden="true" />
          </a>
        }
      />

      <section id="budget-planner" aria-labelledby="budget-planner-title" className="mt-10 scroll-mt-24">
        <Card>
          <CardHeader className="border-b pb-4">
            <h2 id="budget-planner-title" className="text-xl leading-snug font-medium">
              Budget planner
            </h2>
            <CardDescription>
              Plan each month from the day you&apos;re paid and compare it with the 50/30/20 guideline. Your plan is saved
              for each month, in this browser{accounts && <> and in your account when you&apos;re logged in</>}. It
              isn&apos;t sent to the assistant.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <BudgetPlanner />
          </CardContent>
        </Card>
      </section>

      {/* The planner above can be ~3,400 px tall on a phone; the header's "Your transactions" link jumps here. */}
      <section id="your-finances" aria-labelledby="your-finances-title" className="mt-10 scroll-mt-24">
        <h2 id="your-finances-title" className="sr-only">
          Your transactions
        </h2>
        <FinanceOverview />
      </section>
    </main>
  )
}
