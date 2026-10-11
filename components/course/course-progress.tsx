"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRightIcon, CheckIcon, CircleIcon, CirclePlayIcon } from "lucide-react"
import { cn } from "cn"

import { Button, buttonVariants } from "@/components/ui/button"
import type { OutlineModule } from "@/lib/learn/course"
import { EMPTY_PROGRESS, nextUnfinished, setLessonComplete } from "@/lib/learn/progress"
import { progressStore } from "@/lib/stores"
import { useStoredValue } from "@/lib/use-stored-value"

function allLessons(modules: OutlineModule[]) {
  return modules.flatMap((module) => module.lessons)
}

/** Progress bar plus a "start / continue" button for the course overview. */
export function CourseProgressCard({ modules }: { modules: OutlineModule[] }) {
  const progress = useStoredValue(progressStore)
  const [confirmReset, setConfirmReset] = useState(false)
  const lessons = allLessons(modules)
  const done = lessons.filter((lesson) => progress.completed.includes(lesson.slug)).length
  const percent = Math.round((done / lessons.length) * 100)
  const nextSlug = nextUnfinished(progress, lessons.map((lesson) => lesson.slug))
  const next = lessons.find((lesson) => lesson.slug === nextSlug)

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-[0_1px_2px_rgb(24_53_42/0.04),0_12px_32px_-16px_rgb(24_53_42/0.18)] sm:p-6">
      <p className="eyebrow">Your progress</p>
      <p className="figures mt-2 flex items-baseline gap-2">
        <span className="font-heading text-4xl font-semibold text-primary">{percent}%</span>
        <span className="text-sm text-muted-foreground">
          {done} of {lessons.length} lessons complete
        </span>
      </p>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Course progress"
        aria-valuemin={0}
        aria-valuemax={lessons.length}
        aria-valuenow={done}
      >
        <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${percent}%` }} />
      </div>

      <Link
        href={`/learn/${next?.slug ?? lessons[0].slug}`}
        className={cn(buttonVariants({ size: "lg" }), "mt-5 h-auto w-full justify-between px-4 py-2.5 text-left")}
      >
        <span className="min-w-0">
          <span className="block text-xs font-normal opacity-80">
            {done === 0 ? "Start the course" : next ? `Continue with lesson ${next.number}` : "Course complete. Review it"}
          </span>
          <span className="block truncate">{(next ?? lessons[0]).title}</span>
        </span>
        <ArrowRightIcon className="size-4" />
      </Link>

      {done > 0 &&
        (confirmReset ? (
          <div className="mt-3 flex items-center justify-between gap-2 text-xs">
            <span>Clear all progress and quiz scores?</span>
            <span className="flex gap-1">
              <Button
                size="xs"
                variant="destructive"
                onClick={() => {
                  progressStore.set(EMPTY_PROGRESS)
                  setConfirmReset(false)
                }}
              >
                Reset
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setConfirmReset(false)}>
                Cancel
              </Button>
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            className="mt-3 text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            Reset progress
          </button>
        ))}
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">Progress is saved in this browser only.</p>
    </div>
  )
}

/** Every module and lesson, with completion marks. "full" for the overview, "compact" beside a lesson. */
export function CourseOutline({
  modules,
  currentSlug,
  variant = "full",
}: {
  modules: OutlineModule[]
  currentSlug?: string
  variant?: "full" | "compact"
}) {
  const progress = useStoredValue(progressStore)
  const done = new Set(progress.completed)

  if (variant === "compact") {
    return (
      <nav aria-label="Course outline" className="space-y-5 text-sm">
        {modules.map((module, moduleIndex) => (
          <div key={module.id}>
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
              {moduleIndex + 1}. {module.title}
            </p>
            <ul className="space-y-0.5">
              {module.lessons.map((lesson) => {
                const current = lesson.slug === currentSlug
                const isDone = done.has(lesson.slug)
                return (
                  <li key={lesson.slug}>
                    <Link
                      href={`/learn/${lesson.slug}`}
                      aria-current={current ? "page" : undefined}
                      className={cn(
                        "flex items-start gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-surface",
                        current && "bg-secondary font-medium text-primary hover:bg-secondary"
                      )}
                    >
                      <LessonMark done={isDone} current={current} />
                      <span className="min-w-0 leading-snug">{lesson.title}</span>
                      {isDone && <span className="sr-only">(complete)</span>}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
    )
  }

  return (
    <ol className="space-y-5">
      {modules.map((module, moduleIndex) => {
        const moduleDone = module.lessons.filter((lesson) => done.has(lesson.slug)).length
        const minutes = module.lessons.reduce((sum, lesson) => sum + lesson.minutes, 0)
        return (
          <li
            key={module.id}
            className="overflow-hidden rounded-2xl border bg-card shadow-[0_1px_2px_rgb(24_53_42/0.04)]"
          >
            <div className="flex flex-col gap-3 border-b bg-surface px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
              <div className="flex gap-4">
                <span
                  className={cn(
                    "figures flex size-10 shrink-0 items-center justify-center rounded-xl font-heading text-lg font-semibold",
                    moduleDone === module.lessons.length ? "bg-primary text-primary-foreground" : "bg-secondary text-primary"
                  )}
                  aria-hidden="true"
                >
                  {moduleDone === module.lessons.length ? <CheckIcon className="size-5" /> : moduleIndex + 1}
                </span>
                <div>
                  <p className="eyebrow">Module {moduleIndex + 1}</p>
                  <h3 className="text-xl font-semibold">{module.title}</h3>
                  <p className="mt-1 max-w-xl text-sm text-muted-foreground">{module.description}</p>
                </div>
              </div>
              <p className="figures shrink-0 text-xs text-muted-foreground sm:pt-1 sm:text-right">
                {moduleDone}/{module.lessons.length} done · {minutes} min
              </p>
            </div>
            <ul className="divide-y">
              {module.lessons.map((lesson) => {
                const isDone = done.has(lesson.slug)
                const best = progress.quizScores[lesson.slug]
                return (
                  <li key={lesson.slug}>
                    <Link
                      href={`/learn/${lesson.slug}`}
                      className="group flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface sm:px-6"
                    >
                      <LessonMark done={isDone} />
                      <span className="figures w-6 shrink-0 text-sm text-muted-foreground">{lesson.number}</span>
                      <span className="min-w-0 flex-1 font-medium group-hover:text-primary">
                        {lesson.title}
                        {isDone && <span className="sr-only"> (complete)</span>}
                      </span>
                      {best !== undefined && (
                        <span
                          className={cn(
                            "figures hidden rounded-md px-2 py-0.5 text-xs font-medium sm:inline",
                            best === lesson.quizLength ? "bg-secondary text-primary" : "bg-muted text-muted-foreground"
                          )}
                        >
                          Quiz {best}/{lesson.quizLength}
                        </span>
                      )}
                      <span className="figures shrink-0 text-xs text-muted-foreground">{lesson.minutes} min</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </li>
        )
      })}
    </ol>
  )
}

function LessonMark({ done, current = false }: { done: boolean; current?: boolean }) {
  if (done) {
    return (
      <span className="mt-px flex size-4.5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground" aria-hidden="true">
        <CheckIcon className="size-3" strokeWidth={3} />
      </span>
    )
  }
  const Icon = current ? CirclePlayIcon : CircleIcon
  return <Icon className={cn("mt-px size-4.5 shrink-0", current ? "text-primary" : "text-border")} aria-hidden="true" />
}

/** Mark-complete toggle at the end of a lesson. */
export function LessonCompleteButton({ slug }: { slug: string }) {
  const progress = useStoredValue(progressStore)
  const done = progress.completed.includes(slug)

  return done ? (
    <div className="flex flex-wrap items-center gap-3">
      <span className="inline-flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-sm font-medium text-primary">
        <CheckIcon className="size-4" aria-hidden="true" />
        Lesson complete
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => progressStore.set(setLessonComplete(progressStore.get(), slug, false))}
      >
        Mark as not done
      </Button>
    </div>
  ) : (
    <Button type="button" size="lg" onClick={() => progressStore.set(setLessonComplete(progressStore.get(), slug, true))}>
      <CheckIcon />
      Mark lesson complete
    </Button>
  )
}
