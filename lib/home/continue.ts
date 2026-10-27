// "Pick up where you left off" on the signed-in home page: one card each for the course, the plan,
// the assistant and the dashboard, worked out from what's saved in the browser (and synced).
// Kept free of framework imports so it can be unit-tested with `node --test`. Lessons are passed
// in (slug, title and number only) so the course text never reaches the browser bundle.

import type { SavedChat } from "../chat/history.ts"
import { formatNumber } from "../format.ts"
import type { CourseProgress } from "../learn/progress.ts"
import { hasProfile, type InvestorProfile } from "../plan/profile.ts"
import { buildRoadmap } from "../plan/roadmap.ts"

export type LessonRef = { slug: string; title: string; number: number }

export type ContinueState = {
  progress: Pick<CourseProgress, "completed">
  profile: InvestorProfile | null
  chats: readonly Pick<SavedChat, "id" | "title" | "updatedAt">[]
  finances: { transactions: readonly unknown[] } | null
}

export type ContinueCard = {
  id: "course" | "plan" | "assistant" | "dashboard"
  /** Short label above the title, e.g. "Course". */
  label: string
  title: string
  detail: string
  href: string
  cta: string
}

function plural(count: number, one: string, many: string) {
  return `${formatNumber(count)} ${count === 1 ? one : many}`
}

function courseCard(completed: readonly string[], lessons: readonly LessonRef[]): ContinueCard {
  const base = { id: "course" as const, label: "Course" }
  const first = lessons[0]
  if (!first) {
    return { ...base, title: "Browse the course", detail: "Short lessons with quick quizzes.", href: "/learn", cta: "See the course" }
  }
  // Only lessons that still exist count, so a retired lesson's slug can't inflate the total.
  const done = lessons.filter((lesson) => completed.includes(lesson.slug)).length
  // The first unfinished lesson in course order, like nextUnfinished in lib/learn/progress.ts.
  const next = lessons.find((lesson) => !completed.includes(lesson.slug))
  if (done === 0) {
    return {
      ...base,
      title: "Start the course",
      detail: `${lessons.length} short lessons. First up: ${first.title}`,
      href: `/learn/${first.slug}`,
      cta: "Start lesson 1",
    }
  }
  if (!next) {
    return { ...base, title: "Course complete", detail: "Revisit any lesson or retake a quiz.", href: "/learn", cta: "Review the course" }
  }
  return {
    ...base,
    title: `Lesson ${next.number}: ${next.title}`,
    detail: `${done} of ${lessons.length} lessons done`,
    href: `/learn/${next.slug}`,
    cta: "Continue",
  }
}

function planCard(profile: InvestorProfile | null): ContinueCard {
  const base = { id: "plan" as const, label: "My plan", href: "/plan" }
  if (!hasProfile(profile)) {
    return {
      ...base,
      title: "Make your plan",
      detail: "A short risk quiz and a few numbers give you a step-by-step roadmap.",
      cta: "Build my plan",
    }
  }
  const roadmap = buildRoadmap(profile)
  if (!roadmap.current) {
    return { ...base, title: "Every roadmap step is done", detail: "Update your plan when your situation changes.", cta: "Open my plan" }
  }
  const position = roadmap.steps.indexOf(roadmap.current) + 1
  return {
    ...base,
    title: roadmap.current.title,
    detail: `Step ${position} of ${roadmap.steps.length} on your roadmap`,
    cta: "Open my plan",
  }
}

function assistantCard(chats: ContinueState["chats"]): ContinueCard {
  const base = { id: "assistant" as const, label: "Assistant" }
  // Saved chats are usually newest first, but don't rely on it (sync merges them).
  const latest = chats.reduce<ContinueState["chats"][number] | null>(
    (best, chat) => (!best || chat.updatedAt > best.updatedAt ? chat : best),
    null
  )
  if (!latest) {
    return {
      ...base,
      title: "Ask your first question",
      detail: "Plain-English answers, with the numbers worked out by real calculators.",
      href: "/assistant",
      cta: "Open the assistant",
    }
  }
  return {
    ...base,
    title: "Pick up a conversation",
    detail: `${plural(chats.length, "saved chat", "saved chats")}. Latest: ${latest.title}`,
    // The assistant opens a saved chat named this way (chatIdFromParam in lib/chat/history.ts).
    href: `/assistant?chat=${encodeURIComponent(latest.id)}`,
    cta: "Open the latest chat",
  }
}

function dashboardCard(finances: ContinueState["finances"]): ContinueCard {
  const base = { id: "dashboard" as const, label: "Dashboard", href: "/dashboard" }
  const count = finances?.transactions.length ?? 0
  if (count === 0) {
    return {
      ...base,
      // The budget planner comes first on the Dashboard; the import is further down, in #your-finances.
      href: "/dashboard#your-finances",
      title: "See where your money goes",
      detail: "Import a bank CSV or screenshots to see spending by category.",
      cta: "Import transactions",
    }
  }
  return { ...base, title: "Your spending", detail: plural(count, "imported transaction", "imported transactions"), cta: "Open the dashboard" }
}

/** The four cards, always in this order: course, plan, assistant, dashboard. */
export function continueCards(state: ContinueState, lessons: readonly LessonRef[]): ContinueCard[] {
  return [courseCard(state.progress.completed, lessons), planCard(state.profile), assistantCard(state.chats), dashboardCard(state.finances)]
}
