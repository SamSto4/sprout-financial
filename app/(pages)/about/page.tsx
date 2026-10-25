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

import { Button } from "@/components/ui/button"
import { projectGrowth } from "@/lib/finance/compound"
import { projectWithFee } from "@/lib/finance/fees"
import { formatMoney } from "@/lib/format"

export const metadata: Metadata = {
  title: "About",
  description:
    "Why Sprout exists: young people learn investing from feeds built for clicks. Sprout gives them a plan, honest math and a coach that knows their situation.",
}

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

const ANSWERS = [
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
  {
    icon: LineChartIcon,
    problem: "Panic-selling when markets fall",
    answer:
      "Markets, explained puts today's moves in context with live charts, the biggest drops along the way, and six major crashes since 1973 with how long each recovery took. Then it shows what a fall would mean for your money.",
    href: "/portfolio#markets",
    cta: "See the markets",
  },
  {
    icon: MessageSquareTextIcon,
    problem: "Advice that doesn't know you",
    answer:
      "The AI coach reads your plan and portfolio (only if you let it), so its guidance fits your goals, debts and timeline. Every number comes from tested calculators, never the model's own arithmetic.",
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
      "Twenty short lessons, from why invest at all to spotting scams, with quizzes, worked examples and a plain-English glossary. Start anywhere; the coach links you to the right lesson when it helps.",
    href: "/learn",
    cta: "Start learning",
  },
]

const PROMISES = [
  { title: "No stock picks, no hype", text: "Sprout teaches you how to decide. It never tells you to buy or sell a specific stock or coin, and never promises returns." },
  { title: "Nothing to sell you", text: "No ads, no commissions, no affiliate links. Sprout earns nothing from what you buy, so it has no reason to push you toward anything." },
  { title: "Math you can check", text: "Projections, fees and budgets come from open, tested code, with the assumptions stated, like the 7% yearly return on this page, which isn't guaranteed." },
  { title: "Your data, your call", text: "Your plan, portfolio and transactions stay in your browser unless you log in to sync them, and reach the AI only when you choose to share them." },
  { title: "Honest about limits", text: "Sprout is education, not a licensed advisor. For big or complicated decisions, it tells you to talk to a fee-only fiduciary or a tax professional." },
]

const COMPARISON = [
  { label: "Knows your goals, debts and timeline", feed: false, generic: false, sprout: true },
  { label: "Puts your safety net before investing", feed: false, generic: "sometimes", sprout: true },
  { label: "Numbers from tested calculators", feed: false, generic: false, sprout: true },
  { label: "Earns nothing from what you buy", feed: "rarely", generic: true, sprout: true },
  { label: "Checks a hot tip before you act on it", feed: false, generic: "sometimes", sprout: true },
] as const

const FAQ = [
  {
    q: "Is Sprout free?",
    a: "Yes. Everything on the site is free to use, with or without an account.",
  },
  {
    q: "Do I need an account?",
    a: "No. Everything works in your browser. An account (email or Google) keeps your plan, portfolio, budget, chats and course progress in sync across your devices.",
  },
  {
    q: "Will Sprout tell me what to buy?",
    a: "No. It explains strategies (like low-cost, diversified index funds and asset allocation ranges that fit your timeline) and helps you judge specific investments yourself. It never gives buy or sell calls.",
  },
  {
    q: "Is Sprout financial advice?",
    a: "No. Sprout is an educational tool and isn't a licensed financial advisor. For large sums, taxes, or complicated situations, talk to a qualified professional such as a fee-only fiduciary advisor.",
  },
  {
    q: "Can Sprout move my money or connect to my bank?",
    a: "No. Sprout can't place trades or move money. You can import a CSV export from your bank, and enter your holdings yourself. Never share account numbers or passwords with Sprout, or with anyone online.",
  },
  {
    q: "Where does market data come from?",
    a: "Prices and market history come from Financial Modeling Prep and may be delayed. Sprout shows when the data is from, and says so plainly when it's unavailable instead of guessing.",
  },
]

function Mark({ value }: { value: boolean | string }) {
  if (value === true) return <CheckIcon className="mx-auto size-4 text-primary" aria-label="Yes" />
  if (value === false) return <XIcon className="mx-auto size-4 text-muted-foreground/60" aria-label="No" />
  return <span className="text-xs text-muted-foreground">{value}</span>
}

