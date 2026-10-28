// Tells every other tab to stop syncing before this one clears the account's data from the
// browser. Each tab runs its own sync, and each sync also reacts to changes other tabs make, so
// without this a second tab would upload the clearing as deletions while the session is still
// valid (sign-out takes two round trips). Browsers deliver storage events in the order the writes
// happened, so the other tabs stop before they see any cleared value.
// Relative imports only, so `node --test` can load it.

import { removeStored, writeStored } from "../local-store.ts"

export const SYNC_STOP_KEY = "sprout-sync-stop"

let counter = 0

/** A value that differs on every call (not a secret). */
export function uniqueToken(): string {
  counter += 1
  return `${Date.now().toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Call before clearing anything. The other tabs' `onSyncStop` callbacks run before they see the clearing. */
export function signalSyncStop() {
  // A new value each time: writing the same value again fires no storage event. If storage is full
  // the write fails; removing the key still reaches the other tabs when an earlier signal left it.
  if (!writeStored(SYNC_STOP_KEY, uniqueToken())) removeStored(SYNC_STOP_KEY)
}

/** Calls `callback` when another tab signals a stop. Returns the unsubscribe function. */
export function onSyncStop(callback: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === SYNC_STOP_KEY) callback()
  }
  window.addEventListener("storage", onStorage)
  return () => window.removeEventListener("storage", onStorage)
}
