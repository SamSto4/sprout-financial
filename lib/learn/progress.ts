// Course progress kept in the browser: finished lessons and best quiz scores.
// Kept free of framework imports so it can be unit-tested with `node --test`.

export type CourseProgress = {
  completed: string[]
  /** Best number of correct answers per lesson slug. */
  quizScores: Record<string, number>
}

export const PROGRESS_KEY = "sprout-course-progress"
export const EMPTY_PROGRESS: CourseProgress = { completed: [], quizScores: {} }

const SLUG_PATTERN = /^[a-z0-9-]{1,80}$/

/**
 * Reads stored progress. With validSlugs, only lessons that still exist are kept; without it,
 * any well-formed slug is (so the browser store doesn't need to load the whole course).
 */
export function parseProgress(raw: unknown, validSlugs?: readonly string[]): CourseProgress {
  if (typeof raw !== "object" || raw === null) return EMPTY_PROGRESS
  const allowed = validSlugs ? new Set(validSlugs) : null
  const valid = { has: (slug: string) => (allowed ? allowed.has(slug) : SLUG_PATTERN.test(slug)) }
  const { completed, quizScores } = raw as Record<string, unknown>

  const cleanCompleted = Array.isArray(completed)
    ? [...new Set(completed.filter((slug): slug is string => typeof slug === "string" && valid.has(slug)))]
    : []

  const cleanScores: Record<string, number> = {}
  if (typeof quizScores === "object" && quizScores !== null) {
    for (const [slug, score] of Object.entries(quizScores)) {
      if (valid.has(slug) && typeof score === "number" && Number.isInteger(score) && score >= 0 && score <= 20) {
        cleanScores[slug] = score
      }
    }
  }
  return { completed: cleanCompleted, quizScores: cleanScores }
}

export function setLessonComplete(progress: CourseProgress, slug: string, done: boolean): CourseProgress {
  const without = progress.completed.filter((existing) => existing !== slug)
  return { ...progress, completed: done ? [...without, slug] : without }
}

/** Keeps the best score, so retaking a quiz never lowers it. */
export function recordQuizScore(progress: CourseProgress, slug: string, score: number): CourseProgress {
  const best = Math.max(score, progress.quizScores[slug] ?? 0)
  return { ...progress, quizScores: { ...progress.quizScores, [slug]: best } }
}

/** The first unfinished lesson in course order, or null when everything is done. */
export function nextUnfinished(progress: CourseProgress, slugs: readonly string[]): string | null {
  const done = new Set(progress.completed)
  return slugs.find((slug) => !done.has(slug)) ?? null
}

/**
 * A stable shuffled order for quiz options, so the right answer isn't always in the same
 * position. Seeded by a string so server and browser render the same order.
 */
export function shuffledOrder(seed: string, count: number): number[] {
  let state = 2166136261
  for (let i = 0; i < seed.length; i++) {
    state ^= seed.charCodeAt(i)
    state = Math.imul(state, 16777619) >>> 0
  }
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 2 ** 32
  }
  const order = Array.from({ length: count }, (_, index) => index)
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order
}
