import Link from "next/link"
import { ArrowRightIcon, MessageSquareTextIcon } from "lucide-react"
import { cn } from "cn"

import { CompoundCalculator } from "@/components/compound-calculator"
import { SECTION_SPACE, SectionIntro } from "@/components/home/section-intro"

export const STARTER_QUESTIONS = [
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
      <div className={cn("mx-auto max-w-6xl", SECTION_SPACE)}>
        <SectionIntro eyebrow="Try it now" title="Small amounts, given time, add up" titleId="try-title" className="mb-10 sm:mb-12">
          Move the sliders to see how much of a long-term balance comes from growth rather than deposits.
          {signedIn ? "" : " No account needed."}
        </SectionIntro>
        <CompoundCalculator />
        <div className="mt-12 grid gap-5 sm:mt-16 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:items-center lg:gap-10">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
              <MessageSquareTextIcon className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-xl font-semibold">Or ask the assistant</h3>
              <p className="mt-1 text-sm text-muted-foreground">Pick a question and it will walk you through it.</p>
            </div>
          </div>
          <ul className="grid gap-2 md:grid-cols-3">
            {STARTER_QUESTIONS.map((question) => (
              <li key={question}>
                <Link
                  href={`/assistant?q=${encodeURIComponent(question)}`}
                  className="group lift flex h-full min-h-12 items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 text-sm shadow-xs"
                >
                  {question}
                  <ArrowRightIcon
                    className="size-4 shrink-0 text-muted-foreground transition-transform duration-(--duration-fast) ease-out group-hover:translate-x-0.5 group-hover:text-primary"
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
