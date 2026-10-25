import type { Metadata } from "next"
import { connection } from "next/server"

import { PageHeader } from "@/components/page-header"
import { PortfolioBuilder } from "@/components/portfolio/portfolio-builder"
import { isMarketDataConfigured } from "@/lib/market/fmp"

export const metadata: Metadata = { title: "Portfolio" }

export default async function PortfolioPage() {
  // Whether live prices are available is a server setting, read per request.
  await connection()
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <PageHeader
        eyebrow="Portfolio"
        title="Check up on your investments"
        description="See what you really own, how it compares with your plan, what fees cost you, and what a market drop would mean. Nothing here buys or sells anything."
      />
      <PortfolioBuilder liveData={isMarketDataConfigured()} />
    </main>
  )
}
