// Course progress syncs as one whole value, so an upload replaces the account's copy. Storage can
// be emptied under an open tab (another tab clears it, the browser clears site data, the value
// can't be read), and the tab would then upload empty progress over the account's. So uploads add
// this browser's progress to the account's copy, and only the person's own removals ("Reset
// progress", "Mark as not done", recorded with when they happened) take anything away from it.
// Kept free of framework imports so it can be unit-tested with `node --test`.

import type { CourseProgress } from "../learn/progress.ts"
import { mergeProgress } from "./merge.ts"

/** What the person took away from their progress, with when (ms since 1970, this device's clock). */
export type ProgressRemovals = {
  /** The last "Reset progress", or 0 for never. */
  resetAt: number
  /** Lessons marked as not done, by slug. */
  notDone: Record<string, number>
}

/** The account's progress as this tab last saw it: read when the page loaded, or uploaded since. */
export type AccountProgress = { progress: CourseProgress; knownAt: number }

const SLUG_PATTERN = /^[a-z0-9-]{1,80}$/
// Real entries are one per lesson; the cap only bounds a tampered value.
const MAX_NOT_DONE = 200

const isTime = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0

export function parseProgressRemovals(raw: unknown): ProgressRemovals | null {
  if (typeof raw !== "object" || raw === null) return null
  const { resetAt, notDone } = raw as Record<string, unknown>
  const cleanNotDone: Record<string, number> = {}
  if (typeof notDone === "object" && notDone !== null) {
    for (const [slug, at] of Object.entries(notDone).slice(0, MAX_NOT_DONE)) {
      if (SLUG_PATTERN.test(slug) && isTime(at)) cleanNotDone[slug] = at
    }
  }
  return { resetAt: isTime(resetAt) ? resetAt : 0, notDone: cleanNotDone }
}

/** "Reset progress": everything the account held until now goes. Earlier un-completions are covered by it. */
export function recordReset(now: number): ProgressRemovals {
  return { resetAt: now, notDone: {} }
}

export function recordNotDone(removals: ProgressRemovals | null, slug: string, now: number): ProgressRemovals {
  return { resetAt: removals?.resetAt ?? 0, notDone: { ...removals?.notDone, [slug]: now } }
}

/**
 * The progress this browser should hold and upload: its own, plus the account's copy minus what
 * the person removed since that copy was read. A removal made before the copy was read is
 * already reflected in it (or was undone elsewhere afterwards), so it's left alone. With no copy
 * (the account has no progress yet), this browser's progress is used as it is.
 */
export function mergeAccountProgress(
  local: CourseProgress,
  account: AccountProgress | null,
  removals: ProgressRemovals | null
): CourseProgress {
  if (!account) return local
  if (removals && removals.resetAt >= account.knownAt) return local
  const removedSince = (slug: string) => (removals?.notDone[slug] ?? -1) >= account.knownAt
  const kept = { ...account.progress, completed: account.progress.completed.filter((slug) => !removedSince(slug)) }
  return mergeProgress(local, kept)
}

/** Same lessons and scores, in any order. */
export function sameProgress(a: CourseProgress, b: CourseProgress): boolean {
  const canonical = (progress: CourseProgress) =>
    JSON.stringify([[...progress.completed].sort(), Object.entries(progress.quizScores).sort(([x], [y]) => x.localeCompare(y))])
  return canonical(a) === canonical(b)
}
