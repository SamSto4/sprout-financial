// Keeps this browser's saved data (chats, course progress, imported finances, monthly budgets, the
// plan and portfolio) in step with the signed-in account. On sign-in the two sides are merged;
// after that, each local change is uploaded shortly after it happens. Local storage stays the
// working copy, so the app works the same signed in or out, and keeps working offline. The copy is
// tagged with its account (lib/sync/owner.ts), so a copy left by another account is dropped, not
// merged.

import { parseSavedChats } from "@/lib/chat/history"
import { mergeBudgets, parseSavedBudgets } from "@/lib/finance/budget-history"
import { parseImportedFinances } from "@/lib/finance/transactions"
import { EMPTY_PROGRESS, parseProgress } from "@/lib/learn/progress"
import { readStored, removeStored, writeStored } from "@/lib/local-store"
import { parseProfile } from "@/lib/plan/profile"
import { parsePortfolio } from "@/lib/portfolio/holdings"
import {
  budgetStore,
  chatsStore,
  clearFinances,
  copyClearedStore,
  financesKey,
  financesStore,
  memoryStore,
  portfolioStore,
  profileStore,
  progressRemovalsStore,
  progressStore,
  saveChats,
  sharePlanStore,
} from "@/lib/stores"
import { chatsToUpload, mergeChats, mergeFinances, mergeNewest, serverChatVersions } from "@/lib/sync/merge"
import { localCopyAction, sameOwnerMarker, SYNC_OWNER_KEY, syncOwner } from "@/lib/sync/owner"
import { mergeAccountProgress, sameProgress, type AccountProgress } from "@/lib/sync/progress-removals"
import { onSyncStop, signalSyncStop, uniqueToken } from "@/lib/sync/stop-signal"
import { SyncLimited, syncResponseError, SyncSignedOut } from "@/lib/sync/sync-errors"

/**
 * What the header shows about sync:
 * - "off": not signed in, or sync was stopped (sign-out, account deletion).
 * - "syncing" / "synced": loading the account or uploading a change, and done.
 * - "error": a load or upload failed; it's tried again on the next change, or after Retry-After
 *   when the account's sync allowance was used up (lib/sync/sync-errors.ts).
 * - "signed-out": the account load or an upload was answered 401, because this tab's session has
 *   ended (Sign out everywhere, a password reset or account deletion on another device, the 30-day
 *   cap). Sync has stopped, the browser's copy is cleared once the server confirms nobody is signed
 *   in (endSessionLocally), and components/providers.tsx asks Auth.js for the session again so the
 *   header catches up at once.
 */
export type SyncStatus = "off" | "syncing" | "synced" | "error" | "signed-out"

// A tiny in-memory store for the status, so the header can show it.
let status: SyncStatus = "off"
const statusListeners = new Set<() => void>()

function setStatus(next: SyncStatus) {
  status = next
  statusListeners.forEach((listener) => listener())
}

export const syncStatus = {
  get: () => status,
  getServer: (): SyncStatus => "off",
  subscribe(listener: () => void) {
    statusListeners.add(listener)
    return () => statusListeners.delete(listener)
  },
}

async function send(url: string, method: "PUT" | "DELETE", body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const error = syncResponseError(response, `${method} ${url}`)
  if (error) throw error
}

/** Thrown by an upload attempted after sync was stopped; not an error worth reporting. */
class SyncStopped extends Error {}

let active: { email: string; stop: () => void } | null = null

