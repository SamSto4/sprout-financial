"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { MessageSquareTextIcon, PlusIcon, RefreshCwIcon, SparklesIcon, Trash2Icon } from "lucide-react"
import { cn } from "cn"

import { CheckItem, NumberField, Panel } from "@/components/plan/fields"
import { HoldingsImport } from "@/components/portfolio/holdings-import"
import { useHoldingsScreenshots } from "@/components/portfolio/holdings-screenshots"
import { ScreenshotButton, ScreenshotPrivacyNote } from "@/components/screenshots/screenshot-button"
import { MarketSection } from "@/components/portfolio/market-section"
import { Button, buttonVariants } from "@/components/ui/button"
import { formatMoney, formatMoneyPrecise, formatPercent } from "@/lib/format"
import { targetStockRange } from "@/lib/plan/profile"
import { buildRoadmap } from "@/lib/plan/roadmap"
import { analyzePortfolio, nextDollars, rebalancePlan, stressTest, type PortfolioAnalysis } from "@/lib/portfolio/analyze"
import { beforeYouBuy } from "@/lib/portfolio/buy-check"
import { applyHoldingsImport, type ImportedHolding, type ImportMode } from "@/lib/portfolio/csv-import"
import { ASSET_CLASSES, knownFund, normalizeSymbol, type AssetClass } from "@/lib/portfolio/funds"
import { MARKET_DROPS, MARKET_DROPS_SOURCE } from "@/lib/portfolio/history"
import { MAX_HOLDINGS, MAX_QUOTE_SYMBOLS, summarizeQuoteRefresh, type Holding, type RefreshQuote } from "@/lib/portfolio/holdings"
import { portfolioStore, profileStore, sharePlanStore } from "@/lib/stores"
import { nextStamp } from "@/lib/sync/stamp"
import { useHydrated, useStoredValue } from "@/lib/use-stored-value"

const CLASS_COLORS: Record<AssetClass, string> = {
  "us-stocks": "bg-[#216B47]",
  "intl-stocks": "bg-[#3FA66B]",
  "global-stocks": "bg-[#2F8A57]",
  "single-stock": "bg-[#B98225]",
  "sector-stocks": "bg-[#7FB89A]",
  bonds: "bg-[#5B7DB1]",
  cash: "bg-[#A9C3E0]",
  "real-estate": "bg-[#9C7AB8]",
  crypto: "bg-[#C94A4A]",
  leveraged: "bg-[#8F2F2F]",
  other: "bg-[#9AA8A0]",
}

/** An example portfolio for trying the page, clearly labelled as such. */
const EXAMPLE: { symbol: string; value: number; fee: number | null }[] = [
  { symbol: "VOO", value: 4200, fee: null },
  { symbol: "QQQ", value: 1800, fee: null },
  { symbol: "TSLA", value: 1500, fee: null },
  { symbol: "BND", value: 500, fee: null },
]

