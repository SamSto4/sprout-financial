import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeftIcon, ArrowRightIcon, ClockIcon, MessageSquareTextIcon } from "lucide-react"
import { cn } from "cn"

import { CourseOutline, LessonCompleteButton } from "@/components/course/course-progress"
import { LessonBody, RichText } from "@/components/course/lesson-body"
import { LessonQuiz } from "@/components/course/lesson-quiz"
import { buttonVariants } from "@/components/ui/button"
import { COURSE_TITLE, courseOutline, getLesson, lessonNeighbors, LESSONS } from "@/lib/learn/course"
import { GLOSSARY } from "@/lib/learn/glossary"

// Only the lessons in the course exist; anything else is a 404.
export const dynamicParams = false

export function generateStaticParams() {
  return LESSONS.map((lesson) => ({ lesson: lesson.slug }))
}

export async function generateMetadata({ params }: PageProps<"/learn/[lesson]">): Promise<Metadata> {
  const lesson = getLesson((await params).lesson)
  return lesson ? { title: `${lesson.title} · ${COURSE_TITLE}`, description: lesson.summary } : {}
}

export default async function LessonPage({ params }: PageProps<"/learn/[lesson]">) {
  const lesson = getLesson((await params).lesson)
  if (!lesson) notFound()

  const outline = courseOutline()
  const { previous, next } = lessonNeighbors(lesson.slug)
  const terms = GLOSSARY.filter((entry) => lesson.keyTerms.includes(entry.term))

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="grid gap-10 lg:grid-cols-[15rem_minmax(0,1fr)] xl:gap-14">
        <aside className="hidden lg:block">
          <div className="sticky top-24 max-h-[calc(100svh-8rem)] overflow-y-auto pr-2">
            <Link href="/learn" className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
              <ArrowLeftIcon className="size-4" aria-hidden="true" />
              {COURSE_TITLE}
            </Link>
            <CourseOutline modules={outline} currentSlug={lesson.slug} variant="compact" />
          </div>
        </aside>

        <article className="min-w-0 max-w-3xl">
          <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
            <ol className="flex flex-wrap items-center gap-1.5">
              <li>
                <Link href="/learn" className="hover:text-primary hover:underline">
                  {COURSE_TITLE}
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li>
                Module {lesson.moduleIndex + 1}: {lesson.module.title}
              </li>
            </ol>
          </nav>

          <details className="mt-4 rounded-xl border bg-card px-4 py-3 lg:hidden">
            <summary className="cursor-pointer text-sm font-medium marker:text-primary">Course outline</summary>
            <div className="mt-4">
              <CourseOutline modules={outline} currentSlug={lesson.slug} variant="compact" />
            </div>
          </details>

          <header className="mt-6 space-y-3 border-b pb-8">
            <p className="figures flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-medium text-primary">
                Lesson {lesson.number} of {LESSONS.length}
              </span>
              <span aria-hidden="true">·</span>
              <ClockIcon className="size-3.5" aria-hidden="true" />
              {lesson.minutes} min read
            </p>
            <h1 className="text-4xl font-semibold sm:text-5xl">{lesson.title}</h1>
            <p className="text-lg leading-relaxed text-muted-foreground">{lesson.summary}</p>
          </header>

          <div className="mt-10">
            <LessonBody sections={lesson.sections} />
          </div>

          <section aria-labelledby="takeaways-title" className="mt-12 rounded-2xl bg-primary p-6 text-primary-foreground sm:p-7">
            <h2 id="takeaways-title" className="text-xl font-semibold">
              Key takeaways
            </h2>
            <ul className="mt-4 space-y-2.5">
              {lesson.takeaways.map((takeaway) => (
                <li key={takeaway} className="flex gap-3 leading-relaxed">
                  <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-primary-foreground/70" aria-hidden="true" />
                  {takeaway}
                </li>
              ))}
            </ul>
          </section>

          {terms.length > 0 && (
            <section aria-labelledby="terms-title" className="mt-8">
              <h2 id="terms-title" className="font-sans text-sm font-semibold">
                Key terms
              </h2>
              <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                {terms.map((entry) => (
                  <div key={entry.term} className="rounded-xl border bg-card px-4 py-3">
                    <dt className="font-medium">{entry.term}</dt>
                    <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      <RichText text={entry.definition} />
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <div className="mt-12">
            <LessonQuiz slug={lesson.slug} questions={lesson.quiz} />
          </div>

          <div className="mt-8 flex flex-col gap-4 rounded-2xl border border-dashed p-5 sm:flex-row sm:items-center sm:justify-between">
            <LessonCompleteButton slug={lesson.slug} />
            <Link
              href={`/assistant?q=${encodeURIComponent(lesson.askPrompt)}`}
              className={cn(buttonVariants({ variant: "outline" }), "h-9")}
            >
              <MessageSquareTextIcon />
              Ask the assistant about this
            </Link>
          </div>

          <nav aria-label="Lesson navigation" className="mt-10 grid gap-3 border-t pt-8 sm:grid-cols-2">
            {previous ? (
              <Link href={`/learn/${previous.slug}`} className="group rounded-xl border bg-card px-4 py-3 transition-colors hover:border-brand/60">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ArrowLeftIcon className="size-3.5" aria-hidden="true" />
                  Previous
                </span>
                <span className="mt-0.5 block font-medium group-hover:text-primary">{previous.title}</span>
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link
                href={`/learn/${next.slug}`}
                className="group rounded-xl border bg-card px-4 py-3 text-right transition-colors hover:border-brand/60"
              >
                <span className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
                  Next{next.moduleIndex !== lesson.moduleIndex && `: Module ${next.moduleIndex + 1}`}
                  <ArrowRightIcon className="size-3.5" aria-hidden="true" />
                </span>
                <span className="mt-0.5 block font-medium group-hover:text-primary">{next.title}</span>
              </Link>
            ) : (
              <Link
                href="/learn"
                className="group rounded-xl border border-brand bg-secondary px-4 py-3 text-right transition-colors"
              >
                <span className="text-xs text-muted-foreground">You reached the end</span>
                <span className="mt-0.5 block font-medium text-primary">Back to the course overview</span>
              </Link>
            )}
          </nav>
        </article>
      </div>
    </main>
  )
}
