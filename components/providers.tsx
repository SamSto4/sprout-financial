"use client"

import { useEffect, type ReactNode } from "react"
import { SessionProvider, useSession } from "next-auth/react"

import { startSync, stopSync } from "@/lib/sync/account-sync"

/** Starts syncing when someone is signed in and stops when they aren't. */
function AccountSync() {
  const { data, status } = useSession()
  const email = data?.user?.email?.toLowerCase()

  useEffect(() => {
    if (status === "authenticated" && email) startSync(email)
    else if (status === "unauthenticated") stopSync()
  }, [status, email])

  return null
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <AccountSync />
      {children}
    </SessionProvider>
  )
}