function newId() {
  return `h-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

function saveHoldings(holdings: Holding[]) {
  portfolioStore.set({ updatedAt: nextStamp(portfolioStore.get()?.updatedAt, new Date()), holdings })
}

export function PortfolioBuilder({ liveData }: { liveData: boolean }) {
  const portfolio = useStoredValue(portfolioStore)
  const profile = useStoredValue(profileStore)
  const loaded = useHydrated()
  const holdings = useMemo(() => portfolio?.holdings ?? [], [portfolio])
  const range = profile ? targetStockRange(profile) : null
  const analysis = useMemo(() => analyzePortfolio(holdings, range), [holdings, range])

  if (!loaded) return <div className="mt-10 h-96 animate-pulse rounded-2xl bg-muted" aria-hidden="true" />

  return (
    <div className="mt-10 space-y-6">
      <HoldingsEditor holdings={holdings} liveData={liveData} />
      {analysis && (
        <>
          <Summary analysis={analysis} hasPlan={Boolean(profile?.updatedAt)} />
          <div className="grid gap-6 lg:grid-cols-2">
            <Checkup analysis={analysis} />
            <Rebalance analysis={analysis} />
          </div>
        </>
      )}
      {/* One MarketSection in one place, so adding the first holding doesn't remount it (and refetch its charts). */}
      {liveData && <MarketSection />}
      <div className="grid gap-6 lg:grid-cols-2">
        <NextDollars analysis={analysis} />
        <StressTest analysis={analysis} />
      </div>
      <BeforeYouBuy holdings={holdings} />
    </div>
  )
}

// ---------------------------------------------------------------------------------------------

function HoldingsEditor({ holdings, liveData }: { holdings: Holding[]; liveData: boolean }) {
  const [refreshing, setRefreshing] = useState(false)
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null)
  const screenshots = useHoldingsScreenshots(importHoldings)
  const total = holdings.reduce((sum, holding) => sum + holding.value, 0)

  const setHolding = (id: string, patch: Partial<Holding>) =>
    saveHoldings(holdings.map((holding) => (holding.id === id ? { ...holding, ...patch } : holding)))

  function setSymbol(holding: Holding, raw: string) {
    const typed = raw.toUpperCase().replace(/[^A-Z0-9.\-^]/g, "").slice(0, 12)
    const known = knownFund(typed)
    setHolding(holding.id, {
      symbol: typed,
      ...(known ? { name: known.name, assetClass: known.assetClass } : {}),
    })
  }

  function add() {
    saveHoldings([
      ...holdings,
      { id: newId(), symbol: "", name: "", assetClass: "us-stocks", value: 0, shares: null, expenseRatioPercent: null, valueAsOf: new Date().toISOString() },
    ])
  }

  function importHoldings(imported: ImportedHolding[], mode: ImportMode, fileName: string, needPrices: number) {
    // Read the saved list again, in case it changed while the preview was open (never the list on
    // screen when it was opened: that may have been cleared since).
    const current = portfolioStore.get()?.holdings ?? []
    const { holdings: next, dropped } = applyHoldingsImport(current, imported, mode, new Date().toISOString(), newId)
    saveHoldings(next)
    setMessage({
      kind: "ok",
      text: [
        `Imported ${imported.length} ${imported.length === 1 ? "holding" : "holdings"} from ${fileName}.`,
        needPrices > 0 && (liveData ? `Use Refresh prices to fill in the ${needPrices} missing a value.` : `${needPrices} still need a value.`),
        dropped > 0 && `Your list holds up to ${MAX_HOLDINGS}, so ${dropped} ${dropped === 1 ? "wasn't" : "weren't"} added.`,
      ]
        .filter(Boolean)
        .join(" "),
    })
  }

  function loadExample() {
    const now = new Date().toISOString()
    saveHoldings(
      EXAMPLE.map(({ symbol, value, fee }) => {
        const known = knownFund(symbol)
        return { id: newId(), symbol, name: known?.name ?? "Tesla", assetClass: known?.assetClass ?? "single-stock", value, shares: null, expenseRatioPercent: fee, valueAsOf: now }
      })
    )
  }

  async function refreshPrices() {
    const withShares = holdings.filter((holding) => holding.shares && normalizeSymbol(holding.symbol))
    if (withShares.length === 0) {
      setMessage({ kind: "error", text: "Add the number of shares to a holding first, so its value can be worked out from the price." })
      return
    }
    setRefreshing(true)
    setMessage(null)
    try {
      const response = await fetch("/api/market/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: [...new Set(withShares.map((holding) => holding.symbol))].slice(0, MAX_QUOTE_SYMBOLS) }),
      })
      const data = (await response.json().catch(() => null)) as { quotes?: RefreshQuote[]; error?: string } | null
      if (!response.ok || !data?.quotes) throw new Error(data?.error ?? "Couldn't get prices.")
      const asked = new Set(withShares.map((holding) => holding.symbol)).size
      const { priced: prices, notFound, unchecked, unavailable, skipped } = summarizeQuoteRefresh(data.quotes, asked)
      let updated = 0
      // Read the saved holdings again: the user may have edited them while the prices were loading,
      // and `holdings` here is the list from when the button was pressed. If the list is gone (Clear
      // all, or this browser's copy was cleared when the account's session ended), there's nothing
      // to update: saving `holdings` would bring the cleared list back.
      const current = portfolioStore.get()?.holdings
      if (!current) return
      saveHoldings(
        current.map((holding) => {
          const quote = prices.get(holding.symbol)
          if (!quote?.price || !holding.shares) return holding
          updated++
          return { ...holding, value: Math.round(holding.shares * quote.price * 100) / 100, valueAsOf: quote.asOf && quote.asOf !== "unknown" ? quote.asOf : new Date().toISOString() }
        })
      )
      setMessage({
        kind: "ok",
        text: `Updated ${updated} ${updated === 1 ? "holding" : "holdings"} from Financial Modeling Prep (prices may be delayed).${notFound > 0 ? ` ${notFound} couldn't be found.` : ""}${unchecked > 0 ? ` ${unchecked} couldn't be checked right now. Try again in a few minutes.` : ""}${unavailable > 0 ? ` ${unavailable} ${unavailable === 1 ? "isn't" : "aren't"} covered by the price service, so ${unavailable === 1 ? "it keeps its" : "they keep their"} last value.` : ""}${skipped > 0 ? ` Prices are refreshed for ${MAX_QUOTE_SYMBOLS} symbols at a time, so ${skipped} kept ${skipped === 1 ? "its" : "their"} last value.` : ""}`,
      })
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Couldn't get prices." })
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <Panel
      title="Your holdings"
      description="Import a positions file or screenshots from your brokerage, or enter what you own by hand. Funds Sprout recognizes fill in their type automatically."
      action={holdings.length > 0 ? <span className="figures text-lg font-semibold">{formatMoney(total)}</span> : undefined}
    >
      {holdings.length === 0 ? (
        <div className="space-y-3">
          <HoldingsImport variant="dropzone" hasHoldings={false} onImport={importHoldings} />
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="text-sm text-muted-foreground">or</span>
            <Button size="sm" variant="outline" onClick={add}>
              <PlusIcon />
              Add a holding by hand
            </Button>
            <ScreenshotButton onFiles={screenshots.pick} progress={screenshots.progress} />
            <Button size="sm" variant="ghost" onClick={loadExample}>
              <SparklesIcon />
              Try an example portfolio
            </Button>
          </div>
          <ScreenshotPrivacyNote className="text-center text-xs text-muted-foreground" />
          {screenshots.panel}
        </div>
      ) : (
        <>
          <div className="hidden grid-cols-[0.9fr_1.6fr_1.4fr_1fr_0.8fr_0.8fr_auto] gap-3 px-1 pb-1 text-xs font-medium text-muted-foreground lg:grid">
            <span>Symbol</span>
            <span>Name</span>
            <span>Type</span>
            <span>Value</span>
            <span>Shares (optional)</span>
            <span>Fee % (optional)</span>
            <span className="sr-only">Remove</span>
          </div>
          <ul className="space-y-3 lg:space-y-2">
            {holdings.map((holding) => (
              <li
                key={holding.id}
                className="grid grid-cols-2 gap-2 rounded-xl border p-3 lg:grid-cols-[0.9fr_1.6fr_1.4fr_1fr_0.8fr_0.8fr_auto] lg:items-center lg:gap-3 lg:border-0 lg:p-0"
              >
                <CellInput label="Symbol" value={holding.symbol} placeholder="VTI" onChange={(value) => setSymbol(holding, value)} upper />
                <CellInput label="Name" value={holding.name} placeholder="Name" onChange={(name) => setHolding(holding.id, { name: name.slice(0, 80) })} />
                <label className="col-span-2 lg:col-span-1">
                  <span className="mb-1 block text-xs text-muted-foreground lg:sr-only">Type</span>
                  <select
                    value={holding.assetClass}
                    onChange={(event) => setHolding(holding.id, { assetClass: event.target.value as AssetClass })}
                    className="h-9 w-full rounded-lg border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
                  >
                    {(Object.keys(ASSET_CLASSES) as AssetClass[]).map((key) => (
                      <option key={key} value={key}>
                        {ASSET_CLASSES[key]}
                      </option>
                    ))}
                  </select>
                </label>
                <CellNumber label="Value" prefix="$" value={holding.value} onChange={(value) => setHolding(holding.id, { value: value ?? 0, valueAsOf: new Date().toISOString() })} />
                <CellNumber label="Shares" value={holding.shares} onChange={(shares) => setHolding(holding.id, { shares })} />
                <CellNumber label="Fee %" suffix="%" max={5} step={0.01} value={holding.expenseRatioPercent} onChange={(fee) => setHolding(holding.id, { expenseRatioPercent: fee })} />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="justify-self-end"
                  aria-label={`Remove ${holding.symbol || "this holding"}`}
                  onClick={() => saveHoldings(holdings.filter((other) => other.id !== holding.id))}
                >
                  <Trash2Icon />
                </Button>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {holdings.length < MAX_HOLDINGS && (
              <Button size="sm" variant="outline" onClick={add}>
                <PlusIcon />
                Add a holding
              </Button>
            )}
            {liveData && (
              <Button size="sm" variant="outline" className="disabled:opacity-100" onClick={refreshPrices} disabled={refreshing} aria-busy={refreshing}>
                <RefreshCwIcon className={cn(refreshing && "animate-spin")} />
                {refreshing ? "Getting prices…" : "Refresh prices"}
              </Button>
            )}
            <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => portfolioStore.set(null)}>
              Clear all
            </Button>
            <ScreenshotButton onFiles={screenshots.pick} progress={screenshots.progress} label="Add screenshots" />
            {/* Last in the row: its preview, and the screenshot review, open on a full line below the buttons. */}
            <HoldingsImport hasHoldings onImport={importHoldings} />
            {screenshots.panel}
          </div>
          {message && (
            <p role="status" className={cn("mt-3 text-sm", message.kind === "error" ? "text-[#a33b3b]" : "text-muted-foreground")}>
              {message.text}
            </p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            The fee is the fund&apos;s expense ratio, listed on its page at your broker or the fund company. Individual stocks
            don&apos;t have one.
          </p>
        </>
      )}
    </Panel>
  )
}

const cellBox = "flex h-9 items-center rounded-lg border bg-background px-2.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/25"

function CellInput({ label, value, placeholder, onChange, upper }: { label: string; value: string; placeholder?: string; onChange: (value: string) => void; upper?: boolean }) {
  return (
    <label className={cn(!upper && "col-span-1")}>
      <span className="mb-1 block text-xs text-muted-foreground lg:sr-only">{label}</span>
      <span className={cellBox}>
        <input
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className={cn("h-full w-full min-w-0 bg-transparent text-sm outline-none", upper && "font-medium uppercase")}
        />
      </span>
    </label>
  )
}

function CellNumber({
  label,
  value,
  onChange,
  prefix,
  suffix,
  max = 100_000_000,
  step = 1,
}: {
  label: string
  value: number | null
  onChange: (value: number | null) => void
  prefix?: string
  suffix?: string
  max?: number
  step?: number
}) {
  return (
    <label>
      <span className="mb-1 block text-xs text-muted-foreground lg:sr-only">{label}</span>
      <span className={cellBox}>
        {prefix && <span className="pr-0.5 text-sm text-muted-foreground">{prefix}</span>}
        <input
          type="number"
          inputMode="decimal"
          min={0}
          max={max}
          step={step}
          value={value ?? ""}
          onChange={(event) => {
            const raw = event.target.value
            const parsed = raw === "" ? null : Number(raw)
            onChange(parsed === null || !Number.isFinite(parsed) ? null : Math.min(max, Math.max(0, parsed)))
          }}
          className="figures h-full w-full min-w-0 bg-transparent text-sm outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
        {suffix && <span className="pl-0.5 text-sm text-muted-foreground">{suffix}</span>}
      </span>
    </label>
  )
}

// ---------------------------------------------------------------------------------------------

function Summary({ analysis, hasPlan }: { analysis: PortfolioAnalysis; hasPlan: boolean }) {
  const target = analysis.target
  return (
    <Panel title="Portfolio X-ray" description="What your holdings add up to.">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Total value" value={formatMoney(analysis.total)} />
        <Stat
          label={analysis.cryptoShare > 0 ? "In stocks & crypto" : "In stocks"}
          value={formatPercent(analysis.growthShare)}
          note={target ? `Your plan: ${target.range.min}–${target.range.max}%` : hasPlan ? "Finish the risk quiz for a target" : undefined}
          tone={target ? (target.status === "within" ? "good" : "watch") : undefined}
        />
        <Stat
          label="Average fund fee"
          value={analysis.fees.weightedPercent !== null ? `${analysis.fees.weightedPercent.toFixed(2)}%` : "—"}
          note={analysis.fees.weightedPercent !== null ? `Known for ${formatPercent(analysis.fees.coverage)} of your money` : "Add fees to see this"}
        />
      </div>

      <div className="mt-6">
        <div className="flex h-4 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label="Allocation by type">
          {analysis.byClass.map((slice) => (
            <div key={slice.assetClass} className={CLASS_COLORS[slice.assetClass]} style={{ width: `${slice.share * 100}%` }} title={`${slice.label}: ${formatPercent(slice.share)}`} />
          ))}
        </div>
        <ul className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          {analysis.byClass.map((slice) => (
            <li key={slice.assetClass} className="flex items-center gap-2">
              <span className={cn("size-2.5 shrink-0 rounded-full", CLASS_COLORS[slice.assetClass])} aria-hidden="true" />
              <span className="flex-1">{slice.label}</span>
              <span className="figures text-muted-foreground">{formatMoney(slice.value)}</span>
              <span className="figures w-12 text-right font-medium">{formatPercent(slice.share)}</span>
            </li>
          ))}
        </ul>
      </div>
      {!hasPlan && (
        <p className="mt-5 rounded-xl bg-secondary px-4 py-3 text-sm text-secondary-foreground">
          <Link href="/plan" className="font-medium underline-offset-4 hover:underline">
            Fill in your plan
          </Link>{" "}
          to compare this with a target mix that fits your goal and timeline.
        </p>
      )}
    </Panel>
  )
}

function Stat({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "good" | "watch" }) {
  return (
    <div className="rounded-xl border px-4 py-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="figures mt-1 font-heading text-2xl font-semibold">{value}</p>
      {note && <p className={cn("mt-0.5 text-xs", tone === "good" ? "text-primary" : tone === "watch" ? "text-[#8a611b]" : "text-muted-foreground")}>{note}</p>}
    </div>
  )
}

function Checkup({ analysis }: { analysis: PortfolioAnalysis }) {
  const router = useRouter()
  const order = { act: 0, watch: 1, good: 2 }
  const checks = [...analysis.checks].sort((a, b) => order[a.level] - order[b.level])
  return (
    <Panel
      title="Check-up"
      description="What stands out, most important first."
      action={
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            sharePlanStore.set(true)
            router.push(`/assistant?q=${encodeURIComponent("Give my portfolio a check-up and explain what I should look at first.")}`)
          }}
        >
          <MessageSquareTextIcon />
          Discuss
        </Button>
      }
    >
      {checks.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing stands out. Keep contributing regularly and check your mix about once a year.</p>
      ) : (
        <ul className="space-y-2.5">
          {checks.map((check) => (
            <CheckItem key={check.id} level={check.level} title={check.title} detail={check.detail} />
          ))}
        </ul>
      )}
      {analysis.overlaps.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">Overlap: {analysis.overlaps.map((overlap) => overlap.symbols.join(" + ")).join("; ")}</p>
      )}
    </Panel>
  )
}

function Rebalance({ analysis }: { analysis: PortfolioAnalysis }) {
  const plan = rebalancePlan(analysis)
  return (
    <Panel title="Rebalancing" description="Getting back to your target mix with new money, so you don't have to sell.">
      {plan.needed ? (
        <div className="space-y-3 text-sm">
          <p className="font-heading text-2xl font-semibold">
            {formatMoney(plan.amount)}{" "}
            <span className="text-base font-medium text-muted-foreground">into {plan.addTo === "stocks" ? "stock funds" : "bonds or cash"}</span>
          </p>
          <p className="text-muted-foreground">
            Adding that, and nothing to the other side, brings you to about {plan.targetStockPercent}% stocks, the middle of your
            range. Spread it over your next few contributions; there&apos;s no rush.
          </p>
          <p className="text-muted-foreground">
            Selling about {formatMoney(Math.abs(plan.sellAmount))} of {plan.addTo === "stocks" ? "bonds and cash" : "stocks"} would do it at
            once, but in a regular (taxable) account that can mean paying tax on gains.
          </p>
          <Link href="/learn/automate-and-rebalance" className="inline-block font-medium text-primary hover:underline">
            Lesson: automate it, then rebalance
          </Link>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{plan.reason}</p>
      )}
    </Panel>
  )
}

function NextDollars({ analysis }: { analysis: PortfolioAnalysis | null }) {
  const profile = useStoredValue(profileStore)
  const [amount, setAmount] = useState<number | null>(200)
  const result = profile?.updatedAt && amount && amount > 0 ? nextDollars(amount, profile, analysis) : null
  return (
    <Panel title="Where should my next dollars go?" description="Following your roadmap: safety first, then expensive debt, then investing.">
      <div className="max-w-48">
        <NumberField label="Amount" prefix="$" step={50} value={amount} onChange={setAmount} />
      </div>
      {!profile?.updatedAt ? (
        <p className="mt-4 text-sm text-muted-foreground">
          <Link href="/plan" className="font-medium text-primary hover:underline">
            Fill in your plan
          </Link>{" "}
          (savings, debts, risk quiz) to see this.
        </p>
      ) : result ? (
        <>
          <ul className="mt-4 space-y-2">
            {result.splits.map((split) => (
              <li key={split.where} className="rounded-xl border px-4 py-3">
                <p className="flex items-baseline justify-between gap-3 text-sm font-medium">
                  {split.where}
                  <span className="figures">{formatMoneyPrecise(split.amount)}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{split.why}</p>
              </li>
            ))}
          </ul>
          {result.notes.map((note) => (
            <p key={note} className="mt-2 text-xs text-muted-foreground">
              {note}
            </p>
          ))}
        </>
      ) : null}
    </Panel>
  )
}

function StressTest({ analysis }: { analysis: PortfolioAnalysis | null }) {
  const [drop, setDrop] = useState(30)
  const result = analysis ? stressTest(analysis, drop) : null
  return (
    <Panel
      id="market-drop"
      title="If the market fell"
      description="Big drops happen. Knowing what one would mean helps you stay calm when it does."
    >
      <label className="block text-sm font-medium" htmlFor="drop">
        Stocks fall by <span className="figures">{drop}%</span>
      </label>
      <input
        id="drop"
        type="range"
        min={10}
        max={60}
        step={5}
        value={drop}
        onChange={(event) => setDrop(Number(event.target.value))}
        className="range-input mt-2 w-full"
        style={{ ["--fill" as string]: `${((drop - 10) / 50) * 100}%` }}
      />
      {result ? (
        <p className="mt-3 text-sm">
          Your portfolio would fall about <span className="figures font-semibold">{result.portfolioDropPercent}%</span>, from{" "}
          <span className="figures">{formatMoney(analysis!.total)}</span> to <span className="figures font-semibold">{formatMoney(result.valueAfter)}</span>.
          <span className="mt-1 block text-xs text-muted-foreground">{result.caveat}</span>
        </p>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Add holdings above to see what this would mean for you.</p>
      )}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Past S&P 500 drops and recoveries</caption>
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-1.5 pr-3 font-medium">Past drop</th>
              <th className="py-1.5 pr-3 font-medium">Fall</th>
              <th className="py-1.5 font-medium">Back to old high</th>
            </tr>
          </thead>
          <tbody>
            {MARKET_DROPS.map((past) => (
              <tr key={past.name} className={cn("border-t", past.fallPercent >= drop && "bg-secondary/40")}>
                <td className="py-1.5 pr-3">{past.name}</td>
                <td className="figures py-1.5 pr-3">−{past.fallPercent}%</td>
                <td className="figures py-1.5">
                  {past.recovered} <span className="text-muted-foreground">({past.monthsToRecover} mo after the low)</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{MARKET_DROPS_SOURCE}</p>
    </Panel>
  )
}

function BeforeYouBuy({ holdings }: { holdings: Holding[] }) {
  const profile = useStoredValue(profileStore)
  const router = useRouter()
  const [symbol, setSymbol] = useState("")
  const [amount, setAmount] = useState<number | null>(500)
  const clean = normalizeSymbol(symbol)
  const check = clean
    ? beforeYouBuy({
        facts: { symbol: clean, found: Boolean(knownFund(clean)), name: knownFund(clean)?.name },
        amount: amount ?? 0,
        holdings,
        roadmap: profile?.updatedAt ? buildRoadmap(profile) : null,
        emergencySavings: profile?.emergencySavings ?? null,
      })
    : null

  return (
    <Panel
      id="before-you-buy"
      title="Thinking of buying something?"
      description="Saw a stock on TikTok or in a group chat? Run it through this checklist before you put money in. It won't tell you yes or no; it shows you what to weigh."
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="w-36">
          <span className="mb-1.5 block text-sm font-medium">Ticker</span>
          <span className="flex h-10 items-center rounded-lg border bg-background px-3 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/25">
            <input
              value={symbol}
              onChange={(event) => setSymbol(event.target.value.toUpperCase().slice(0, 12))}
              placeholder="e.g. NVDA"
              className="h-full w-full min-w-0 bg-transparent text-sm font-medium uppercase outline-none"
            />
          </span>
        </label>
        <div className="w-40">
          <NumberField label="Amount" prefix="$" step={50} value={amount} onChange={setAmount} />
        </div>
        <Button
          disabled={!clean}
          onClick={() => {
            sharePlanStore.set(true)
            router.push(
              `/assistant?q=${encodeURIComponent(`I'm thinking about putting $${amount ?? 0} into ${clean}. Run the before-you-buy check with live data and walk me through it.`)}`
            )
          }}
        >
          <MessageSquareTextIcon />
          Full check with live data
        </Button>
      </div>

      {check && (
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <ul className="space-y-2.5">
            {check.items.map((item) => (
              <CheckItem key={item.id} level={item.level} title={item.title} detail={item.detail} />
            ))}
          </ul>
          <div className="rounded-xl bg-secondary/50 px-4 py-3.5">
            <p className="text-sm font-medium">Ask yourself</p>
            <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm text-muted-foreground">
              {check.questions.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ul>
            <Link href="/learn/investing-vs-speculating" className={buttonVariants({ variant: "link", size: "sm", className: "mt-2 h-auto px-0" })}>
              Lesson: investing versus speculating
            </Link>
          </div>
        </div>
      )}
      {check && !knownFund(check.symbol) && (
        <p className="mt-3 text-xs text-muted-foreground">
          This quick check works offline. The full check adds live price swings and company details.
        </p>
      )}
    </Panel>
  )
}
