"use client"

import { useEffect, useSyncExternalStore, type ReactNode } from "react"
import { getSession, SessionProvider, useSession } from "next-auth/react"

import { AccountsContext } from "@/components/accounts-context"
import { PASSWORD_CHECK_CACHE_MS } from "@/lib/auth/session-version"
import { endSessionLocally, startSync, stopSync, syncStatus } from "@/lib/sync/account-sync"

/**
 * Starts syncing when someone is signed in and stops when they aren't. A session that ended
 * without the Sign out menu also has its account's copy cleared from this browser.
 */
function AccountSync() {
  const { data, status } = useSession()
  const email = data?.user?.email?.toLowerCase()
  const sync = useSyncExternalStore(syncStatus.subscribe, syncStatus.get, syncStatus.getServer)

  useEffect(() => {
    if (status === "authenticated" && email) startSync(email)
    else if (status === "unauthenticated") {
      stopSync()
      void endSessionLocally()
    }
  }, [status, email])

  // The server answered the account load or an upload as signed out (the session ended on another
  // device or reached the 30-day cap; lib/sync/account-sync.ts). Auth.js
  // would only notice on the next focus or reload, so ask now: getSession() also tells this tab's
  // SessionProvider (and other tabs), and the header switches to Log in once it says nobody is.
  // Another server instance can accept the session for up to PASSWORD_CHECK_CACHE_MS more (the
  // cached check in lib/auth/users.ts), so if it still does, ask once more after that.
  useEffect(() => {
    if (sync !== "signed-out") return
    void getSession()
    const again = setTimeout(() => void getSession(), PASSWORD_CHECK_CACHE_MS + 5_000)
    return () => clearTimeout(again)
  }, [sync])

  return null
}

/** `accounts`: this server has accounts (siteFeatures().accounts), read by useAccountsEnabled(). */
export function Providers({ children, accounts }: { children: ReactNode; accounts: boolean }) {
  return (
    <AccountsContext value={accounts}>
      <SessionProvider>
        <AccountSync />
        {children}
      </SessionProvider>
    </AccountsContext>
  )
}
