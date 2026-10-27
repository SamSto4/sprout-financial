"use client"

import { useState } from "react"
import { LoaderCircleIcon, LogOutIcon } from "lucide-react"

import { signOutAndClear } from "@/components/account-menu"
import { Button } from "@/components/ui/button"
import { signOutEverywhere, type SignOutEverywhereResult } from "@/lib/auth/session-actions"
import { PASSWORD_CHECK_CACHE_MS } from "@/lib/auth/session-version"

const CACHE_MINUTES = Math.round(PASSWORD_CHECK_CACHE_MS / 60_000)

/**
 * The Account page's "Sign out everywhere": ends every session (lib/auth/session-actions.ts), then
 * signs this browser out the usual way, clearing its copy of the data first.
 */
export function SignOutEverywhere() {
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setPending(true)
    setError(null)
    const result = await signOutEverywhere().catch(
      (): SignOutEverywhereResult => ({ ok: false, error: "Couldn't reach Sprout. Check your connection and try again." })
    )
    if (!result.ok) {
      setError(result.error)
      setPending(false)
      return
    }
    // Every session has ended on the server; this ends this browser's and goes to the login page.
    signOutAndClear("/login?signedout=everywhere")
  }

  if (!confirming) {
    return (
      <Button type="button" variant="outline" onClick={() => setConfirming(true)}>
        <LogOutIcon aria-hidden="true" />
        Sign out everywhere
      </Button>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        You&apos;ll be signed out on every device, including this one, and need to log in again. Other devices may take
        up to {CACHE_MINUTES === 1 ? "a minute" : `${CACHE_MINUTES} minutes`} to be signed out; anything already saved in
        their browsers stays there until it&apos;s cleared. Everything in your account stays, and this browser&apos;s
        copy is cleared, as when you sign out.
      </p>
      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-[#a33b3b]">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => void confirm()} disabled={pending} className="disabled:opacity-100" aria-busy={pending} autoFocus>
          {pending ? <LoaderCircleIcon className="animate-spin" aria-hidden="true" /> : <LogOutIcon aria-hidden="true" />}
          {pending ? "Signing out everywhere…" : "Yes, sign out everywhere"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            setConfirming(false)
            setError(null)
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}
