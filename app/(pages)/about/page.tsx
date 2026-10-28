import type { Metadata } from "next"
import Link from "next/link"
import {
  ArrowRightIcon,
  BookOpenIcon,
  CheckIcon,
  CompassIcon,
  FlaskConicalIcon,
  LineChartIcon,
  MessageSquareTextIcon,
  PieChartIcon,
  SearchCheckIcon,
  ShieldCheckIcon,
  WalletIcon,
  XIcon,
} from "lucide-react"

import { GrowthLine } from "@/components/growth-line"
import { ClosingPanel } from "@/components/home/closing-panel"
import { FaqPointer } from "@/components/home/faq-pointer"
import { ARROW_LINK, SECTION_SPACE, SectionIntro } from "@/components/home/section-intro"
import { Button } from "@/components/ui/button"
import { projectGrowth } from "@/lib/finance/compound"
import { projectWithFee } from "@/lib/finance/fees"
import { formatMoney } from "@/lib/format"
import { LESSONS } from "@/lib/learn/course"
import { MARKET_DROPS } from "@/lib/portfolio/history"
import { pageMetadata } from "@/lib/seo/metadata"
import { PUBLIC_PAGES } from "@/lib/seo/pages"
import type { SiteFeatures } from "@/lib/site"
import { siteFeatures } from "@/lib/site-features"

export const metadata: Metadata = pageMetadata(PUBLIC_PAGES.about)

// Every dollar figure on this page comes from the same tested functions as the calculators.
const RETURN = 7
const endBalance = (monthly: number, years: number) =>
  projectGrowth({ principal: 0, monthlyContribution: monthly, annualRatePercent: RETURN, years }).at(-1)!
const early = endBalance(200, 43) // age 22 to 65
const late = endBalance(200, 33) // age 32 to 65
const feeInputs = { principal: 0, monthlyContribution: 300, annualRatePercent: RETURN, years: 40 }
const lowFee = projectWithFee({ ...feeInputs, feePercent: 0.05 })
const highFee = projectWithFee({ ...feeInputs, feePercent: 1 })

const STATS = [
  {
    figure: "48%",
    text: "of US Gen Z investors learn about investing mainly from social media.",
    source: { name: "FINRA Foundation & CFA Institute, 2023", url: "https://www.finra.org/media-center/newsreleases/2023/finra-foundation-cfa-institute-research-focuses-gen-z-investors" },
  },
  {
    figure: "50%",
    text: "say they've made an investment because of FOMO, the fear of missing out.",
    source: { name: "FINRA Foundation & CFA Institute, 2023", url: "https://www.finra.org/media-center/newsreleases/2023/finra-foundation-cfa-institute-research-focuses-gen-z-investors" },
  },
  {
    figure: "52%",
    text: "of Gen Z trust financial influencers, and 18% already use AI tools for money advice.",
    source: { name: "ASIC & YouGov, Australia, 2026", url: "https://www.commbank.com.au/articles/newsroom/2026/03/asic-finfluencers-warning.html" },
  },
  {
    figure: "56%",
    text: "of US Gen Z who don't invest say not knowing enough about investing holds them back.",
    source: { name: "FINRA Foundation & CFA Institute, 2023", url: "https://www.finra.org/media-center/newsreleases/2023/finra-foundation-cfa-institute-research-focuses-gen-z-investors" },
  },
]

// Counts in the copy come from the code (LESSONS, MARKET_DROPS), spelled out the way the copy reads.
const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"]
const spelled = (count: number) => NUMBER_WORDS[count] ?? String(count)
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