export function startSync(email: string) {
  if (active?.email === email) return
  stopSync()

  // A copy left by another account (its session ended without Sign out) is dropped without
  // uploading, so it isn't merged into this one. Other tabs may still be syncing that account, so
  // they're stopped first. A copy that was never synced is this visitor's own and is merged.
  if (localCopyAction(readStored(SYNC_OWNER_KEY), email) === "discard") {
    signalSyncStop()
    clearLocalCopy()
  }
  writeStored(SYNC_OWNER_KEY, syncOwner(email, uniqueToken()))

  let stopped = false
  // Another tab is about to clear this browser's copy (sign-out, account deletion): stop before
  // its clearing reaches this tab's subscriptions, or it would be uploaded as deletions.
  const unsubscribers: (() => void)[] = [onSyncStop(() => stopSync())]
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  // What the server holds, so only real changes are uploaded.
  const serverChats = new Map<string, string>()
  let serverProgress: AccountProgress | null = null
  let serverFinances = ""
  let serverProfile = ""
  let serverPortfolio = ""
  let serverBudget = ""
  let queue = Promise.resolve()

  // Uploads go through here, so stopping (sign-out, account deletion) also halts a batch that's
  // already running instead of letting its remaining requests go out.
  async function upload(url: string, method: "PUT" | "DELETE", body?: unknown) {
    if (stopped) throw new SyncStopped()
    await send(url, method, body)
  }

  async function pushChats() {
    const chats = chatsStore.get()
    for (const chat of chatsToUpload(chats, serverChats)) {
      await upload(`/api/account/chats/${encodeURIComponent(chat.id)}`, "PUT", chat)
      serverChats.set(chat.id, chat.updatedAt)
    }
    const kept = new Set(chats.map((chat) => chat.id))
    for (const id of [...serverChats.keys()]) {
      if (kept.has(id)) continue
      await upload(`/api/account/chats/${encodeURIComponent(id)}`, "DELETE")
      serverChats.delete(id)
    }
  }

  // Never uploads what the browser alone has lost: emptied storage reads as no progress, so the
  // account's copy is kept apart from the person's own removals (lib/sync/progress-removals.ts).
  // The result isn't written back here, so an account another tab just signed out of doesn't
  // reappear on this device; the next page load merges it in.
  async function pushProgress() {
    const knownAt = Date.now()
    const progress = mergeAccountProgress(progressStore.get(), serverProgress, progressRemovalsStore.get())
    if (serverProgress && sameProgress(progress, serverProgress.progress)) return
    await upload("/api/account/data/progress", "PUT", progress)
    serverProgress = { progress, knownAt }
  }

  async function pushFinances() {
    const finances = financesStore.get()
    const key = finances ? financesKey(finances) : ""
    if (key === serverFinances) return
    if (finances) await upload("/api/account/data/finances", "PUT", finances)
    else await upload("/api/account/data/finances", "DELETE")
    serverFinances = key
  }

  /** The plan and portfolio: uploaded whenever their saved version changes. */
  function pushVersioned(key: "profile" | "portfolio") {
    return async () => {
      const value = key === "profile" ? profileStore.get() : portfolioStore.get()
      const version = value?.updatedAt ?? ""
      if (version === (key === "profile" ? serverProfile : serverPortfolio)) return
      if (value) await upload(`/api/account/data/${key}`, "PUT", value)
      else await upload(`/api/account/data/${key}`, "DELETE")
      if (key === "profile") serverProfile = version
      else serverPortfolio = version
    }
  }
  async function pushBudget() {
    const budget = budgetStore.get()
    // Compared by content: a merge can add months while keeping the server's timestamp.
    const version = budget ? JSON.stringify(budget) : ""
    if (version === serverBudget) return
    if (budget) await upload("/api/account/data/budget", "PUT", budget)
    else await upload("/api/account/data/budget", "DELETE")
    serverBudget = version
  }

  const pushProfile = pushVersioned("profile")
  const pushPortfolio = pushVersioned("portfolio")

  /** Runs uploads one at a time, shortly after the last change (or once a rate limit has passed). */
  function schedule(name: string, task: () => Promise<void>, delayMs = 800) {
    clearTimeout(timers.get(name))
    timers.set(
      name,
      setTimeout(() => {
        queue = queue
          .then(async () => {
            if (stopped) return
            setStatus("syncing")
            await task()
            if (!stopped) setStatus("synced")
          })
          .catch((error: unknown) => {
            if (stopped || error instanceof SyncStopped) return
            if (error instanceof SyncSignedOut) return signedOut()
            console.error("Sync failed:", error instanceof Error ? error.message : error)
            setStatus("error")
            // Nothing is lost: each upload compares against what the server holds, so retrying
            // later sends whatever is still different.
            if (error instanceof SyncLimited) schedule(name, task, error.retryInMs)
          })
      }, delayMs)
    )
  }

  async function initialSync() {
    setStatus("syncing")
    const requestedAt = Date.now()
    const response = await fetch("/api/account", { cache: "no-store" })
    const failed = syncResponseError(response, "Loading account data")
    if (failed) throw failed
    const remote = (await response.json()) as Record<string, unknown>
    if (stopped) return

    const remoteChats = parseSavedChats(remote.chats)
    saveChats(mergeChats(chatsStore.get(), remoteChats))
    // Also the chats a long account left out of the response that this browser holds, so an older
    // copy here isn't uploaded over a newer one there (lib/sync/merge.ts).
    for (const [id, version] of serverChatVersions(remoteChats, remote.chatVersions, chatsStore.get())) {
      serverChats.set(id, version)
    }

    const remoteProgress = remote.progress ? parseProgress(remote.progress) : null
    // Dated from the request, so a lesson marked not done while it was in flight stays not done.
    serverProgress = remoteProgress ? { progress: remoteProgress, knownAt: requestedAt } : null
    progressStore.set(mergeAccountProgress(progressStore.get(), serverProgress, progressRemovalsStore.get()))

    const remoteFinances = parseImportedFinances(remote.finances)
    serverFinances = remoteFinances ? financesKey(remoteFinances) : ""
    const finances = mergeFinances(financesStore.get(), remoteFinances)
    if (finances !== financesStore.get()) financesStore.set(finances)

    const remoteProfile = parseProfile(remote.profile)
    serverProfile = remoteProfile?.updatedAt ?? ""
    const profile = mergeNewest(profileStore.get(), remoteProfile)
    if (profile !== profileStore.get()) profileStore.set(profile)

    const remotePortfolio = parsePortfolio(remote.portfolio)
    serverPortfolio = remotePortfolio?.updatedAt ?? ""
    const portfolio = mergeNewest(portfolioStore.get(), remotePortfolio)
    if (portfolio !== portfolioStore.get()) portfolioStore.set(portfolio)

    const remoteBudget = parseSavedBudgets(remote.budget)
    serverBudget = remoteBudget ? JSON.stringify(remoteBudget) : ""
    const budget = mergeBudgets(budgetStore.get(), remoteBudget)
    if (budget !== budgetStore.get()) budgetStore.set(budget)

    await pushChats()
    await pushProgress()
    await pushFinances()
    await pushBudget()
    await pushProfile()
    await pushPortfolio()
    if (stopped) return
    setStatus("synced")

    unsubscribers.push(
      chatsStore.subscribe(() => schedule("chats", pushChats)),
      progressStore.subscribe(() => schedule("progress", pushProgress)),
      financesStore.subscribe(() => schedule("finances", pushFinances)),
      profileStore.subscribe(() => schedule("profile", pushProfile)),
      portfolioStore.subscribe(() => schedule("portfolio", pushPortfolio)),
      budgetStore.subscribe(() => schedule("budget", pushBudget))
    )
  }

  function runInitialSync() {
    initialSync().catch((error: unknown) => {
      if (stopped || error instanceof SyncStopped) return
      if (error instanceof SyncSignedOut) return signedOut()
      console.error("Sync failed:", error instanceof Error ? error.message : error)
      setStatus("error")
      // Merging is safe to repeat, so after a rate limit the whole first sync simply runs again.
      if (error instanceof SyncLimited) timers.set("initial", setTimeout(runInitialSync, error.retryInMs))
    })
  }

  // The session ended elsewhere: no upload can succeed, so stop rather than say "will retry", and
  // clear this browser's copy if the server confirms nobody is signed in (endSessionLocally). What
  // was typed since the session ended can't reach the account either way.
  function signedOut() {
    stopSync()
    setStatus("signed-out")
    void endSessionLocally()
  }

  runInitialSync()

  active = {
    email,
    stop() {
      stopped = true
      unsubscribers.forEach((unsubscribe) => unsubscribe())
      timers.forEach((timer) => clearTimeout(timer))
    },
  }
}

