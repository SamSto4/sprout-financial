// Keeps this browser's saved data (chats, course progress, imported finances) in step with the
// signed-in account. On sign-in the two sides are merged; after that, each local change is
// uploaded shortly after it happens. Local storage stays the working copy, so the app works the
// same signed in or out, and keeps working offline.

import { parseSavedChats } from "@/lib/chat/history"
import { mergeBudgets, parseSavedBudgets } from "@/lib/finance/budget-history"
import { parseImportedFinances } from "@/lib/finance/transactions"
import { EMPTY_PROGRESS, parseProgress } from "@/lib/learn/progress"
import { parseProfile } from "@/lib/plan/profile"
import { parsePortfolio } from "@/lib/portfolio/holdings"
import {
  budgetStore,
  chatsStore,
  clearFinances,
  financesKey,
  financesStore,
  portfolioStore,
  profileStore,
  progressStore,
  saveChats,
} from "@/lib/stores"
import { chatsToUpload, mergeChats, mergeFinances, mergeNewest, mergeProgress } from "@/lib/sync/merge"

export type SyncStatus = "off" | "syncing" | "synced" | "error"

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
  if (response.status === 429) throw new SyncLimited(response.headers.get("Retry-After"))
  if (!response.ok) throw new Error(`${method} ${url} failed with ${response.status}`)
}

/** The account's sync allowance is used up for now (lib/rate-limit/limits.ts, accountSync). */
class SyncLimited extends Error {
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

/** Thrown by an upload attempted after sync was stopped; not an error worth reporting. */
class SyncStopped extends Error {}

let active: { email: string; stop: () => void } | null = null

export function startSync(email: string) {
  if (active?.email === email) return
  stopSync()

  let stopped = false
  const unsubscribers: (() => void)[] = []
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  // What the server holds, so only real changes are uploaded.
  const serverChats = new Map<string, string>()
  let serverProgress = ""
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

  async function pushProgress() {
    const progress = JSON.stringify(progressStore.get())
    if (progress === serverProgress) return
    await upload("/api/account/data/progress", "PUT", progressStore.get())
    serverProgress = progress
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
    const response = await fetch("/api/account", { cache: "no-store" })
    if (response.status === 429) throw new SyncLimited(response.headers.get("Retry-After"))
    if (!response.ok) throw new Error(`Loading account data failed with ${response.status}`)
    const remote = (await response.json()) as Record<string, unknown>
    if (stopped) return

    const remoteChats = parseSavedChats(remote.chats)
    for (const chat of remoteChats) serverChats.set(chat.id, chat.updatedAt)
    saveChats(mergeChats(chatsStore.get(), remoteChats))

    const remoteProgress = remote.progress ? parseProgress(remote.progress) : null
    serverProgress = remoteProgress ? JSON.stringify(remoteProgress) : ""
    progressStore.set(mergeProgress(progressStore.get(), remoteProgress))

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
      console.error("Sync failed:", error instanceof Error ? error.message : error)
      setStatus("error")
      // Merging is safe to repeat, so after a rate limit the whole first sync simply runs again.
      if (error instanceof SyncLimited) timers.set("initial", setTimeout(runInitialSync, error.retryInMs))
    })
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

export type DeleteAccountResult = { ok: true } | { ok: false; error: string }

/**
 * Deletes the signed-in account on the server, then this browser's copy. Syncing stops first, so
 * nothing is uploaded while the account is being deleted; if deletion fails, it starts again.
 * The caller signs out afterwards.
 */
export async function deleteAccount(email: string, confirm: string): Promise<DeleteAccountResult> {
  stopSync()
  let response: Response
  try {
    response = await fetch("/api/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm }),
    })
  } catch {
    startSync(email)
    return { ok: false, error: "Couldn't reach Sprout. Check your connection and try again." }
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: unknown } | null
    startSync(email)
    return { ok: false, error: typeof body?.error === "string" ? body.error : "Couldn't delete your account. Please try again." }
  }
  clearLocalAccountData()
  return { ok: true }
}

/**
 * Removes this account's data from the browser on sign-out, so the next person on this device
 * doesn't see it. Syncing is stopped first, or the clearing would be uploaded as deletions.
 */
export function clearLocalAccountData() {
  stopSync()
  saveChats([])
  progressStore.set(EMPTY_PROGRESS)
  clearFinances()
  profileStore.set(null)
  portfolioStore.set(null)
  budgetStore.set(null)
}