// The markets card depends on market data: "Markets, explained" (id="markets") is only on the
// Portfolio page when FMP_API_KEY is set, while the market-drop stress test always is.
function answers(features: SiteFeatures) {
  const crashes = spelled(MARKET_DROPS.length)
  return [
    {
      icon: CompassIcon,
      problem: "Investing before the basics are in place",
      answer:
        "Your money roadmap puts first things first: a cash buffer, then high-interest debt, then your employer match, then investing. It shows exactly which step you're on, with your own numbers.",
      href: "/plan",
      cta: "Build my plan",
    },
    {
      icon: SearchCheckIcon,
      problem: "Buying whatever is trending",
      answer:
        "The before-you-buy check runs any ticker you saw online through the questions that matter: what it is, how big a slice of your money it would be, how wild it has been, and whether your foundations are ready. It never says yes or no; it helps you decide.",
      href: "/portfolio#before-you-buy",
      cta: "Check a stock",
    },
    {
      icon: PieChartIcon,
      problem: "Hidden fees and accidental bets",
      answer:
        "Portfolio X-ray shows what you actually own: too much in one company, funds that hold the same stocks twice, and what your fees cost over 30 years. Then it shows how to rebalance with new money instead of selling.",
      href: "/portfolio",
      cta: "X-ray my portfolio",
    },
    features.marketData
      ? {
          icon: LineChartIcon,
          problem: "Panic-selling when markets fall",
          answer:
            `Markets, explained puts today's moves in context with live charts, the biggest drops along the way, and ${crashes} major crashes since 1973 with how long each recovery took. Then it shows what a fall would mean for your money.`,
          href: "/portfolio#markets",
          cta: "See the markets",
        }
      : {
          icon: LineChartIcon,
          problem: "Panic-selling when markets fall",
          answer:
            `The market-drop stress test shows what a big fall would do to your portfolio, next to ${crashes} major crashes since 1973 and how long each recovery took. Knowing that ahead of time makes a real drop easier to sit through.`,
          href: "/portfolio#market-drop",
          cta: "Try the stress test",
        },
    {
      icon: MessageSquareTextIcon,
      problem: "Advice that doesn't know you",
      answer:
        "The AI coach can read your plan and portfolio (there's a switch to turn that off), so its guidance fits your goals, debts and timeline. Every number comes from tested calculators, never the model's own arithmetic.",
      href: "/assistant",
      cta: "Ask the coach",
    },
    {
      icon: WalletIcon,
      problem: "No idea where the money goes",
      answer:
        "Import your bank's CSV to see spending by category, subscriptions and trends, and plan each month's budget against the 50/30/20 guideline. Your plan is remembered month to month.",
      href: "/dashboard",
      cta: "Open the dashboard",
    },
    {
      icon: BookOpenIcon,
      problem: "Never being taught any of this",
      answer:
        `${capitalize(spelled(LESSONS.length))} short lessons, from why invest at all to spotting scams, with quizzes, worked examples and a plain-English glossary. Start anywhere; the coach links you to the right lesson when it helps.`,
      href: "/learn",
      cta: "Start learning",
    },
  ]
}

// "Your data, your call" describes what really reaches the AI: past chats are on by default
// (memoryStore in lib/stores.ts), plan sharing turns on with the first plan save
// (components/plan/plan-builder.tsx), and transactions only once shared (shareFinancesStore). Each has
// a switch next to the chat (components/assistant.tsx, components/plan/plan-sidebar-panel.tsx).
function promises(features: SiteFeatures) {
  const synced = features.accounts ? ", and in your account only if you log in to sync them" : ""
  return [
    { title: "No stock picks, no hype", text: "Sprout teaches you how to decide. It never tells you to buy or sell a specific stock or coin, and never promises returns." },
    { title: "No conflicts of interest", text: "No ads, no commissions, no affiliate links. Sprout earns nothing from the investments you choose, so it has no reason to push you toward anything." },
    { title: "Math you can check", text: "Projections, fees and budgets come from open, tested code, with the assumptions stated, like the 7% yearly return on this page, which isn't guaranteed." },
    {
      title: "Your data, your call",
      text: `Your plan, portfolio, transactions and chats are kept in your browser${synced}. The assistant uses your past chats unless you turn that off, your plan and portfolio once you save a plan or ask it about your portfolio, and your transactions only when you share them, with a switch for each.`,
    },
    { title: "Honest about limits", text: "Sprout is education, not a licensed advisor. For big or complicated decisions, it tells you to talk to a fee-only fiduciary or a tax professional." },
  ]
}

