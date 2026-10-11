import Link from "next/link"
import {
  ArrowRightIcon,
  BookOpenIcon,
  CalculatorIcon,
  LineChartIcon,
  MessageSquareTextIcon,
  ShieldCheckIcon,
} from "lucide-react"

import { CompoundCalculator } from "@/components/compound-calculator"
import { DoublingCard } from "@/components/doubling-card"
import { Button } from "@/components/ui/button"

const pillars = [
  {
    icon: BookOpenIcon,
    title: "Learn step by step",
    body: "Short lessons from budgeting basics to investing, in the order that builds on itself.",
    href: "/learn",
    cta: "See the learning path",
  },
  {
    icon: MessageSquareTextIcon,
    title: "Ask anything",
    body: "An AI tutor that explains in plain English, shows the maths and asks before it assumes.",
    href: "/assistant",
    cta: "Open the assistant",
  },
  {
    icon: LineChartIcon,
    title: "Try it with numbers",
    body: "Budget planner, growth charts and market data, so ideas turn into something you can see.",
    href: "/dashboard",
    cta: "Go to the dashboard",
  },
]

const principles = [
  {
    icon: ShieldCheckIcon,
    title: "Education, not advice",
    body: "We explain options and tradeoffs. We never tell you what to buy or promise returns.",
  },
  {
    icon: CalculatorIcon,
    title: "Maths you can check",
    body: "Calculators run on tested code and show their formulas and assumptions.",
  },
  {
    icon: LineChartIcon,
    title: "Sourced market data",
    body: "Live figures come from Financial Modeling Prep, with the time they were recorded.",
  },
]

const starterQuestions = [
  "How do I build my first budget?",
  "What's the difference between APR and APY?",
  "Should I pay off debt or save first?",
]

export default function HomePage() {
  return (
    <main>
      {/* Hero */}
      <section className="border-b bg-surface">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-center lg:gap-16">
          <div className="animate-rise space-y-6">
            <p className="eyebrow">Financial literacy, made practical</p>
            <h1 className="text-4xl leading-[1.08] font-semibold sm:text-5xl lg:text-6xl">
              Understand your money, <span className="text-primary italic">one clear idea</span> at a
              time.
            </h1>
            <p className="max-w-xl text-lg text-muted-foreground">
              Learn how budgeting, saving, debt and investing really work. Ask questions in plain
              English and see the numbers for yourself.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button render={<Link href="/learn" />} nativeButton={false} className="h-11 px-5 text-base">
                Start learning
                <ArrowRightIcon />
              </Button>
              <Button
                render={<Link href="/assistant" />}
                nativeButton={false}
                variant="outline"
                className="h-11 px-5 text-base"
              >
                Ask the assistant
              </Button>
            </div>
          </div>
          <div className="animate-rise [animation-delay:120ms]">
            <DoublingCard />
          </div>
        </div>
      </section>

      {/* Three ways in */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20" aria-labelledby="ways-title">
        <div className="max-w-2xl space-y-2">
          <p className="eyebrow">How it works</p>
          <h2 id="ways-title" className="text-3xl font-semibold">
            Three ways to build confidence
          </h2>
        </div>
        <ol className="mt-10 grid gap-5 md:grid-cols-3">
          {pillars.map((pillar, index) => (
            <li key={pillar.title}>
              <Link
                href={pillar.href}
                className="group flex h-full flex-col rounded-xl border bg-card p-6 transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-brand/50 hover:shadow-[0_8px_24px_-12px_rgb(24_53_42/0.18)]"
              >
                <div className="flex items-center justify-between">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-secondary text-primary">
                    <pillar.icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="figures font-heading text-sm text-muted-foreground">
                    0{index + 1}
                  </span>
                </div>
                <h3 className="mt-5 text-lg font-semibold">{pillar.title}</h3>
                <p className="mt-2 flex-1 text-sm text-muted-foreground">{pillar.body}</p>
                <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                  {pillar.cta}
                  <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      {/* Calculator */}
      <section className="border-y bg-surface" aria-labelledby="calc-title">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="mb-10 max-w-2xl space-y-2">
            <p className="eyebrow">Try it</p>
            <h2 id="calc-title" className="text-3xl font-semibold">
              Small amounts, given time, add up
            </h2>
            <p className="text-muted-foreground">
              Move the sliders to see how much of a long-term balance comes from growth rather than
              deposits.
            </p>
          </div>
          <CompoundCalculator />
        </div>
      </section>

      {/* Principles + starter questions */}
      <section className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-2">
        <div className="space-y-8">
          <div className="space-y-2">
            <p className="eyebrow">Our approach</p>
            <h2 className="text-3xl font-semibold">Built to be trusted</h2>
          </div>
          <ul className="space-y-6">
            {principles.map((item) => (
              <li key={item.title} className="flex gap-4">
                <item.icon className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden="true" />
                <div>
                  <h3 className="font-sans text-base font-semibold tracking-normal">{item.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border bg-card p-6 sm:p-8">
          <h2 className="text-2xl font-semibold">Not sure where to start?</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Pick a question and the assistant will walk you through it.
          </p>
          <ul className="mt-6 space-y-2">
            {starterQuestions.map((question) => (
              <li key={question}>
                <Link
                  href={`/assistant?q=${encodeURIComponent(question)}`}
                  className="group flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm transition-colors hover:border-brand/50 hover:bg-surface"
                >
                  {question}
                  <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  )
}
