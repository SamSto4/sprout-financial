"use client"

import { useSyncExternalStore } from "react"
import { CircleCheckIcon } from "lucide-react"

import { recentlyDeletedHere, tabStorage } from "@/lib/auth/deleted-notice"

const noop = () => () => {}

/**
 * "Your account has been deleted", on /?account=deleted, only in the tab that just deleted one
 * (lib/auth/deleted-notice.ts). The address alone isn't enough, so a link can't make the site claim
 * someone's account is gone. Nothing shows on the server or before the browser takes over.
 */
export function DeletedNotice() {
  const show = useSyncExternalStore(
    noop,
    () => recentlyDeletedHere(tabStorage(), Date.now()),
    () => false
  )
  if (!show) return null
  return (
    <p
      role="status"
      className="flex items-start gap-3 rounded-xl border border-brand/40 bg-card px-4 py-3.5 text-sm text-foreground shadow-xs"
    >
      <CircleCheckIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
      Your account has been deleted, along with everything synced to it, and this browser&apos;s copy was cleared.
    </p>
  )
}
