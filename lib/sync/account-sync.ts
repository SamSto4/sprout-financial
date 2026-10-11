// Keeps this browser's saved data (chats, course progress, imported finances) in step with the
// signed-in account. On sign-in the two sides are merged; after that, each local change is
// uploaded shortly after it happens. Local storage stays the working copy, so the app works the
// same signed in or out, and keeps working offline.

import { parseSavedChats } from "@/lib/chat/history"
import { parseImportedFinances } from "@/lib/finance/transactions"
import { EMPTY_PROGRESS, parseProgress } from "@/lib/learn/progress"
import {
  chatsStore,
  clearFinances,
  financesKey,
  financesStore,
  progressStore,
  saveChats,
} from "@/lib/stores"
import { chatsToUpload, mergeChats, mergeFinances, mergeProgress } from "@/lib/sync/merge"

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
  if (!response.ok) throw new Error(`${method} ${url} failed with ${response.status}`)
}

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
  let queue = Promise.resolve()

  async function pushChats() {
    const chats = chatsStore.get()
    for (const chat of chatsToUpload(chats, serverChats)) {
      await send(`/api/account/chats/${encodeURIComponent(chat.id)}`, "PUT", chat)
      serverChats.set(chat.id, chat.updatedAt)
    }
    const kept = new Set(chats.map((chat) => chat.id))
    for (const id of [...serverChats.keys()]) {
      if (kept.has(id)) continue
      await send(`/api/account/chats/${encodeURIComponent(id)}`, "DELETE")
      serverChats.delete(id)
    }
  }

  async function pushProgress() {
    const progress = JSON.stringify(progressStore.get())
    if (progress === serverProgress) return
    await send("/api/account/data/progress", "PUT", progressStore.get())
    serverProgress = progress
  }

  async function pushFinances() {
    const finances = financesStore.get()
    const key = finances ? financesKey(finances) : ""
    if (key === serverFinances) return
    if (finances) await send("/api/account/data/finances", "PUT", finances)
    else await send("/api/account/data/finances", "DELETE")
    serverFinances = key
  }

  /** Runs uploads one at a time, shortly after the last change. */
  function schedule(name: string, task: () => Promise<void>) {
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
            console.error("Sync failed:", error instanceof Error ? error.message : error)
            if (!stopped) setStatus("error")
          })
      }, 800)
    )
  }

  async function initialSync() {
    setStatus("syncing")
    const response = await fetch("/api/account", { cache: "no-store" })
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

    await pushChats()
    await pushProgress()
    await pushFinances()
    if (stopped) return
    setStatus("synced")

    unsubscribers.push(
      chatsStore.subscribe(() => schedule("chats", pushChats)),
      progressStore.subscribe(() => schedule("progress", pushProgress)),
      financesStore.subscribe(() => schedule("finances", pushFinances))
    )
  }

  initialSync().catch((error: unknown) => {
    console.error("Sync failed:", error instanceof Error ? error.message : error)
    if (!stopped) setStatus("error")
  })

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

/**
 * Removes this account's data from the browser on sign-out, so the next person on this device
 * doesn't see it. Syncing is stopped first, or the clearing would be uploaded as deletions.
 */
export function clearLocalAccountData() {
  stopSync()
  saveChats([])
  progressStore.set(EMPTY_PROGRESS)
  clearFinances()
}
