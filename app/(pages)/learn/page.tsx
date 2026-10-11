import type { Metadata } from "next"
import { BookOpenIcon, ClockIcon, LayersIcon, ListChecksIcon } from "lucide-react"

import { CourseOutline, CourseProgressCard } from "@/components/course/course-progress"
import { Glossary } from "@/components/glossary"
import { COURSE_TAGLINE, COURSE_TITLE, courseOutline, LESSONS, MODULES, TOTAL_MINUTES } from "@/lib/learn/course"

export const metadata: Metadata = {
  title: "Learn",
  description: `${COURSE_TITLE}: ${COURSE_TAGLINE}`,
}

const OUTCOMES = [
  "Decide when you're ready to invest, and what to sort out first",
  "Explain stocks, bonds, index funds and ETFs in your own words",
  "Choose an account, a brokerage and a simple low-cost portfolio",
  "Handle market drops, spot scams, and avoid costly mistakes",
]

export default function LearnPage() {
  const outline = courseOutline()
  const quizQuestions = LESSONS.reduce((sum, lesson) => sum + lesson.quiz.length, 0)

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="space-y-6">
          <div className="space-y-3">
            <p className="eyebrow">Free course · Young investors</p>
            <h1 className="text-4xl font-semibold sm:text-5xl">{COURSE_TITLE}</h1>
            <p className="max-w-2xl text-lg text-muted-foreground">
              {COURSE_TAGLINE} Short lessons, worked examples, calculators you can play with, and a quick quiz at
              the end of each one.
            </p>
          </div>

          <dl className="figures grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { icon: LayersIcon, label: "Modules", value: MODULES.length },
              { icon: BookOpenIcon, label: "Lessons", value: LESSONS.length },
              { icon: ListChecksIcon, label: "Quiz questions", value: quizQuestions },
              { icon: ClockIcon, label: "Total time", value: `${Math.round(TOTAL_MINUTES / 60 * 10) / 10} hrs` },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl border bg-card px-3.5 py-3">
                <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <stat.icon className="size-3.5 text-primary" aria-hidden="true" />
                  {stat.label}
                </dt>
                <dd className="mt-0.5 font-heading text-2xl font-semibold">{stat.value}</dd>
              </div>
            ))}
          </dl>

          <div className="max-w-2xl">
            <h2 className="font-sans text-sm font-semibold">By the end, you&apos;ll be able to</h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {OUTCOMES.map((outcome) => (
                <li key={outcome} className="flex gap-2 text-sm text-foreground/90">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
                  {outcome}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="lg:sticky lg:top-24">
          <CourseProgressCard modules={outline} />
        </div>
      </div>

      <section aria-labelledby="modules-title" className="mt-16">
        <h2 id="modules-title" className="sr-only">
          Modules
        </h2>
        <CourseOutline modules={outline} />
      </section>

      <p className="mt-6 max-w-3xl text-xs leading-relaxed text-muted-foreground">
        This course is general education, not personal financial advice. Account types and tax rules described are for
        the US unless noted, and limits change over time, so check current rules where you live.
      </p>

      <section aria-labelledby="glossary-title" className="mt-20 border-t pt-12">
        <div className="mb-6 max-w-2xl space-y-2">
          <p className="eyebrow">Glossary</p>
          <h2 id="glossary-title" className="text-3xl font-semibold">
            Terms, in plain English
          </h2>
        </div>
        <Glossary />
      </section>
    </main>
  )
}
