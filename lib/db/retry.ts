// Kept free of framework imports so it can be unit-tested with `node --test`.

/**
 * Runs `task` once and shares its result with every caller. A failure is reported to `onError`
 * and then remembered for `coolDownMs`: callers carry on at once instead of waiting, and the task
 * runs again only on the first call after that. Without the pause, a lasting failure (an index
 * whose options changed, a database user without the createIndex privilege) would rerun the whole
 * task, and log it, on every database call.
 */
export function onceWithRetry<Args extends unknown[]>(
  task: (...args: Args) => Promise<unknown>,
  { coolDownMs, onError, now = Date.now }: { coolDownMs: number; onError: (error: unknown) => void; now?: () => number }
): (...args: Args) => Promise<void> {
  let current: Promise<void> | null = null
  let failedAt: number | null = null
  return (...args) => {
    if (failedAt !== null && now() - failedAt >= coolDownMs) {
      current = null
      failedAt = null
    }
    current ??= task(...args).then(
      () => undefined,
      (error: unknown) => {
        failedAt = now()
        onError(error)
      }
    )
    return current
  }
}
