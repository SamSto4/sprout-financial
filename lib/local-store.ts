// Guarded localStorage access. Storage can be missing, blocked or full (private windows,
// cleared site data, quota), so every call is wrapped and callers treat saving as best-effort.

export function readStored(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/** Returns false when the value couldn't be saved. */
export function writeStored(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function removeStored(key: string) {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

export function isStorageAvailable() {
  try {
    const probe = "__sprout_probe__"
    window.localStorage.setItem(probe, "1")
    window.localStorage.removeItem(probe)
    return true
  } catch {
    return false
  }
}

/**
 * A value kept in localStorage that several components can share. Pair it with
 * useStoredValue: every component updates when it changes, including from other tabs.
 * If storage is blocked, the value still works for the current page visit.
 */
export function createStoredValue<T>(key: string, parse: (raw: unknown) => T, fallback: T) {
  let loaded = false
  let value = fallback
  let watching = false
  const listeners = new Set<() => void>()

  const load = () => {
    value = parse(readStored(key))
    loaded = true
  }

  // Another tab changed the value (or cleared site data): the next read loads it again. Watched
  // from the first use for as long as the page is open, not only while something is subscribed:
  // otherwise a read with nothing subscribed (account sync merging on sign-in, in a tab whose page
  // doesn't show that value) would get what this tab loaded earlier, even after another tab
  // cleared it or another account's data replaced it.
  const watch = () => {
    if (watching || typeof window === "undefined") return
    watching = true
    window.addEventListener("storage", (event: StorageEvent) => {
      if (event.key === key || event.key === null) loaded = false
    })
  }

  return {
    get(): T {
      watch()
      if (!loaded) load()
      return value
    },
    getServer(): T {
      return fallback
    },
    /** Returns false if the value couldn't be saved to storage (it's still used for this visit). */
    set(next: T): boolean {
      watch()
      value = next
      loaded = true
      let saved = true
      if (next === null || next === undefined) removeStored(key)
      else saved = writeStored(key, next)
      listeners.forEach((listener) => listener())
      return saved
    },
    subscribe(listener: () => void) {
      // Added before this subscriber's handler, so the value is marked stale before it's told.
      watch()
      listeners.add(listener)
      const onStorage = (event: StorageEvent) => {
        if (event.key !== key && event.key !== null) return
        listener()
      }
      window.addEventListener("storage", onStorage)
      return () => {
        listeners.delete(listener)
        window.removeEventListener("storage", onStorage)
      }
    },
  }
}

export type StoredValue<T> = ReturnType<typeof createStoredValue<T>>

let storageAvailable: boolean | undefined

/** Cached, so components can call it while rendering. */
export function storageWorks() {
  storageAvailable ??= isStorageAvailable()
  return storageAvailable
}
