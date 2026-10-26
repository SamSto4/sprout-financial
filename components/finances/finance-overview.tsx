"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronDownIcon, CloudUploadIcon, FileSpreadsheetIcon, InfoIcon, MessageSquareTextIcon } from "lucide-react"
import { cn } from "cn"

import { FinanceImport, type FinanceImportHandle } from "@/components/finance-import"
import { AiInsights } from "@/components/finances/ai-insights"
import { FinanceChat } from "@/components/finances/finance-chat"
import { EmergencyFundCheck, InvestTheDifference } from "@/components/finances/finance-planning"
import { MonthlyChart } from "@/components/finances/monthly-chart"
import { RegularPayments, SpendingBreakdown } from "@/components/finances/spending-breakdown"
import { TransactionExplorer } from "@/components/finances/transaction-explorer"
import { useTransactionScreenshots } from "@/components/finances/transaction-screenshots"
import { ScreenshotButton, ScreenshotPrivacyNote } from "@/components/screenshots/screenshot-button"
import { buttonVariants } from "@/components/ui/button"
import { summarizeTransactions } from "@/lib/finance/transactions"
import { formatMoney, formatPercent } from "@/lib/format"
import { clearFinances, financesStore } from "@/lib/stores"
import { useHydrated, useStoredValue } from "@/lib/use-stored-value"

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })

function formatDate(isoDate: string) {
  return dateFormat.format(new Date(`${isoDate}T00:00:00Z`))
}

function Panel({
  title,
  description,
  children,
  className,
}: {
  title: string
  description?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn("rounded-2xl border bg-card p-5 shadow-[0_1px_2px_rgb(24_53_42/0.04)] sm:p-6", className)}>
      <h3 className="text-lg font-semibold">{title}</h3>
      {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  )
}

const ASK_PROMPT = "Look at my imported transactions and tell me the three most useful changes I could make, then how I could start investing."

