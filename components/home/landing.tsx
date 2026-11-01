import type { ReactNode } from "react"
import Link from "next/link"
import { ArrowRightIcon, CheckIcon, MinusIcon } from "lucide-react"
import { cn } from "cn"

import { CompoundCalculator } from "@/components/compound-calculator"
import { GrowthLine } from "@/components/growth-line"
import { DeletedNotice } from "@/components/home/deleted-notice"
import { FaqPointer } from "@/components/home/faq-pointer"
import { ARROW_LINK } from "@/components/home/section-intro"
import { STARTER_QUESTIONS } from "@/components/home/try-it-section"
import { Button } from "@/components/ui/button"
import { LESSONS, MODULES } from "@/lib/learn/course"
import { MAX_PREFILL_LENGTH } from "@/lib/chat/validate"
import type { SiteFeatures } from "@/lib/site"

// The home page for signed-out visitors and search engines: what Sprout is, who it's for, how it
// handles data and what an account adds. Every claim here is backed by code (the comment above an
// item names its sources), and copy that depends on configuration reads SiteFeatures.
//
// Rhythm: a deep-green hero with the assistant as its picture, a light-green band of figures, the
// three ways in (each with a small picture of its screen), the calculator on deep green, the trust
// rules, the account, the FAQ pointer, and a deep-green close that ends on the action.

const FIRST_LESSON = LESSONS[0]

// The calculators: compound growth, fee drag, the Rule of 72 and the 50/30/20 budget (ToolId in
// lib/learn/course.ts; components/compound-calculator.tsx, fee-calculator.tsx, doubling-card.tsx,
// budget-planner.tsx).
const CALCULATOR_COUNT = 4

/** Eyebrow text above a heading; `onDeep` for the deep-green bands. */
function Eyebrow({ children, onDeep = false }: { children: ReactNode; onDeep?: boolean }) {
  return <p className={cn("eyebrow", onDeep && "text-leaf")}>{children}</p>
}