export function stopSync() {
  active?.stop()
  active = null
  setStatus("off")
}

/** needsCode: the account has two-step verification on and the code was missing or wrong. */
export type DeleteAccountResult = { ok: true } | { ok: false; error: string; needsCode?: boolean }

/**
 * Deletes the signed-in account on the server, then this browser's copy. Syncing stops first, so
 * nothing is uploaded while the account is being deleted; if deletion fails (a wrong two-step
 * code, say), it starts again and nothing is cleared. The caller signs out afterwards.
 * `code` is needed when the account has two-step verification on.
 */
export async function deleteAccount(email: string, confirm: string, code?: string): Promise<DeleteAccountResult> {
  stopSync()
  let response: Response
  try {
    response = await fetch("/api/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(code ? { confirm, code: code.trim().slice(0, 64) } : { confirm }),
    })
  } catch {
    startSync(email)
    return { ok: false, error: "Couldn't reach Sprout. Check your connection and try again." }
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: unknown; needsCode?: unknown } | null
    startSync(email)
    return {
      ok: false,
      error: typeof body?.error === "string" ? body.error : "Couldn't delete your account. Please try again.",
      ...(body?.needsCode === true ? { needsCode: true } : {}),
    }
  }
  clearLocalAccountData()
  return { ok: true }
}

