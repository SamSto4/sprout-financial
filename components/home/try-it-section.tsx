import Link from "next/link"
import { ArrowRightIcon } from "lucide-react"

import { CompoundCalculator } from "@/components/compound-calculator"

const STARTER_QUESTIONS = [
  "How do I build my first budget?",
  "What's the difference between APR and APY?",
  "Should I pay off debt or save first?",
]

/**
 * The compound growth calculator and a few starter questions. The assistant's prompt tells people
 * the home page has this calculator (COURSE_PROMPT in lib/ai/system-prompt.ts), so both versions
 * of the home page keep it.
 */
export function TryItSection({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <section id="try-it" className="scroll-mt-16" aria-labelledby="try-title">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="mb-10 max-w-2xl space-y-2">
          <p className="eyebrow">Try it now</p>
          <h2 id="try-title" className="text-3xl font-semibold">
            Small amounts, given time, add up
          </h2>
          <p className="text-muted-foreground">
            Move the sliders to see how much of a long-term balance comes from growth rather than deposits.
            {signedIn ? "" : " No account needed."}
          </p>
        </div>
        <CompoundCalculator />
        <div className="mt-12">
          <h3 className="text-xl font-semibold">Or ask the assistant</h3>
          <p className="mt-1 text-sm text-muted-foreground">Pick a question and it will walk you through it.</p>
          <ul className="mt-4 grid gap-2 md:grid-cols-3">
            {STARTER_QUESTIONS.map((question) => (
              <li key={question}>
                <Link
                  href={`/assistant?q=${encodeURIComponent(question)}`}
                  className="group flex h-full min-h-12 items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 text-sm transition-colors hover:border-brand/50 hover:bg-surface"
                >
                  {question}
                  <ArrowRightIcon
                    className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