const COMPARISON = [
  { label: "Knows your goals, debts and timeline", feed: false, generic: false, sprout: true },
  { label: "Puts your safety net before investing", feed: false, generic: "sometimes", sprout: true },
  { label: "Numbers from tested calculators", feed: false, generic: false, sprout: true },
  { label: "Earns nothing from what you buy", feed: "rarely", generic: true, sprout: true },
  { label: "Checks a hot tip before you act on it", feed: false, generic: "sometimes", sprout: true },
] as const

function Mark({ value }: { value: boolean | string }) {
  if (value === true)
    return (
      <span className="mx-auto flex size-6 items-center justify-center rounded-full bg-secondary text-primary">
        <CheckIcon className="size-3.5" strokeWidth={3} aria-label="Yes" />
      </span>
    )
  if (value === false) return <XIcon className="mx-auto size-4 text-muted-foreground/60" aria-label="No" />
  return <span className="text-xs text-muted-foreground">{value}</span>
}

/** Money figures in the "Why it matters" cards: the better outcome in green. */
function Figure({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t py-3 first:border-t-0 first:pt-0">
      <dt className="text-sm">{label}</dt>
      <dd className={`display text-[1.75rem] ${highlight ? "text-primary" : "text-foreground"}`}>{value}</dd>
    </div>
  )
}

