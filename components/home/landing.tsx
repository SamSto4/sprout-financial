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
import { GrowthLine } from "@/components/growth-line"
import { ClosingPanel } from "@/components/home/closing-panel"
import { DeletedNotice } from "@/components/home/deleted-notice"
import { FaqPointer } from "@/components/home/faq-pointer"
import { ARROW_LINK, SECTION_SPACE, SectionIntro } from "@/components/home/section-intro"
import { TryItSection } from "@/components/home/try-it-section"
import { Button } from "@/components/ui/button"
import { LESSONS, MODULES } from "@/lib/learn/course"
import type { SiteFeatures } from "@/lib/site"

// The home page for signed-out visitors and search engines: what Sprout is, who it's for, how it
// handles data and what an account adds. Every claim here is backed by code (the comment above an
// item names its sources), and copy that depends on configuration reads SiteFeatures.

type Point = { icon: LucideIcon; title: string; body: string }
type Feature = Point & { href: string; cta: string }

// The three core pillars, shown large: learn, plan, ask.
const PILLARS: Feature[] = [
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
]

// The tools around them, shown as a compact list.
const MORE_FEATURES: Feature[] = [
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
      // lib/stores.ts (memoryStore on by default, sharePlanStore on with the first plan save, shareFinancesStore off),
      // components/assistant.tsx and components/plan/plan-sidebar-panel.tsx (the switches)
      icon: ToggleRightIcon,
      title: "Switches for what the AI sees",
      body: "The assistant uses your past chats unless you turn that off, your plan and portfolio once you save a plan or ask it about your portfolio, and your transactions only when you share them. Each has a switch next to the chat.",
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

/** A link to a page, or a plain anchor for a section on this page. */
function SmartLink({ href, className, children }: { href: string; className: string; children: ReactNode }) {
  return href.startsWith("#") ? (
    <a href={href} className={className}>
      {children}
    </a>
  ) : (
    <Link href={href} className={className}>
      {children}
    </Link>
  )
}

function Arrow({ className }: { className?: string }) {
  return (
    <ArrowRightIcon
      className={cn("size-4 shrink-0 transition-transform duration-(--duration-fast) ease-out group-hover:translate-x-0.5", className)}
      aria-hidden="true"
    />
  )
}

function IconTile({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary", className)}>
      <Icon className="size-5" aria-hidden="true" />
    </span>
  )
}

function PointList({ points }: { points: Point[] }) {
  return (
    <ul className="mt-6 space-y-6">
      {points.map((point) => (
        <li key={point.title} className="flex gap-4">
          <IconTile icon={point.icon} className="size-9 rounded-md" />
          <div>
            <h4 className="text-base font-semibold">{point.title}</h4>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{point.body}</p>
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

function Hero({ accounts, deletedNotice }: { accounts: boolean; deletedNotice: boolean }) {
  return (
    <section className="relative overflow-hidden border-b bg-surface" aria-labelledby="hero-title">
      <div className="relative mx-auto grid max-w-6xl gap-12 px-4 pt-12 pb-16 sm:px-6 sm:pt-20 sm:pb-24 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-center lg:gap-16 lg:pt-24 lg:pb-28">
        <div className="animate-rise">
          {deletedNotice && (
            <div className="mb-6">
              <DeletedNotice />
            </div>
          )}
          <p className="eyebrow">Financial literacy, made practical</p>
          <h1 id="hero-title" className="display mt-4 text-[2.625rem] sm:text-6xl lg:text-[4.25rem]">
            Understand your money, <span className="text-primary italic">one clear idea</span> at a time.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground">
            Sprout teaches budgeting, saving, debt and investing in plain English. Learn with short lessons, build a plan for
            your own situation, and ask an AI coach that shows its working.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            {accounts ? (
              <>
                <Button render={<Link href="/login?mode=signup" />} nativeButton={false} size="lg">
                  Create your account
                  <ArrowRightIcon />
                </Button>
                <Button render={<a href="#try-it" />} nativeButton={false} variant="outline" size="lg">
                  Try it without an account
                </Button>
              </>
            ) : (
              <>
                <Button render={<Link href="/learn" />} nativeButton={false} size="lg">
                  Start learning
                  <ArrowRightIcon />
                </Button>
                <Button render={<Link href="/assistant" />} nativeButton={false} variant="outline" size="lg">
                  Ask the assistant
                </Button>
              </>
            )}
          </div>
          <p className="mt-6 flex items-start gap-2 text-sm text-muted-foreground">
            <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            {accounts
              ? "Everything works without an account. Sign up when you want your progress on every device."
              : "Everything works in your browser, with nothing to sign up for."}
          </p>
        </div>
        {/* The signature growth line rises out of the Rule of 72 card and ends in a leaf. */}
        <div className="animate-rise [animation-delay:120ms]">
          <GrowthLine draw className="-mb-px ml-10 h-20 w-[calc(100%-3.5rem)] sm:h-28" />
          <DoublingCard />
        </div>
      </div>
    </section>
  )
}

function FeaturesSection({ accounts }: { accounts: boolean }) {
  return (
    <section className={cn("mx-auto max-w-6xl", SECTION_SPACE)} aria-labelledby="inside-title">
      <SectionIntro eyebrow="What's inside" title="What you can do with Sprout" titleId="inside-title">
        {accounts
          ? "Use any part on its own, in any order. Everything works with or without an account."
          : "Use any part on its own, in any order."}
      </SectionIntro>

      {/* The three pillars: wide editorial rows, so they read first and in order. */}
      <ol className="mt-12 border-t sm:mt-14">
        {PILLARS.map((item, index) => (
          <li key={item.title} className="border-b">
            <Link
              href={item.href}
              className="group grid gap-x-8 gap-y-3 py-8 transition-colors duration-(--duration-fast) sm:-mx-4 sm:rounded-xl sm:px-4 md:grid-cols-[3rem_minmax(0,5fr)_minmax(0,6fr)] md:items-start md:py-10 [@media(hover:hover)]:hover:bg-surface"
            >
              <span className="figures font-heading text-sm font-semibold text-brand md:pt-2" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="display text-2xl sm:text-[1.75rem]">{item.title}</h3>
              <div>
                <p className="text-base leading-relaxed text-muted-foreground">{item.body}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                  {item.cta}
                  <Arrow />
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ol>

      {/* The tools around them: a compact secondary list. */}
      <div className="mt-12 sm:mt-16">
        <p className="text-sm font-semibold text-foreground">Also in Sprout</p>
        <ul className="mt-5 grid gap-3 md:grid-cols-3 md:gap-5">
          {MORE_FEATURES.map((item) => (
            <li key={item.title}>
              <SmartLink
                href={item.href}
                className="group lift flex h-full flex-col rounded-xl border bg-card p-5 shadow-xs"
              >
                <div className="flex items-center gap-3">
                  <IconTile icon={item.icon} className="size-9 rounded-md" />
                  <h3 className="text-base font-semibold">{item.title}</h3>
                </div>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                  {item.cta}
                  <Arrow />
                </span>
              </SmartLink>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function AudienceSection() {
  return (
    <section className="band" aria-labelledby="audience-title">
      <div
        className={cn(
          "mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16",
          SECTION_SPACE
        )}
      >
        <div>
          <SectionIntro eyebrow="Who it's for" title="Made for people starting out" titleId="audience-title">
            Especially teens and twenty-somethings making their first money decisions, and anyone who was never taught how
            money works. No background needed.
          </SectionIntro>
          <Link href="/about" className={cn(ARROW_LINK, "mt-4")}>
            Why we built Sprout
            <Arrow />
          </Link>
        </div>
        <ul className="divide-y rounded-2xl border bg-card shadow-sm">
          {AUDIENCES.map((item) => (
            <li key={item.title} className="flex gap-4 p-5 sm:gap-5 sm:p-7">
              <IconTile icon={item.icon} className="size-11 rounded-xl" />
              <div>
                <h3 className="text-xl font-semibold">{item.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground sm:text-base">{item.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function TrustSection({ features }: { features: SiteFeatures }) {
  return (
    <section className="band" aria-labelledby="trust-title">
      <div className={cn("mx-auto max-w-6xl", SECTION_SPACE)}>
        <SectionIntro
          eyebrow="Built to be trusted"
          title="Clear rules for what Sprout says, and for your data"
          titleId="trust-title"
        />
        <div className="mt-12 grid gap-5 lg:grid-cols-2 lg:gap-6">
          <div className="rounded-2xl border bg-card p-6 shadow-xs sm:p-8">
            <h3 className="text-xl font-semibold sm:text-2xl">What Sprout will and won&apos;t do</h3>
            <PointList points={teachingRules(features)} />
          </div>
          <div className="rounded-2xl border bg-card p-6 shadow-xs sm:p-8">
            <h3 className="text-xl font-semibold sm:text-2xl">What happens to your data</h3>
            <PointList points={dataRules(features)} />
            <Link href="/faq#where-is-my-data-stored" className={cn(ARROW_LINK, "mt-4")}>
              How Sprout handles your data
              <Arrow />
            </Link>
          </div>
        </div>
      </div>
    </section>
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
    <section className={cn("mx-auto max-w-6xl", SECTION_SPACE)} aria-labelledby="account-title">
      <SectionIntro eyebrow="Your account" title="Try everything first. Sign up when you want to keep it." titleId="account-title">
        An account is optional. It saves your work to your account, so it&apos;s there on every device you use.
      </SectionIntro>
      <div className="mt-12 grid gap-5 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:items-start lg:gap-6">
        <div className="rounded-2xl border bg-surface p-6 sm:p-8">
          <h3 className="text-xl font-semibold">Without an account</h3>
          <ul className="mt-5 space-y-3 text-sm">
            {without.map(([on, text]) => (
              <li key={text} className="flex items-start gap-3">
                <Mark on={on} />
                {text}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative overflow-hidden rounded-2xl border border-brand/50 bg-card p-6 shadow-md sm:p-8">
          <GrowthLine className="pointer-events-none absolute top-6 right-6 h-10 w-28 opacity-60" />
          <h3 className="text-xl font-semibold">With an account</h3>
          <ul className="mt-5 space-y-3 text-sm">
            {withAccount.map((text) => (
              <li key={text} className="flex items-start gap-3">
                <Mark on />
                {text}
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button render={<Link href="/login?mode=signup" />} nativeButton={false} size="lg">
              Create your account
              <ArrowRightIcon />
            </Button>
            <Button render={<Link href="/login" />} nativeButton={false} variant="ghost" size="lg">
              Log in
            </Button>
          </div>
          <p className="mt-5 text-xs leading-relaxed text-muted-foreground">{smallPrint}</p>
        </div>
      </div>
    </section>
  )
}

function StartSection() {
  return (
    <section className={cn("mx-auto max-w-6xl", SECTION_SPACE)} aria-labelledby="start-title">
      <ClosingPanel
        titleId="start-title"
        title="Start with one lesson"
        body="Everything works in your browser, with nothing to sign up for."
        primary={{ href: "/learn", label: "Start learning" }}
        secondary={{ href: "/plan", label: "Build my plan" }}
      />
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
  // Section rhythm: soft-green hero, then white and band sections in turn, ending on the action.
  return (
    <main>
      {/* 1. Hero */}
      <Hero accounts={accounts} deletedNotice={deletedNotice} />

      {/* 2. What's inside: three pillars, then the tools around them */}
      <FeaturesSection accounts={accounts} />

      {/* 3. Who it's for */}
      <AudienceSection />

      {/* 4. Try it now */}
      <TryItSection />

      {/* 5. Built to be trusted */}
      <TrustSection features={features} />

      {/* 6. Your account, or a plain start when accounts aren't set up */}
      {accounts ? <AccountSection features={features} /> : <StartSection />}

      {/* 7. FAQ pointer: the FAQ is only linked from the bottom of the page (product decision). */}
      <FaqPointer features={features} />
    </main>
  )
}
