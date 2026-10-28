// What a failed sync request means for the browser's sync (lib/sync/account-sync.ts). Kept free of
// framework imports so it can be unit-tested with `node --test`.
//
// - 401: the account's session has ended (Sign out everywhere, a password reset or account
//   deletion on another device, the 30-day cap). Retrying can never succeed, so sync stops and the
//   tab checks its session at once instead of showing "will retry" until it's next focused.
// - 429: the account's sync allowance is used up for now; wait out Retry-After and try again.
// - anything else: try again on the next change.

/** The session behind this tab is gone: every upload would be refused. */
export class SyncSignedOut extends Error {
  constructor() {
    super("Sync stopped: this browser is no longer signed in")
  }
}

/** The account's sync allowance is used up for now (lib/rate-limit/limits.ts, accountSync). */
export class SyncLimited extends Error {
  readonly retryInMs: number
  constructor(retryAfter: string | null) {
    super("Sync paused: too many changes in a short time")
    // At least a few seconds, at most the length of the shortest window. A 429 without the header
    // (from a proxy or firewall, say) waits a minute.
    const parsed = retryAfter === null || retryAfter.trim() === "" ? NaN : Number(retryAfter)
    const seconds = Number.isFinite(parsed) ? parsed : 60
    this.retryInMs = Math.min(Math.max(seconds, 5), 600) * 1000
  }
}

type ResponseLike = { ok: boolean; status: number; headers: { get(name: string): string | null } }

/** The error a sync response stands for, or null when it succeeded. `what` names the request in the message. */
export function syncResponseError(response: ResponseLike, what: string): Error | null {
  if (response.ok) return null
  if (response.status === 401) return new SyncSignedOut()
  if (response.status === 429) return new SyncLimited(response.headers.get("Retry-After"))
  return new Error(`${what} failed with ${response.status}`)
}