export default function AboutPage() {
  const features = siteFeatures()
  const answerCards = answers(features)
  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden border-b bg-surface" aria-labelledby="about-title">
        <GrowthLine className="pointer-events-none absolute right-[max(2.5rem,calc((100vw-72rem)/2+2.5rem))] bottom-28 hidden h-32 w-[30%] lg:block" />
        <div className="relative mx-auto max-w-6xl px-4 pt-12 pb-16 sm:px-6 sm:pt-20 sm:pb-24 lg:pt-24 lg:pb-28">
          <div className="max-w-3xl animate-rise">
            <p className="eyebrow">About Sprout</p>
            <h1 id="about-title" className="display mt-4 text-[2.625rem] sm:text-6xl lg:text-[4.25rem]">
              The money mentor most young investors <span className="text-primary italic">never had</span>.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-pretty text-muted-foreground">
              Most of us learn about money from feeds built to keep us scrolling, not to help us build wealth. Sprout gives you a
              plan for your situation, honest math, and a coach that helps you think before you act.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button render={<Link href="/plan" />} nativeButton={false} size="lg">
                Build my plan
                <ArrowRightIcon />
              </Button>
              <Button render={<Link href="/learn" />} nativeButton={false} variant="outline" size="lg">
                Start the course
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* The problem */}
      <section className={`mx-auto max-w-6xl ${SECTION_SPACE}`} aria-labelledby="problem-title">
        <SectionIntro
          eyebrow="The problem"
          title="Young people are investing. Mostly, they're figuring it out from their feeds."
          titleId="problem-title"
          className="max-w-3xl"
        >
          Starting young is the biggest advantage an investor can have. But the loudest teachers online are rewarded for clicks,
          not results. The result: buying on hype, skipping the safety net, paying fees nobody explained, and selling in a panic
          when markets drop.
        </SectionIntro>
        {/* Figures as an editorial row with hairline dividers, not a grid of boxes. */}
        <ul className="mt-12 grid gap-x-8 gap-y-8 sm:mt-14 sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map((stat) => (
            <li key={stat.text} className="flex flex-col border-t pt-6">
              <p className="display figures text-5xl text-primary sm:text-[3.5rem]">{stat.figure}</p>
              <p className="mt-3 flex-1 text-[0.9375rem] leading-relaxed">{stat.text}</p>
              <a
                href={stat.source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex min-h-6 items-center text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Source: {stat.source.name}
              </a>
            </li>
          ))}
        </ul>
      </section>

      {/* Why it matters */}
      <section className="band" aria-labelledby="matters-title">
        <div className={`mx-auto max-w-6xl ${SECTION_SPACE}`}>
          <SectionIntro
            eyebrow="Why it matters"
            title="Small decisions in your twenties turn into big numbers."
            titleId="matters-title"
          />
          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            <div className="flex flex-col rounded-2xl border bg-card p-6 shadow-xs sm:p-7">
              <p className="eyebrow">Starting early</p>
              <p className="mt-3 text-sm text-muted-foreground">Investing $200 a month until 65:</p>
              <dl className="figures mt-5">
                <Figure label="Starting at 22" value={formatMoney(early.balance)} highlight />
                <Figure label="Starting at 32" value={formatMoney(late.balance)} />
              </dl>
              <p className="mt-5 border-t pt-5 text-sm leading-relaxed text-muted-foreground">
                Ten extra years puts in {formatMoney(early.contributed - late.contributed)} more but ends up{" "}
                {formatMoney(early.balance - late.balance)} ahead. That&apos;s compound growth doing the work.
              </p>
            </div>
            <div className="flex flex-col rounded-2xl border bg-card p-6 shadow-xs sm:p-7">
              <p className="eyebrow">Fees you never notice</p>
              <p className="mt-3 text-sm text-muted-foreground">$300 a month for 40 years in a fund charging:</p>
              <dl className="figures mt-5">
                <Figure label="0.05% a year" value={formatMoney(lowFee.balance)} highlight />
                <Figure label="1% a year" value={formatMoney(highFee.balance)} />
              </dl>
              <p className="mt-5 border-t pt-5 text-sm leading-relaxed text-muted-foreground">
                A fee that sounds tiny costs {formatMoney(lowFee.balance - highFee.balance)} by the end. Sprout shows you what
                yours cost.
              </p>
            </div>
            <div className="flex flex-col rounded-2xl border bg-card p-6 shadow-xs sm:p-7">
              <p className="eyebrow">Debt first</p>
              <p className="mt-3 text-sm text-muted-foreground">A credit card at 24% a year:</p>
              <p className="display figures mt-5 text-[1.75rem] text-primary">A guaranteed 24%</p>
              <p className="mt-5 border-t pt-5 text-sm leading-relaxed text-muted-foreground">
                Every dollar you pay off saves 24% a year in interest, a return no investment can promise. That&apos;s why
                Sprout&apos;s roadmap clears expensive debt before investing.
              </p>
            </div>
          </div>
          <p className="mt-6 max-w-3xl text-xs leading-relaxed text-muted-foreground">
            Calculated with Sprout&apos;s own tested calculators, assuming a {RETURN}% average yearly return with monthly
            contributions. Returns aren&apos;t guaranteed and real markets go up and down along the way.
          </p>
        </div>
      </section>

      {/* What Sprout does: each mistake beside its answer, as editorial rows */}
      <section className={`mx-auto max-w-6xl ${SECTION_SPACE}`} aria-labelledby="does-title">
        <SectionIntro
          eyebrow="What Sprout does about it"
          title="A tool for each mistake that costs young investors the most."
          titleId="does-title"
        />
        <ul className="mt-12 border-t sm:mt-14">
          {answerCards.map((item) => (
            <li
              key={item.problem}
              className="grid gap-x-10 gap-y-4 border-b py-8 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:py-10"
            >
              <div className="flex items-start gap-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                  <item.icon className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">The mistake</p>
                  <h3 className="display mt-1 text-2xl">{item.problem}</h3>
                </div>
              </div>
              <div className="md:pt-5">
                <p className="text-base leading-relaxed text-muted-foreground">{item.answer}</p>
                <Link href={item.href} className={`${ARROW_LINK} mt-2`}>
                  {item.cta}
                  <ArrowRightIcon
                    className="size-4 transition-transform duration-(--duration-fast) ease-out group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Comparison */}
      <section className="band" aria-labelledby="compare-title">
        <div className={`mx-auto max-w-6xl ${SECTION_SPACE}`}>
          <SectionIntro
            eyebrow="How it's different"
            title="Where young investors usually learn, and where Sprout fits."
            titleId="compare-title"
          />
          <div className="mt-12 overflow-x-auto rounded-2xl border bg-card shadow-sm">
            <table className="w-full table-fixed text-sm sm:min-w-[34rem] sm:table-auto">
              <caption className="sr-only">Sprout compared with social media and general-purpose chatbots</caption>
              <thead className="text-[0.6875rem] leading-snug text-muted-foreground sm:text-xs">
                <tr className="border-b">
                  <th scope="col" className="w-[34%] px-3 py-4 text-left font-medium sm:w-auto sm:px-5">
                    <span className="sr-only">Feature</span>
                  </th>
                  <th scope="col" className="w-[22%] px-1.5 py-4 font-medium hyphens-auto sm:px-4">Social media &amp; finfluencers</th>
                  <th scope="col" className="w-[22%] px-1.5 py-4 font-medium hyphens-auto sm:px-4">General AI chatbots</th>
                  <th scope="col" className="w-[22%] bg-secondary/60 px-1.5 py-4 font-heading text-sm font-semibold text-primary sm:px-4 sm:text-base">
                    Sprout
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row) => (
                  <tr key={row.label} className="border-b last:border-0">
                    <th scope="row" className="px-3 py-4 text-left font-medium sm:px-5">
                      {row.label}
                    </th>
                    <td className="px-1.5 py-4 text-center sm:px-4"><Mark value={row.feed} /></td>
                    <td className="px-1.5 py-4 text-center sm:px-4"><Mark value={row.generic} /></td>
                    <td className="bg-secondary/60 px-2 py-4 text-center sm:px-4"><Mark value={row.sprout} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Promises */}
      <section className={`mx-auto max-w-6xl ${SECTION_SPACE}`} aria-labelledby="promises-title">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <SectionIntro eyebrow="Our promises" title="Built to be trusted with your first dollars." titleId="promises-title">
              Money advice is only useful if you can trust where it comes from. These are the rules Sprout is built on, and
              they&apos;re enforced in code and checked by an automated test suite of more than 40 tricky scenarios, from
              &ldquo;just tell me yes or no on this stock&rdquo; to scam messages and panicky crash-day questions.
            </SectionIntro>
            <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
              <FlaskConicalIcon className="size-4 text-primary" aria-hidden="true" />
              Every calculation has unit tests behind it.
            </p>
          </div>
          <ul className="divide-y rounded-2xl border bg-card shadow-xs">
            {promises(features).map((promise) => (
              <li key={promise.title} className="flex gap-4 p-5 sm:p-7">
                <ShieldCheckIcon className="mt-1 size-5 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <h3 className="text-lg font-semibold">{promise.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground sm:text-[0.9375rem]">{promise.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* CTA: no top padding, since the promises above are on the same white background. */}
      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 sm:pb-20 lg:pb-28" aria-labelledby="about-start-title">
        <ClosingPanel
          titleId="about-start-title"
          title="Start with five minutes."
          body="Take the risk quiz and add a few numbers. You'll get your roadmap, your next step, and a coach that already knows your situation."
          primary={{ href: "/plan", label: "Build my plan" }}
          secondary={{ href: "/assistant", label: "Ask a question" }}
        />
      </section>

      {/* The FAQ lives on /faq; this block at the bottom points to it (product decision). */}
      <FaqPointer features={features} />
    </main>
  )
}