export default function AboutPage() {
  return (
    <main>
      {/* Hero */}
      <section className="border-b bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <p className="eyebrow">About Sprout</p>
          <h1 className="mt-3 max-w-3xl text-4xl leading-tight font-semibold sm:text-5xl">
            The money mentor most young investors <span className="text-primary italic">never had</span>.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
            Most of us learn about money from feeds built to keep us scrolling, not to help us build wealth. Sprout gives you a
            plan for your situation, honest math, and a coach that helps you think before you act.
          </p>
          <div className="mt-8 flex flex-col gap-2 sm:flex-row">
            <Button render={<Link href="/plan" />} nativeButton={false} className="h-11 px-5">
              Build my plan
              <ArrowRightIcon />
            </Button>
            <Button render={<Link href="/learn" />} nativeButton={false} variant="outline" className="h-11 bg-background px-5">
              Start the course
            </Button>
          </div>
        </div>
      </section>

      {/* The problem */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20" aria-labelledby="problem-title">
        <div className="max-w-2xl space-y-3">
          <p className="eyebrow">The problem</p>
          <h2 id="problem-title" className="text-3xl font-semibold">
            Young people are investing. Mostly, they&apos;re figuring it out from their feeds.
          </h2>
          <p className="text-muted-foreground">
            Starting young is the biggest advantage an investor can have. But the loudest teachers online are rewarded for clicks,
            not results. The result: buying on hype, skipping the safety net, paying fees nobody explained, and selling in a
            panic when markets drop.
          </p>
        </div>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map((stat) => (
            <li key={stat.text} className="flex flex-col rounded-xl border bg-card p-5">
              <p className="figures font-heading text-4xl font-semibold text-primary">{stat.figure}</p>
              <p className="mt-2 flex-1 text-sm">{stat.text}</p>
              <a
                href={stat.source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Source: {stat.source.name}
              </a>
            </li>
          ))}
        </ul>
      </section>

      {/* Why it matters */}
      <section className="border-y bg-surface" aria-labelledby="matters-title">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="max-w-2xl space-y-3">
            <p className="eyebrow">Why it matters</p>
            <h2 id="matters-title" className="text-3xl font-semibold">
              Small decisions in your twenties turn into big numbers.
            </h2>
          </div>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            <div className="rounded-xl border bg-card p-6">
              <p className="text-sm font-medium text-muted-foreground">Starting early</p>
              <p className="mt-2 text-sm">Investing $200 a month until 65:</p>
              <dl className="figures mt-4 space-y-2">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-sm">Starting at 22</dt>
                  <dd className="font-heading text-2xl font-semibold text-primary">{formatMoney(early.balance)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-sm">Starting at 32</dt>
                  <dd className="font-heading text-2xl font-semibold">{formatMoney(late.balance)}</dd>
                </div>
              </dl>
              <p className="mt-4 text-sm text-muted-foreground">
                Ten extra years puts in {formatMoney(early.contributed - late.contributed)} more but ends up{" "}
                {formatMoney(early.balance - late.balance)} ahead. That&apos;s compound growth doing the work.
              </p>
            </div>
            <div className="rounded-xl border bg-card p-6">
              <p className="text-sm font-medium text-muted-foreground">Fees you never notice</p>
              <p className="mt-2 text-sm">$300 a month for 40 years in a fund charging:</p>
              <dl className="figures mt-4 space-y-2">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-sm">0.05% a year</dt>
                  <dd className="font-heading text-2xl font-semibold text-primary">{formatMoney(lowFee.balance)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-sm">1% a year</dt>
                  <dd className="font-heading text-2xl font-semibold">{formatMoney(highFee.balance)}</dd>
                </div>
              </dl>
              <p className="mt-4 text-sm text-muted-foreground">
                A fee that sounds tiny costs {formatMoney(lowFee.balance - highFee.balance)} by the end. Sprout shows you
                what yours cost.
              </p>
            </div>
            <div className="rounded-xl border bg-card p-6">
              <p className="text-sm font-medium text-muted-foreground">Debt first</p>
              <p className="mt-2 text-sm">A credit card at 24% a year:</p>
              <p className="figures mt-4 font-heading text-2xl font-semibold text-primary">A guaranteed 24%</p>
              <p className="mt-4 text-sm text-muted-foreground">
                Every dollar you pay off saves 24% a year in interest, a return no investment can promise. That&apos;s why
                Sprout&apos;s roadmap clears expensive debt before investing.
              </p>
            </div>
          </div>
          <p className="mt-5 text-xs text-muted-foreground">
            Calculated with Sprout&apos;s own tested calculators, assuming a {RETURN}% average yearly return with monthly
            contributions. Returns aren&apos;t guaranteed and real markets go up and down along the way.
          </p>
        </div>
      </section>

      {/* What Sprout does */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20" aria-labelledby="does-title">
        <div className="max-w-2xl space-y-3">
          <p className="eyebrow">What Sprout does about it</p>
          <h2 id="does-title" className="text-3xl font-semibold">
            A tool for each mistake that costs young investors the most.
          </h2>
        </div>
        <ul className="mt-10 grid gap-4 md:grid-cols-2">
          {ANSWERS.map((item, index) => (
            <li
              key={item.problem}
              className={`flex flex-col rounded-xl border bg-card p-6 ${index === ANSWERS.length - 1 && ANSWERS.length % 2 === 1 ? "md:col-span-2" : ""}`}
            >
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                  <item.icon className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">The mistake</p>
                  <h3 className="text-lg font-semibold">{item.problem}</h3>
                </div>
              </div>
              <p className="mt-4 flex-1 text-sm text-muted-foreground">{item.answer}</p>
              <Link
                href={item.href}
                className="group mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary"
              >
                {item.cta}
                <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Comparison */}
      <section className="border-y bg-surface" aria-labelledby="compare-title">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="max-w-2xl space-y-3">
            <p className="eyebrow">How it&apos;s different</p>
            <h2 id="compare-title" className="text-3xl font-semibold">
              Where young investors usually learn, and where Sprout fits.
            </h2>
          </div>
          <div className="mt-8 overflow-x-auto rounded-xl border bg-card">
            <table className="w-full min-w-[34rem] text-sm">
              <caption className="sr-only">Sprout compared with social media and general-purpose chatbots</caption>
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b">
                  <th scope="col" className="px-4 py-3 text-left font-medium">
                    <span className="sr-only">Feature</span>
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">Social media &amp; finfluencers</th>
                  <th scope="col" className="px-4 py-3 font-medium">General AI chatbots</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-primary">Sprout</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row) => (
                  <tr key={row.label} className="border-b last:border-0">
                    <th scope="row" className="px-4 py-3 text-left font-medium">
                      {row.label}
                    </th>
                    <td className="px-4 py-3 text-center"><Mark value={row.feed} /></td>
                    <td className="px-4 py-3 text-center"><Mark value={row.generic} /></td>
                    <td className="bg-secondary/40 px-4 py-3 text-center"><Mark value={row.sprout} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Promises */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20" aria-labelledby="promises-title">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="space-y-3">
            <p className="eyebrow">Our promises</p>
            <h2 id="promises-title" className="text-3xl font-semibold">
              Built to be trusted with your first dollars.
            </h2>
            <p className="text-muted-foreground">
              Money advice is only useful if you can trust where it comes from. These are the rules Sprout is built on, and
              they&apos;re enforced in code and checked by an automated test suite of more than 40 tricky scenarios, from
              &ldquo;just tell me yes or no on this stock&rdquo; to scam messages and panicky crash-day questions.
            </p>
            <p className="flex items-center gap-2 pt-2 text-sm text-muted-foreground">
              <FlaskConicalIcon className="size-4 text-primary" aria-hidden="true" />
              Every calculation has unit tests behind it.
            </p>
          </div>
          <ul className="space-y-3">
            {PROMISES.map((promise) => (
              <li key={promise.title} className="flex gap-3 rounded-xl border bg-card p-5">
                <ShieldCheckIcon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <h3 className="font-semibold">{promise.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{promise.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t bg-surface" aria-labelledby="faq-title">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
          <p className="eyebrow">Questions</p>
          <h2 id="faq-title" className="mt-2 text-3xl font-semibold">
            Good to know
          </h2>
          <div className="mt-8 divide-y rounded-xl border bg-card">
            {FAQ.map((item) => (
              <details key={item.q} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span className="text-xl leading-none text-muted-foreground transition-transform group-open:rotate-45" aria-hidden="true">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm text-muted-foreground">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="flex flex-col items-start justify-between gap-6 rounded-2xl border bg-card p-6 sm:p-10 md:flex-row md:items-center">
          <div className="max-w-xl space-y-2">
            <h2 className="text-2xl font-semibold sm:text-3xl">Start with five minutes.</h2>
            <p className="text-muted-foreground">
              Take the risk quiz and add a few numbers. You&apos;ll get your roadmap, your next step, and a coach that already
              knows your situation.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button render={<Link href="/plan" />} nativeButton={false} className="h-11 px-5">
              Build my plan
              <ArrowRightIcon />
            </Button>
            <Button render={<Link href="/assistant" />} nativeButton={false} variant="outline" className="h-11 bg-background px-5">
              Ask a question
            </Button>
          </div>
        </div>
      </section>
    </main>
  )
}
