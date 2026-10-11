import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRightIcon, CompassIcon, LightbulbIcon, TargetIcon } from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"

export const metadata: Metadata = { title: "About" }

const cards = [
  {
    icon: LightbulbIcon,
    title: "The Problem",
    summary: "Money skills are rarely taught.",
    details:
      "Most people never learn how to budget, save, invest or manage debt, and end up figuring it out through costly mistakes.",
  },
  {
    icon: TargetIcon,
    title: "The Mission",
    summary: "AI Powered Financial Literacy learning.",
    details:
      "We build an AI Assistance to chat with for improve knowledge on financial Literacy.",
  },
  {
    icon: CompassIcon,
    title: "How It Works",
    summary: "Learn, ask and track your progress.",
    details:
      "Work through lessons on the Learn page, ask the AI Assistant any money question, and follow your progress on the Dashboard.",
  },
]

export default function AboutPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <PageHeader
        eyebrow="About"
        title="Why we built this"
        description="Hover or focus a card to read more."
      />
      <ol className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
        {cards.map((card, index) => (
          <li key={card.title}>
            <HoverCard>
              <HoverCardTrigger
                delay={100}
                render={<div tabIndex={0} />}
                className="group flex h-full min-h-64 cursor-default flex-col rounded-xl border bg-card p-6 transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-brand/50 hover:shadow-[0_8px_24px_-12px_rgb(24_53_42/0.18)] focus-visible:border-brand"
              >
                <div className="flex items-center justify-between">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-secondary text-primary">
                    <card.icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="figures font-heading text-sm text-muted-foreground">0{index + 1}</span>
                </div>
                <h2 className="mt-auto pt-10 text-2xl font-semibold">{card.title}</h2>
                <p className="mt-2 text-muted-foreground">{card.summary}</p>
                {/* Touch screens can't hover, so show the detail inline on small screens. */}
                <p className="mt-3 border-t pt-3 text-sm md:hidden">{card.details}</p>
              </HoverCardTrigger>
              <HoverCardContent className="w-80 border-l-2 border-brand p-4 text-sm leading-relaxed">
                {card.details}
              </HoverCardContent>
            </HoverCard>
          </li>
        ))}
      </ol>

      <section className="mt-16 flex flex-col items-start justify-between gap-6 rounded-2xl border bg-surface p-6 sm:p-8 md:flex-row md:items-center">
        <div className="max-w-xl space-y-2">
          <h2 className="text-2xl font-semibold">Ready to start?</h2>
          <p className="text-muted-foreground">
            Begin with the first lesson, or bring your own question to the assistant.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button render={<Link href="/learn" />} nativeButton={false} className="h-11 px-5">
            Start learning
            <ArrowRightIcon />
          </Button>
          <Button render={<Link href="/assistant" />} nativeButton={false} variant="outline" className="h-11 bg-background px-5">
            Ask a question
          </Button>
        </div>
      </section>
    </main>
  )
}
