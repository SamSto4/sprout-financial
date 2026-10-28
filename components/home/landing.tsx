import type { ReactNode } from "react"
import Link from "next/link"
import {
  ArrowRightIcon,
  BookOpenIcon,
  CalculatorIcon,
  CheckIcon,
  CompassIcon,
  InfoIcon,
  LandmarkIcon,
  LineChartIcon,
  MessageSquareTextIcon,
  MinusIcon,
  MonitorSmartphoneIcon,
  PieChartIcon,
  PiggyBankIcon,
  ScanTextIcon,
  SearchCheckIcon,
  ShieldCheckIcon,
  SproutIcon,
  ToggleRightIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react"
import { cn } from "cn"

import { DoublingCard } from "@/components/doubling-card"
import { DeletedNotice } from "@/components/home/deleted-notice"
import { FaqPointer } from "@/components/home/faq-pointer"
import { TryItSection } from "@/components/home/try-it-section"
import { Button } from "@/components/ui/button"
import { LESSONS, MODULES } from "@/lib/learn/course"
import type { SiteFeatures } from "@/lib/site"

// The home page for signed-out visitors and search engines: what Sprout is, who it's for, how it
// handles data and what an account adds. Every claim here is backed by code (the comment above an
// item names its sources), and copy that depends on configuration reads SiteFeatures.

type Point = { icon: LucideIcon; title: string; body: string }
type Feature = Point & { href: string; cta: string }

const FEATURES: Feature[] = [
  {
    // lib/learn/course.ts (LESSONS, MODULES, every lesson has a quiz), lib/learn/glossary.ts
    icon: BookOpenIcon,
    title: "A course that starts from zero",
    body: `${LESSONS.length} short lessons in ${MODULES.length} modules, from why invest at all to spotting scams. Each ends with a quick quiz, and a glossary explains the jargon.`,
    href: "/learn",
    cta: "See the course",
  },
  {
    // lib/plan/profile.ts (RISK_QUESTIONS, targetStockRange), lib/plan/roadmap.ts
    icon: CompassIcon,
    title: "A plan for your situation",
    body: "Take a short risk quiz and add your savings and debts. You get a step-by-step money roadmap and a target range for how much of your investments to keep in stocks.",
    href: "/plan",
    cta: "Build my plan",
  },
  {
    // lib/ai/tools.ts, lib/ai/calculators.ts, components/plan/plan-sidebar-panel.tsx (the sharing switch)
    icon: MessageSquareTextIcon,
    title: "An AI coach that shows its working",
    body: "Ask anything about money and get a plain-English answer. Numbers come from real calculators, and it can read your plan so you don't repeat yourself. Switches next to the chat control what it sees.",
    href: "/assistant",
    cta: "Ask a question",
  },
  {
    // components/portfolio/* (manual entry, CSV and screenshot import, X-ray, fees, rebalancing, market drop)
    icon: PieChartIcon,
    title: "A check-up for your investments",
    body: "Add your holdings by hand, from a CSV or from screenshots. See what you really own, what fees cost you, how to rebalance with new money and what a market drop could mean.",
    href: "/portfolio",
    cta: "Check my portfolio",
  },
  {
    // components/finances/* ("Bills and subscriptions"), lib/finance/budget-history.ts
    icon: WalletIcon,
    title: "A clear view of your spending",
    body: "Import a bank CSV or screenshots to see spending by category and month and spot recurring payments, then plan a budget for each month.",
    href: "/dashboard",
    cta: "Open the dashboard",
  },
  {
    // components/compound-calculator.tsx, fee-calculator.tsx, doubling-card.tsx, budget-planner.tsx, lib/finance/*
    icon: CalculatorIcon,
    title: "Calculators you can check",
    body: "Compound growth, fee drag, the Rule of 72 and a 50/30/20 budget, built on tested code with the assumptions spelled out.",
    href: "#try-it",
    cta: "Try the calculator",
  },
]

const AUDIENCES: Point[] = [
  {
    icon: SproutIcon,
    title: "You're starting from zero",
    body: "Learn how budgets, interest, debt and investing work, one short lesson at a time, in an order that builds on itself.",
  },
  {
    icon: PiggyBankIcon,
    title: "You're about to invest your first dollars",
    body: "See what to sort out first, like an emergency fund and expensive debt, and how a simple, low-cost mix of funds works.",
  },
  {
    icon: SearchCheckIcon,
    title: "You saw a tip online",
    body: "Run it through the before-you-buy check, or ask the coach what to look at. Sprout won't tell you to buy or sell; it helps you decide.",
  },
]

function teachingRules(features: SiteFeatures): Point[] {
  return [
    {
      // lib/ai/system-prompt.ts (Boundaries)
      icon: ShieldCheckIcon,
      title: "Education, not advice",
      body: "Sprout explains options, trade-offs and risks. It never tells you which stock or coin to buy or sell, and never promises returns.",
    },
    {
      // lib/ai/calculators.ts, lib/finance/* and their tests
      icon: CalculatorIcon,
      title: "Maths you can check",
      body: "Projections and fees come from tested calculators, not the AI's own arithmetic, with the assumptions stated.",
    },
    ...(features.marketData
      ? [
          {
            // lib/market/fmp.ts, lib/ai/system-prompt.ts (MARKET_DATA_PROMPT)
            icon: LineChartIcon,
            title: "Sourced market data",
            body: "Prices come from Financial Modeling Prep, with the time they're from. If data is unavailable, Sprout says so instead of guessing.",
          },
        ]
      : []),
    {
      // lib/ai/system-prompt.ts (professional referral for complex situations)
      icon: InfoIcon,
      title: "Honest about limits",
      body: "For big or complicated decisions, it suggests talking to a qualified professional, such as a fee-only fiduciary advisor.",
    },
  ]
}

function dataRules(features: SiteFeatures): Point[] {
  return [
    {
      // lib/stores.ts (localStorage), components/providers.tsx (sync starts only when signed in)
      icon: MonitorSmartphoneIcon,
      title: "Saved in your browser first",
      body: features.accounts
        ? "Your plan, portfolio, budgets, transactions, chats and progress are kept in this browser. Nothing goes to an account unless you create one."
        : "Your plan, portfolio, budgets, transactions, chats and progress are kept in this browser.",
    },
    {
      // lib/stores.ts (memoryStore on by default; About you on with the first save (a plan, a topic chip, Remember on a country)
      // unless switched off on this device,
      // and a device not yet asked sends nothing; sharePortfolioStore, shareFinancesStore off),
      // components/assistant.tsx and components/plan/plan-sidebar-panel.tsx (the switches, the preview of buildAboutCard's summary)
      icon: ToggleRightIcon,
      title: "Switches for what the AI sees",
      body: "The assistant uses your past chats unless you turn that off, About you once you save a plan, pick a topic or let it remember your country, your portfolio once you ask about it, and your transactions only when you share them. Each has a switch next to the chat, and you can preview the summary About you adds to each question.",
    },
    {
      // AGENTS.md section 5.4 (read-only tools), app/(pages)/portfolio/page.tsx
      icon: LandmarkIcon,
      title: "No bank logins",
      body: "Bring in transactions from a CSV file or screenshots. Sprout can't connect to your bank, move money or place trades.",
    },
    {
      // app/api/import/screenshot/route.ts, lib/screenshots/transaction-rows.ts and holding-rows.ts (maskAccountNumbers)
      icon: ScanTextIcon,
      title: "Screenshots are read, not kept",
      body: "Each one is read by the AI to find the rows and isn't stored by Sprout. Long account numbers are cut to the last four digits, and nothing is saved until you confirm.",
    },
  ]
}

const CARD =
  "group flex h-full flex-col rounded-xl border bg-card p-5 transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-brand/50 hover:shadow-[0_8px_24px_-12px_rgb(24_53_42/0.18)] sm:p-6"

/** A link to a page, or a plain anchor for a section on this page. */
function CardLink({ href, children }: { href: string; children: ReactNode }) {
  return href.startsWith("#") ? (
    <a href={href} className={CARD}>
      {children}
    </a>
  ) : (
    <Link href={href} className={CARD}>
      {children}
    </Link>
  )
}

function SectionIntro({
  eyebrow,
  title,
  titleId,
  children,
}: {
  eyebrow: string
  title: string
  titleId: string
  children?: ReactNode
}) {
  return (
    <div className="max-w-2xl space-y-2">
      <p className="eyebrow">{eyebrow}</p>
      <h2 id={titleId} className="text-3xl font-semibold">
        {title}
      </h2>
      {children && <p className="text-muted-foreground">{children}</p>}
    </div>
  )
}

function PointList({ points }: { points: Point[] }) {
  return (
    <ul className="mt-6 space-y-6">
      {points.map((point) => (
        <li key={point.title} className="flex gap-4">
          <point.icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <h4 className="text-base font-semibold">{point.title}</h4>
            <p className="mt-1 text-sm text-muted-foreground">{point.body}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}

function Mark({ on }: { on: boolean }) {
  const Icon = on ? CheckIcon : MinusIcon
  return (
    <span
      className={cn(
        "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
        on ? "bg-secondary text-primary" : "bg-muted text-muted-foreground"
      )}
    >
      <Icon className="size-3" strokeWidth={3} aria-hidden="true" />
    </span>
  )
}

function AccountSection({ features }: { features: SiteFeatures }) {
  // What an account syncs: lib/sync/account-sync.ts and app/(pages)/account/page.tsx (SYNCED).
  const without: [boolean, string][] = [
    [true, "Every lesson, tool and calculator, and the assistant"],
    [true, "Your work saved in this browser"],
    [false, "Clearing your browser or switching devices starts you over"],
  ]
  const withAccount = [
    "Chats, course progress and quiz scores on every device",
    "Your plan, portfolio, budgets and imported transactions, kept in sync",
    "What's already in this browser is merged in when you log in",
    ...(features.twoFactor ? ["Optional two-step verification with an authenticator app"] : []),
    "Delete your account and its data at any time",
  ]
  const smallPrint = [
    features.emailConfirmation ? "You'll confirm your email address before your account is created." : "",
    features.googleSignIn ? "You can also sign up with Google." : "",
    "Signing out removes your data from that device; it stays in your account.",
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20" aria-labelledby="account-title">
      <SectionIntro eyebrow="Your account" title="Try everything first. Sign up when you want to keep it." titleId="account-title">
        An account is optional. It saves your work to your account, so it&apos;s there on every device you use.
      </SectionIntro>
      <div className="mt-10 grid gap-5 md:grid-cols-2 md:items-start">
        <div className="rounded-xl border bg-card p-6">
          <h3 className="text-lg font-semibold">Without an account</h3>
          <ul className="mt-4 space-y-3 text-sm">
            {without.map(([on, text]) => (
              <li key={text} className="flex items-start gap-3">
                <Mark on={on} />
                {text}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-brand/50 bg-card p-6 shadow-[0_1px_2px_rgb(24_53_42/0.04),0_16px_40px_-20px_rgb(24_53_42/0.25)]">
          <h3 className="text-lg font-semibold">With an account</h3>
          <ul className="mt-4 space-y-3 text-sm">
            {withAccount.map((text) => (
              <li key={text} className="flex items-start gap-3">
                <Mark on />
                {text}
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button render={<Link href="/login?mode=signup" />} nativeButton={false} className="h-11 px-5">
              Create your account
              <ArrowRightIcon />
            </Button>
            <Button render={<Link href="/login" />} nativeButton={false} variant="ghost" className="h-11 px-4">
              Log in
            </Button>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{smallPrint}</p>
        </div>
      </div>
    </section>
  )
}

function StartSection() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20" aria-labelledby="start-title">
      <div className="flex flex-col items-start justify-between gap-6 rounded-2xl border bg-card p-6 sm:p-10 md:flex-row md:items-center">
        <div className="max-w-xl space-y-2">
          <h2 id="start-title" className="text-2xl font-semibold sm:text-3xl">
            Start with one lesson
          </h2>
          <p className="text-muted-foreground">Everything works in your browser, with nothing to sign up for.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button render={<Link href="/learn" />} nativeButton={false} className="h-11 px-5">
            Start learning
            <ArrowRightIcon />
          </Button>
          <Button render={<Link href="/plan" />} nativeButton={false} variant="outline" className="h-11 bg-background px-5">
            Build my plan
          </Button>
        </div>
      </div>
    </section>
  )
}

export function Landing({
  features,
  deletedNotice,
}: {
  features: SiteFeatures
  /** The address asks for the deletion notice (?account=deleted); DeletedNotice checks this tab really deleted an account. */
  deletedNotice: boolean
}) {
  const accounts = features.accounts
  return (
    <main>
      {/* 1. Hero */}
      <section className="border-b bg-surface" aria-labelledby="hero-title">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-center lg:gap-16">
          <div className="animate-rise space-y-6">
            {deletedNotice && <DeletedNotice />}
            <p className="eyebrow">Financial literacy, made practical</p>
            <h1 id="hero-title" className="text-4xl leading-[1.08] font-semibold sm:text-5xl lg:text-6xl">
              Understand your money, <span className="text-primary italic">one clear idea</span> at a time.
            </h1>
            <p className="max-w-xl text-lg text-muted-foreground">
              Sprout teaches budgeting, saving, debt and investing in plain English. Learn with short lessons, build a plan for
              your own situation, and ask an AI coach that shows its working.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              {accounts ? (
                <>
                  <Button render={<Link href="/login?mode=signup" />} nativeButton={false} className="h-11 px-5 text-base">
                    Create your account
                    <ArrowRightIcon />
                  </Button>
                  <Button
                    render={<a href="#try-it" />}
                    nativeButton={false}
                    variant="outline"
                    className="h-11 bg-background px-5 text-base"
                  >
                    Try it without an account
                  </Button>
                </>
              ) : (
                <>
                  <Button render={<Link href="/learn" />} nativeButton={false} className="h-11 px-5 text-base">
                    Start learning
                    <ArrowRightIcon />
                  </Button>
                  <Button
                    render={<Link href="/assistant" />}
                    nativeButton={false}
                    variant="outline"
                    className="h-11 bg-background px-5 text-base"
                  >
                    Ask the assistant
                  </Button>
                </>
              )}
            </div>
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              {accounts
                ? "Everything works without an account. Sign up when you want your progress on every device."
                : "Everything works in your browser, with nothing to sign up for."}
            </p>
          </div>
          <div className="animate-rise [animation-delay:120ms]">
            <DoublingCard />
          </div>
        </div>
      </section>

      {/* 2. What's inside */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20" aria-labelledby="inside-title">
        <SectionIntro eyebrow="What's inside" title="What you can do with Sprout" titleId="inside-title">
          {accounts
            ? "Use any part on its own, in any order. Everything works with or without an account."
            : "Use any part on its own, in any order."}
        </SectionIntro>
        <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((item) => (
            <li key={item.title}>
              <CardLink href={item.href}>
                {/* A div, not a span: a heading can't sit inside a span. */}
                <div className="flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                    <item.icon className="size-5" aria-hidden="true" />
                  </span>
                  <h3 className="text-lg font-semibold">{item.title}</h3>
                </div>
                <p className="mt-3 flex-1 text-sm text-muted-foreground">{item.body}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                  {item.cta}
                  <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
              </CardLink>
            </li>
          ))}
        </ul>
      </section>

      {/* 3. Who it's for */}
      <section className="border-y bg-surface" aria-labelledby="audience-title">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <SectionIntro eyebrow="Who it's for" title="Made for people starting out" titleId="audience-title">
            Especially teens and twenty-somethings making their first money decisions, and anyone who was never taught how
            money works. No background needed.
          </SectionIntro>
          <ul className="mt-10 grid gap-4 md:grid-cols-3">
            {AUDIENCES.map((item) => (
              <li key={item.title} className="flex gap-4 rounded-xl border bg-card p-5 md:flex-col md:p-6">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                  <item.icon className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-lg font-semibold">{item.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{item.body}</p>
                </div>
              </li>
            ))}
          </ul>
          <Link href="/about" className="group mt-6 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary">
            Why we built Sprout
            <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        </div>
      </section>

      {/* 4. Try it now */}
      <TryItSection />

      {/* 5. Built to be trusted */}
      <section className="border-y bg-surface" aria-labelledby="trust-title">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <SectionIntro eyebrow="Built to be trusted" title="Clear rules for what Sprout says, and for your data" titleId="trust-title" />
          <div className="mt-10 grid gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <h3 className="text-xl font-semibold">What Sprout will and won&apos;t do</h3>
              <PointList points={teachingRules(features)} />
            </div>
            <div>
              <h3 className="text-xl font-semibold">What happens to your data</h3>
              <PointList points={dataRules(features)} />
              <Link
                href="/faq#where-is-my-data-stored"
                className="group mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary"
              >
                How Sprout handles your data
                <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Your account, or a plain start when accounts aren't set up */}
      {accounts ? <AccountSection features={features} /> : <StartSection />}

      {/* 7. FAQ pointer: the FAQ is only linked from the bottom of the page (product decision). */}
      <FaqPointer features={features} />
    </main>
  )
}
