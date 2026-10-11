"use client"

import { useSyncExternalStore } from "react"

import type { StoredValue } from "@/lib/local-store"

/** Reads a shared stored value. Renders the fallback on the server and during hydration. */
export function useStoredValue<T>(store: StoredValue<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.getServer)
}

const noop = () => () => {}

/** False on the server and during hydration, true once the browser has taken over. */
export function useHydrated() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false
  )
}