/**
 * Removes this account's data from the browser on sign-out, so the next person on this device
 * doesn't see it. Syncing is stopped first, in every tab, or the clearing would be uploaded as
 * deletions.
 */
export function clearLocalAccountData() {
  signalSyncStop()
  stopSync()
  clearLocalCopy()
}

/**
 * For when the session is reported gone without Sign out (the 30-day cap, a password reset or
 * account deletion on another device, an expired cookie): clears the account's copy from this
 * browser. Auth.js also reports a network error as signed out, so this asks the server itself and
 * clears only when it answers that nobody is signed in, and only a copy that belongs to an account.
 */
export async function endSessionLocally() {
  const owner = readStored(SYNC_OWNER_KEY)
  if (owner === null) return
  let session: unknown
  try {
    const response = await fetch("/api/auth/session", { cache: "no-store" })
    if (!response.ok) return
    session = await response.json()
  } catch {
    return
  }
  // A sync started meanwhile, in this tab or another (it writes a new marker): the copy is in use.
  if (session !== null || active !== null || !sameOwnerMarker(owner, readStored(SYNC_OWNER_KEY))) return
  signalSyncStop()
  clearLocalCopy()
}

/**
 * Empties this browser's copy of the account's data, puts the sharing switches back to their
 * defaults and forgets whose it was. Doesn't stop sync.
 * The clear marker changes first, so pages that hold some of the data in memory (the Assistant's
 * open conversation) drop it instead of saving it back once the stores are empty.
 */
function clearLocalCopy() {
  copyClearedStore.set(uniqueToken())
  saveChats([])
  progressStore.set(EMPTY_PROGRESS)
  progressRemovalsStore.set(null)
  clearFinances()
  profileStore.set(null)
  portfolioStore.set(null)
  budgetStore.set(null)
  // The switches for what the assistant sees aren't synced, but they're the last person's choices:
  // left on, the next person's plan would go to the assistant before they chose to share it.
  sharePlanStore.set(false)
  memoryStore.set(true)
  removeStored(SYNC_OWNER_KEY)
}
