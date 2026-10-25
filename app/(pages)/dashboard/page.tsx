import type { Metadata } from "next"

import { BudgetPlanner } from "@/components/budget-planner"
import { FinanceOverview } from "@/components/finances/finance-overview"
import { PageHeader } from "@/components/page-header"
import TradingViewWidget from "@/components/tradingview-widget"
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
            Compare a monthly plan with the 50/30/20 guideline. Nothing you type here is saved or sent anywhere.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          <BudgetPlanner />
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-xl">Market overview</CardTitle>
          <CardDescription>
            The whole market at a glance through three broad funds: US stocks (SPY), stocks worldwide (VT) and US bonds (BND).
            Prices from TradingView may be delayed. A single day&apos;s move says little about long-term investing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TradingViewWidget />
        </CardContent>
      </Card>
    </main>
  )
}