/** A large display heading used to open each section. */
function SectionTitle({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  return (
    <h2 id={id} className={cn("display mt-4 text-[2.5rem] leading-[1.02] sm:text-5xl lg:text-[4rem]", className)}>
      {children}
    </h2>
  )
}

function Arrow() {
  return (
    <ArrowRightIcon
      className="size-4 shrink-0 transition-transform duration-(--duration-fast) ease-out group-hover:translate-x-0.5"
      aria-hidden="true"
    />
  )
}

/** Call-to-action buttons on a deep-green band: a light-green fill and a quiet outline. */
const LEAF_BUTTON =
  "bg-leaf text-leaf-foreground hover:bg-[color-mix(in_oklch,var(--leaf),white_18%)] focus-visible:ring-leaf/60"
const DEEP_OUTLINE_BUTTON =
  "border-white/35 bg-transparent text-deep-foreground shadow-none hover:border-white/60 hover:bg-white/10 hover:text-deep-foreground focus-visible:ring-leaf/60"

function Hero({ accounts, deletedNotice }: { accounts: boolean; deletedNotice: boolean }) {
  return (
    <section className="relative z-10 bg-deep text-deep-foreground" aria-labelledby="hero-title">
      {/* The growth line sweeps across the band behind everything; clipped here so the assistant
          window below can still hang over the band's bottom edge. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <GrowthLine draw leaf={false} className="absolute right-0 bottom-32 left-0 h-72 w-full opacity-50 sm:h-96" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 pt-14 text-center sm:px-6 sm:pt-20">
        {deletedNotice && (
          <div className="mx-auto mb-8 max-w-xl text-left text-foreground">
            <DeletedNotice />
          </div>
        )}
        <div className="animate-rise">
          <p className="inline-flex items-center gap-2 rounded-full border border-leaf/35 px-3.5 py-1.5 text-xs font-semibold tracking-[0.1em] text-leaf uppercase">
            <span className="size-1.5 rounded-full bg-leaf" aria-hidden="true" />
            Financial literacy, made practical
          </p>
          <h1
            id="hero-title"
            className="display mx-auto mt-6 max-w-[15ch] text-[2.75rem] leading-[0.98] tracking-[-0.035em] sm:text-7xl lg:text-[5.75rem]"
          >
            Understand your money, <span className="text-leaf italic">one clear idea</span> at a time.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-pretty text-deep-muted sm:text-xl">
            Short lessons, a plan built for your situation, and an AI coach that shows its working.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            {accounts ? (
              <>
                <Button render={<Link href="/login?mode=signup" />} nativeButton={false} size="lg" className={LEAF_BUTTON}>
                  Create your account
                  <ArrowRightIcon />
                </Button>
                <Button render={<a href="#try-it" />} nativeButton={false} variant="outline" size="lg" className={DEEP_OUTLINE_BUTTON}>
                  Try it without an account
                </Button>
              </>
            ) : (
              <>
                <Button render={<Link href="/learn" />} nativeButton={false} size="lg" className={LEAF_BUTTON}>
                  Start learning
                  <ArrowRightIcon />
                </Button>
                <Button render={<Link href="/assistant" />} nativeButton={false} variant="outline" size="lg" className={DEEP_OUTLINE_BUTTON}>
                  Ask the assistant
                </Button>
              </>
            )}
          </div>
          <p className="mt-4 text-sm text-deep-muted">
            {accounts
              ? "No card, no bank login. Everything works before you sign up."
              : "No card, no bank login, nothing to sign up for."}
          </p>
        </div>

        <CoachWindow />
      </div>
    </section>
  )
}

/**
 * The assistant as the hero's picture, and a working way in: the form opens /assistant with the
 * question pre-filled (`?q=`, prefilledQuestion in lib/chat/validate.ts), so nothing is sent until
 * the visitor presses Send there. It shows no made-up answer.
 */
function CoachWindow() {
  return (
    <div className="relative z-10 mx-auto mt-12 -mb-44 max-w-3xl animate-rise overflow-hidden rounded-2xl bg-card text-left text-foreground shadow-[0_4px_8px_rgb(3_12_8/0.2),0_40px_80px_-24px_rgb(3_12_8/0.6)] [animation-delay:120ms] sm:mt-14">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5">
        <p className="flex items-center gap-2.5 text-sm font-semibold">
          <span className="size-2.5 rounded-full bg-brand" aria-hidden="true" />
          Sprout coach
        </p>
        <p className="rounded-full border bg-surface px-2.5 py-1 text-xs font-medium text-muted-foreground">
          Education, not advice
        </p>
      </div>
      <div className="space-y-4 bg-surface/60 px-5 py-6 sm:px-6">
        {/* lib/ai/system-prompt.ts (plain-English persona), lib/ai/calculators.ts (numbers from tools) */}
        <p className="max-w-[85%] rounded-2xl rounded-bl-md border bg-card px-4 py-3 text-[0.9375rem] leading-relaxed">
          Ask me anything about money. I&apos;ll explain it in plain English, and any numbers come from real calculators.
        </p>
        <div>
          <p className="text-xs font-medium text-muted-foreground">Try one of these</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {STARTER_QUESTIONS.map((question) => (
              <li key={question}>
                <Link
                  href={`/assistant?q=${encodeURIComponent(question)}`}
                  className="flex min-h-10 items-center rounded-full border border-input bg-card px-3.5 text-sm text-primary transition-colors duration-(--duration-fast) hover:border-brand/60 hover:bg-secondary"
                >
                  {question}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <form action="/assistant" method="get" className="flex gap-2 border-t bg-card p-3">
        <label htmlFor="hero-question" className="sr-only">
          Ask a question about money
        </label>
        <input
          id="hero-question"
          name="q"
          type="text"
          required
          maxLength={MAX_PREFILL_LENGTH}
          autoComplete="off"
          placeholder="Ask anything about money"
          className="h-12 min-w-0 flex-1 rounded-lg border border-control bg-card px-4 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <Button type="submit" size="icon-lg" className="size-12" aria-label="Open this question in the assistant">
          <ArrowRightIcon className="size-5" />
        </Button>
      </form>
    </div>
  )
}

/** Course size and promises, as figures. Counts come from the code. */
function FiguresBand() {
  const figures: [string, string][] = [
    // lib/learn/course.ts (LESSONS; every lesson has a quiz, checked in course.test.ts)
    [String(LESSONS.length), "short lessons, each with a quiz"],
    // lib/learn/course.ts (MODULES)
    [String(MODULES.length), "modules, from zero to investing"],
    [String(CALCULATOR_COUNT), "calculators that show their working"],
    // AGENTS.md section 5.4 (read-only tools); bank data only arrives as CSV or screenshots
    ["0", "bank logins, ever"],
  ]
  return (
    <section aria-label="Sprout in numbers" className="bg-secondary px-4 pt-60 pb-20 sm:px-6 sm:pb-24">
      <ul className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-4 lg:gap-10">
        {figures.map(([figure, label]) => (
          <li key={label} className="border-t-2 border-primary pt-4">
            <span className="figures display block text-6xl leading-none tracking-[-0.03em] sm:text-7xl lg:text-8xl">
              {figure}
            </span>
            <span className="mt-3 block text-sm text-muted-strong sm:text-base">{label}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** A small picture of a feature's screen, on a tinted panel. */
function PreviewPanel({ tone, children }: { tone: "surface" | "deep" | "soft"; children: ReactNode }) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-3xl p-6 sm:p-10",
        tone === "surface" && "bg-surface",
        tone === "deep" && "bg-deep",
        tone === "soft" && "bg-secondary"
      )}
    >
      <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">{children}</div>
    </div>
  )
}

function FeatureRow({
  index,
  title,
  body,
  href,
  cta,
  reverse = false,
  picture,
}: {
  index: number
  title: string
  body: string
  href: string
  cta: string
  reverse?: boolean
  picture: ReactNode
}) {
  return (
    <div className="grid items-center gap-10 md:grid-cols-2 md:gap-16">
      <div className={cn("min-w-0", reverse && "md:order-2")}>
        <span className="figures font-heading text-lg font-semibold text-primary" aria-hidden="true">
          {String(index).padStart(2, "0")}
        </span>
        <h3 className="display mt-2 text-3xl sm:text-[2.5rem]">{title}</h3>
        <p className="mt-4 max-w-md text-[1.0625rem] leading-relaxed text-muted-foreground">{body}</p>
        <Link href={href} className={cn(ARROW_LINK, "mt-3 text-[0.9375rem] font-semibold")}>
          {cta}
          <Arrow />
        </Link>
      </div>
      <div className={cn("min-w-0", reverse && "md:order-1")}>{picture}</div>
    </div>
  )
}

function SwitchPicture({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 rounded-full",
        on ? "bg-primary" : "border-2 border-control bg-card"
      )}
      aria-hidden="true"
    >
      <span
        className={cn(
          "absolute top-1/2 size-[1.125rem] -translate-y-1/2 rounded-full",
          on ? "right-[3px] bg-white" : "left-[2px] bg-control"
        )}
      />
    </span>
  )
}

function FeaturesSection() {
  // lib/plan/roadmap.ts (buildRoadmap): the first steps of the roadmap, in its order.
  const roadmapExample: [string, "done" | "current" | "todo"][] = [
    ["Build a starter cash buffer", "done"],
    ["Pay off high-interest debt", "current"],
    ["Get your full employer match", "todo"],
  ]
  // lib/stores.ts: memoryStore on by default, sharePlanStore on with the first plan save,
  // shareFinancesStore off until shared; the switches sit next to the chat (components/assistant.tsx).
  const sees: [string, string, boolean][] = [
    ["Past chats", "On unless you turn it off", true],
    ["Plan and portfolio", "On once you save a plan", true],
    ["Transactions", "Off until you share them", false],
  ]
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:py-32" aria-labelledby="inside-title">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between lg:gap-16">
        <div className="min-w-0">
          <Eyebrow>What&apos;s inside</Eyebrow>
          <SectionTitle id="inside-title" className="max-w-[14ch]">
            Three ways in. Start anywhere.
          </SectionTitle>
        </div>
        <p className="max-w-sm text-lg leading-relaxed text-muted-foreground lg:mb-2">
          Learn the basics, build a plan, or just ask. Each part works on its own, in any order.
        </p>
      </div>

      <div className="mt-16 space-y-20 sm:mt-20 sm:space-y-28">
        {/* lib/learn/course.ts (LESSONS, MODULES, every lesson has a quiz), lib/learn/glossary.ts */}
        <FeatureRow
          index={1}
          title="A course that starts from zero"
          body={`${LESSONS.length} short lessons in ${MODULES.length} modules, from why invest at all to spotting scams. Each ends with a quick quiz, and a glossary explains the jargon.`}
          href="/learn"
          cta="See the course"
          picture={
            <PreviewPanel tone="surface">
              <p className="eyebrow">
                {FIRST_LESSON.module.title} · Lesson {FIRST_LESSON.number}
              </p>
              <p className="mt-1.5 font-heading text-2xl font-semibold">{FIRST_LESSON.title}</p>
              <div className="mt-5 flex justify-between text-xs text-muted-foreground">
                <span className="figures">
                  Lesson {FIRST_LESSON.number} of {LESSONS.length}
                </span>
                <span>Quiz at the end</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
                <div className="h-full rounded-full bg-brand" style={{ width: `${100 / LESSONS.length}%` }} />
              </div>
              <Link
                href={`/learn/${FIRST_LESSON.slug}`}
                className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-[color-mix(in_oklch,var(--primary),black_14%)]"
              >
                Start lesson {FIRST_LESSON.number}
                <ArrowRightIcon className="size-4" aria-hidden="true" />
              </Link>
            </PreviewPanel>
          }
        />

        {/* lib/plan/profile.ts (RISK_QUESTIONS, targetStockRange), lib/plan/roadmap.ts */}
        <FeatureRow
          index={2}
          reverse
          title="A plan for your situation"
          body="Take a short risk quiz and add your savings and debts. You get a step-by-step money roadmap and a target range for how much of your investments to keep in stocks."
          href="/plan"
          cta="Build my plan"
          picture={
            <PreviewPanel tone="deep">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-heading text-xl font-semibold">Your money roadmap</p>
                <span className="rounded-md bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning-foreground">Example</span>
              </div>
              <ol className="mt-5 space-y-3">
                {roadmapExample.map(([step, status], i) => (
                  <li key={step} className="flex items-center gap-3 text-[0.9375rem]">
                    <span
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                        status === "done" && "bg-primary text-primary-foreground",
                        status === "current" && "border-2 border-primary text-primary",
                        status === "todo" && "border-2 border-control text-muted-foreground"
                      )}
                    >
                      {status === "done" ? <CheckIcon className="size-3.5" strokeWidth={3} aria-label="Done" /> : i + 1}
                    </span>
                    <span
                      className={cn(
                        status === "done" && "text-muted-foreground line-through",
                        status === "current" && "font-semibold",
                        status === "todo" && "text-muted-foreground"
                      )}
                    >
                      {step}
                    </span>
                  </li>
                ))}
              </ol>
            </PreviewPanel>
          }
        />

        {/* lib/ai/tools.ts, lib/ai/calculators.ts, components/plan/plan-sidebar-panel.tsx (the sharing switch) */}
        <FeatureRow
          index={3}
          title="An AI coach that shows its working"
          body="Ask anything about money and get a plain-English answer. Numbers come from real calculators, and switches next to the chat control what it sees."
          href="/assistant"
          cta="Ask a question"
          picture={
            <PreviewPanel tone="soft">
              <p className="text-sm font-semibold text-muted-strong">What the coach can see</p>
              <ul className="mt-2 divide-y">
                {sees.map(([label, note, on]) => (
                  <li key={label} className="flex items-center justify-between gap-4 py-3.5">
                    <span>
                      <span className="block text-[0.9375rem] font-medium">{label}</span>
                      <span className="block text-xs text-muted-foreground">{note}</span>
                    </span>
                    <SwitchPicture on={on} />
                  </li>
                ))}
              </ul>
            </PreviewPanel>
          }
        />
      </div>
    </section>
  )
}

/** The compound growth calculator on a deep-green band (the assistant's prompt points people here). */
function CalculatorBand() {
  return (
    <section id="try-it" className="scroll-mt-16 bg-deep text-deep-foreground" aria-labelledby="try-title">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:py-32">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between lg:gap-16">
          <div className="min-w-0">
            <Eyebrow onDeep>Try it now, no account needed</Eyebrow>
            <SectionTitle id="try-title" className="max-w-[16ch]">
              Small amounts, given time, add up.
            </SectionTitle>
          </div>
          <p className="max-w-sm text-lg leading-relaxed text-deep-muted lg:mb-2">
            Move the sliders to see how much of a long-term balance comes from growth rather than deposits.
          </p>
        </div>
        <div className="mt-12 text-foreground sm:mt-14">
          <CompoundCalculator />
        </div>
      </div>
    </section>
  )
}

function TrustSection({ features }: { features: SiteFeatures }) {
  const rules: [string, string][] = [
    // lib/ai/system-prompt.ts (Boundaries)
    ["Education, not advice.", "It explains options, trade-offs and risks. It never tells you what to buy or sell, and never promises returns."],
    // lib/ai/calculators.ts, lib/finance/* and their tests
    ["Maths you can check.", "Projections and fees come from tested calculators, not the AI's own arithmetic, with the assumptions stated."],
    // lib/ai/system-prompt.ts (professional referral for complex situations)
    ["Honest about limits.", "For big or complicated decisions, it suggests a qualified professional, such as a fee-only fiduciary advisor."],
    // lib/stores.ts (localStorage), components/providers.tsx (sync starts only when signed in)
    [
      "Saved in your browser first.",
      features.accounts
        ? "Your plan, budgets, chats and progress stay in this browser. Nothing goes to an account unless you create one."
        : "Your plan, budgets, chats and progress are kept in this browser.",
    ],
    // AGENTS.md section 5.4 (read-only tools), app/(pages)/portfolio/page.tsx
    ["No bank logins.", "Bring in transactions from a CSV file or screenshots. Sprout can't connect to your bank, move money or place trades."],
    // app/api/import/screenshot/route.ts, lib/screenshots/transaction-rows.ts and holding-rows.ts (maskAccountNumbers)
    ["Screenshots are read, not kept.", "Long account numbers are cut to the last four digits, and nothing is saved until you confirm."],
  ]
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:py-32" aria-labelledby="trust-title">
      <Eyebrow>Built to be trusted</Eyebrow>
      <SectionTitle id="trust-title" className="max-w-[18ch]">
        Honest about money. Careful with your data.
      </SectionTitle>
      <ul className="mt-12 grid gap-px overflow-hidden rounded-2xl border bg-border sm:mt-16 sm:grid-cols-2 lg:grid-cols-3">
        {rules.map(([title, body]) => (
          <li key={title} className="bg-card p-6 sm:p-8">
            <h3 className="font-heading text-[1.375rem] leading-snug font-semibold">{title}</h3>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted-foreground">{body}</p>
          </li>
        ))}
      </ul>
      <Link href="/faq#where-is-my-data-stored" className={cn(ARROW_LINK, "mt-6 text-[0.9375rem] font-semibold")}>
        How Sprout handles your data
        <Arrow />
      </Link>
    </section>
  )
}

function Mark({ on }: { on: boolean }) {
  const Icon = on ? CheckIcon : MinusIcon
  return (
    <span
      className={cn(
        "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
        on ? "bg-card text-primary" : "bg-card text-muted-foreground"
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
    <section className="band" aria-labelledby="account-title">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <Eyebrow>Your account</Eyebrow>
        <SectionTitle id="account-title" className="max-w-[16ch]">
          Try everything first. Sign up to keep it.
        </SectionTitle>
        <div className="mt-12 grid items-stretch gap-5 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-6">
          <div className="flex flex-col rounded-2xl border bg-secondary/60 p-6 sm:p-8">
            <h3 className="font-heading text-xl font-semibold">Without an account</h3>
            <ul className="mt-5 space-y-3 text-[0.9375rem]">
              {without.map(([on, text]) => (
                <li key={text} className={cn("flex items-start gap-3", !on && "text-muted-foreground")}>
                  <Mark on={on} />
                  {text}
                </li>
              ))}
            </ul>
            <a href="#try-it" className={cn(ARROW_LINK, "mt-auto pt-6 font-semibold")}>
              Try it without an account
              <Arrow />
            </a>
          </div>
          <div className="flex flex-col rounded-2xl border border-brand/50 bg-card p-6 shadow-md sm:p-8">
            <h3 className="font-heading text-xl font-semibold">With an account</h3>
            <ul className="mt-5 space-y-3 text-[0.9375rem]">
              {withAccount.map((text) => (
                <li key={text} className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                    <CheckIcon className="size-3" strokeWidth={3} aria-hidden="true" />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
            <div className="mt-auto flex flex-col gap-2 pt-8 sm:flex-row sm:items-center">
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
      </div>
    </section>
  )
}

/** The page ends on the action: one lesson, no sign-up. */
function ClosingBand({ accounts }: { accounts: boolean }) {
  return (
    <section className="relative overflow-hidden bg-deep text-deep-foreground" aria-labelledby="start-title">
      <GrowthLine leaf={false} className="pointer-events-none absolute right-0 bottom-6 left-0 h-56 w-full opacity-50" />
      <div className="relative mx-auto max-w-6xl px-4 py-24 text-center sm:px-6 sm:py-32 lg:py-36">
        <h2 id="start-title" className="display mx-auto max-w-[14ch] text-5xl leading-[0.98] tracking-[-0.035em] sm:text-7xl lg:text-[5.75rem]">
          Start with <span className="text-leaf italic">one lesson.</span>
        </h2>
        <p className="mt-6 text-lg text-deep-muted sm:text-xl">
          {accounts ? "No sign-up needed." : "Nothing to sign up for."} Lesson {FIRST_LESSON.number}: {FIRST_LESSON.title}
        </p>
        <Button
          render={<Link href={`/learn/${FIRST_LESSON.slug}`} />}
          nativeButton={false}
          size="lg"
          className={cn(LEAF_BUTTON, "mt-9 h-12 px-6 text-base")}
        >
          Start learning
          <ArrowRightIcon />
        </Button>
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
      {/* 1. Hero, with the assistant as its picture */}
      <Hero accounts={accounts} deletedNotice={deletedNotice} />

      {/* 2. The course in figures (the assistant window overlaps its top) */}
      <FiguresBand />

      {/* 3. Three ways in, each with a picture of its screen */}
      <FeaturesSection />

      {/* 4. Try it now: the compound growth calculator */}
      <CalculatorBand />

      {/* 5. Built to be trusted */}
      <TrustSection features={features} />

      {/* 6. Your account (only where this server has accounts) */}
      {accounts && <AccountSection features={features} />}

      {/* 7. FAQ pointer: the FAQ is only linked from the bottom of the page (product decision). */}
      <FaqPointer features={features} />

      {/* 8. The close: start with one lesson */}
      <ClosingBand accounts={accounts} />
    </main>
  )
}