export function FinanceOverview() {
  const finances = useStoredValue(financesStore)
  const hydrated = useHydrated()
  const [managing, setManaging] = useState(false)
  const router = useRouter()
  const [draft, setDraft] = useState<{ id: number; text: string } | undefined>()
  const [pageDrag, setPageDrag] = useState(false)
  const importRef = useRef<FinanceImportHandle>(null)
  const screenshots = useTransactionScreenshots()

  // A CSV can be dropped anywhere on the dashboard, not only on the drop zone.
  useEffect(() => {
    let depth = 0
    const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes("Files") ?? false
    const onEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return
      depth += 1
      setPageDrag(true)
    }
    const onLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setPageDrag(false)
    }
    const onOver = (event: DragEvent) => {
      if (hasFiles(event)) event.preventDefault()
    }
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      depth = 0
      setPageDrag(false)
      const file = event.dataTransfer?.files[0]
      if (!file) return
      setManaging(true)
      importRef.current?.importFile(file)
    }
    window.addEventListener("dragenter", onEnter)
    window.addEventListener("dragleave", onLeave)
    window.addEventListener("dragover", onOver)
    window.addEventListener("drop", onDrop)
    return () => {
      window.removeEventListener("dragenter", onEnter)
      window.removeEventListener("dragleave", onLeave)
      window.removeEventListener("dragover", onOver)
      window.removeEventListener("drop", onDrop)
    }
  }, [])

  const dropOverlay = pageDrag && (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-surface/80 p-6 backdrop-blur-[2px]">
      <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-brand bg-background px-10 py-8 text-center shadow-lg">
        <CloudUploadIcon className="size-9 text-primary" aria-hidden="true" />
        <p className="text-lg font-semibold">Drop your CSV to import it</p>
        <p className="text-sm text-muted-foreground">You&apos;ll see a preview before anything changes.</p>
      </div>
    </div>
  )
  const summary = useMemo(() => (finances ? summarizeTransactions(finances.transactions) : null), [finances])

  if (!hydrated) {
    return <div className="h-64 animate-pulse rounded-2xl border bg-card" aria-hidden="true" />
  }

  if (!finances || !summary) {
    return (
      <>
        {dropOverlay}
        <div className="grid gap-8 rounded-2xl border bg-card p-6 shadow-[0_1px_2px_rgb(24_53_42/0.04)] sm:p-8 md:grid-cols-[minmax(0,1fr)_22rem] md:items-center">
          <div className="space-y-4">
            <span className="flex size-11 items-center justify-center rounded-xl bg-secondary text-primary">
              <FileSpreadsheetIcon className="size-5" aria-hidden="true" />
            </span>
            <h2 className="text-2xl font-semibold">See your real money in detail</h2>
            <p className="max-w-xl text-muted-foreground">
              Drop in a CSV export from your bank or budgeting app, or add screenshots of your transactions, to see
              where your money goes each month, which bills repeat, and how big your emergency fund should be. Then get
              an AI review with practical tips on your spending and trends.
            </p>
            <ul className="grid max-w-xl gap-2 text-sm sm:grid-cols-2">
              {["AI spending review", "Monthly money in vs. out", "Bills and subscriptions", "Searchable transactions"].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-brand" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <FinanceImport
            ref={importRef}
            size="large"
            finances={null}
            onImport={(next) => financesStore.set(next)}
            onRemove={clearFinances}
            onAskForTips={() => {}}
          />
        </div>
        <div className="mt-4 flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-[0_1px_2px_rgb(24_53_42/0.04)] sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="space-y-1">
            <p className="font-semibold">Bank won&apos;t give you a CSV?</p>
            <p className="text-sm text-muted-foreground">
              Add screenshots of recent transactions from any banking or card app. AI reads them, and you check every row
              before it&apos;s added.
            </p>
            <ScreenshotPrivacyNote />
          </div>
          <div className="shrink-0">
            <ScreenshotButton onFiles={screenshots.pick} progress={screenshots.progress} variant="default" size="lg" />
          </div>
        </div>
        {screenshots.panel && <div className="mt-4">{screenshots.panel}</div>}
      </>
    )
  }

  function askInChat(question: string) {
    setDraft((current) => ({ id: (current?.id ?? 0) + 1, text: question }))
    const chat = document.getElementById("finance-chat")
    chat?.scrollIntoView({ behavior: "smooth", block: "start" })
    // Focus after the scroll starts so the page doesn't jump.
    window.setTimeout(() => document.getElementById("chat-input")?.focus({ preventScroll: true }), 300)
  }

  const tiles = [
    { label: "Money in", value: formatMoney(summary.monthlyAverage.income), note: "average per month", tone: "text-primary" },
    { label: "Money out", value: formatMoney(summary.monthlyAverage.spending), note: "average per month", tone: "" },
    {
      label: "Left over",
      value: formatMoney(summary.monthlyAverage.net),
      note: "average per month",
      tone: summary.monthlyAverage.net < 0 ? "text-[#a33b3b]" : "text-primary",
    },
    {
      label: "Savings rate",
      value: summary.savingsRate === null ? "—" : formatPercent(summary.savingsRate),
      note: summary.savingsRate === null ? "no income found" : "of income not spent",
      tone: "",
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-2xl border bg-surface px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-background text-primary">
            <FileSpreadsheetIcon className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium">{finances.fileName}</p>
            <p className="figures text-sm text-muted-foreground">
              {summary.transactionCount.toLocaleString()} transactions · {formatDate(summary.period.from)} –{" "}
              {formatDate(summary.period.to)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/assistant?q=${encodeURIComponent(ASK_PROMPT)}`}
            className={cn(buttonVariants({ size: "lg" }))}
          >
            <MessageSquareTextIcon />
            Ask the assistant
          </Link>
          <button
            type="button"
            onClick={() => setManaging((open) => !open)}
            aria-expanded={managing}
            className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
          >
            Manage file
            <ChevronDownIcon className={cn("transition-transform", managing && "rotate-180")} />
          </button>
          <ScreenshotButton onFiles={screenshots.pick} progress={screenshots.progress} label="Add screenshots" size="lg" />
        </div>
      </div>

      {screenshots.panel}

      {dropOverlay}
      {/* Kept mounted (hidden) so a file dropped on the page can open its preview here. */}
      <div className={cn("max-w-sm", managing ? "animate-rise" : "hidden")}>
          <FinanceImport
            ref={importRef}
            finances={finances}
            onImport={(next) => {
              financesStore.set(next)
              setManaging(false)
            }}
            onRemove={clearFinances}
            onAskForTips={() => router.push(`/assistant?q=${encodeURIComponent(ASK_PROMPT)}`)}
          />
      </div>

      <dl className="figures grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-2xl border bg-card px-4 py-4 shadow-[0_1px_2px_rgb(24_53_42/0.04)] sm:px-5">
            <dt className="text-sm text-muted-foreground">{tile.label}</dt>
            <dd className={cn("mt-1 font-heading text-2xl font-semibold sm:text-3xl", tile.tone)}>{tile.value}</dd>
            <dd className="mt-0.5 text-xs text-muted-foreground">{tile.note}</dd>
          </div>
        ))}
      </dl>

      <AiInsights finances={finances} onAsk={askInChat} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel title="Money in vs. money out" description="Each month in your file. Likely transfers between accounts are left out.">
          <MonthlyChart months={summary.months} />
        </Panel>
        <Panel title="Where it goes" description={`Spending over ${summary.period.months} ${summary.period.months === 1 ? "month" : "months"}`}>
          <SpendingBreakdown summary={summary} />
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Bills and subscriptions" description="Payees that show up in most months">
          <RegularPayments summary={summary} />
        </Panel>
        <Panel title="Emergency fund check" description="How long your savings would last">
          <EmergencyFundCheck summary={summary} />
        </Panel>
        <Panel title="Invest the difference" description="A what-if using your own numbers">
          <InvestTheDifference summary={summary} />
        </Panel>
      </div>

      <section id="finance-chat" aria-labelledby="finance-chat-title" className="scroll-mt-24 rounded-2xl border bg-surface p-4 shadow-[0_1px_2px_rgb(24_53_42/0.04)] sm:p-6">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 id="finance-chat-title" className="text-lg font-semibold">
              Ask about your spending
            </h3>
            <p className="text-sm text-muted-foreground">
              The assistant can read your imported transactions and trends to answer. Each question sends them along.
            </p>
          </div>
          <Link href="/assistant" className="text-sm font-medium text-primary hover:underline">
            Open the full assistant
          </Link>
        </div>
        <FinanceChat transactions={finances.transactions} draft={draft} />
      </section>

      <Panel title="Transactions" description="Search, filter and sort everything you imported">
        <TransactionExplorer transactions={finances.transactions} months={summary.months.map((month) => month.month)} />
      </Panel>

      <aside className="flex gap-2.5 rounded-xl bg-surface px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        <InfoIcon className="mt-px size-4 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <p className="font-medium text-foreground">About these numbers</p>
          <ul className="mt-1 space-y-0.5">
            {summary.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
            <li>
              Your file stays on this device, and in your account when you&apos;re logged in. It only goes to the
              assistant when you ask it something or request a review. Screenshots you add are read by AI and then
              discarded; only the rows you approve are kept.
            </li>
          </ul>
        </div>
      </aside>
    </div>
  )
}
