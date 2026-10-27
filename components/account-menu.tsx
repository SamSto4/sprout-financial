"use client"

import { useSyncExternalStore } from "react"
import Link from "next/link"
import { signOut, useSession } from "next-auth/react"
import { CloudAlertIcon, CloudCheckIcon, CloudIcon, LogOutIcon } from "lucide-react"
import { cn } from "cn"

import { useAccountsEnabled } from "@/components/accounts-context"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { clearLocalAccountData, syncStatus, type SyncStatus } from "@/lib/sync/account-sync"

const STATUS: Record<SyncStatus, { label: string; icon: typeof CloudIcon; className: string }> = {
  off: { label: "Not syncing", icon: CloudIcon, className: "text-muted-foreground" },
  syncing: { label: "Syncing…", icon: CloudIcon, className: "text-muted-foreground" },
  synced: { label: "Saved to your account", icon: CloudCheckIcon, className: "text-primary" },
  error: { label: "Couldn't sync. Will retry on your next change.", icon: CloudAlertIcon, className: "text-[#a33b3b]" },
}

export function useSyncStatus() {
  return useSyncExternalStore(syncStatus.subscribe, syncStatus.get, syncStatus.getServer)
}

/** Clears this device's copy first, then ends the session. Also used by "Sign out everywhere". */
export function signOutAndClear(redirectTo = "/") {
  clearLocalAccountData()
  void signOut({ redirectTo })
}

function initials(name: string | null | undefined, email: string) {
  const source = name?.trim() || email
  return source.slice(0, 1).toUpperCase()
}

export function AccountMenu({ loginActive }: { loginActive: boolean }) {
  const { data, status } = useSession()
  const sync = useSyncStatus()
  // Without accounts on this server, /login only says they aren't available: offer nothing.
  const accounts = useAccountsEnabled()

  if (status === "loading") {
    return accounts ? <span className="hidden h-9 w-20 animate-pulse rounded-lg bg-muted sm:block" aria-hidden="true" /> : null
  }

  const user = data?.user
  if (!user?.email) {
    if (!accounts) return null
    return (
      <div className="hidden items-center gap-2 sm:flex">
        <Button
          render={<Link href="/login" />}
          nativeButton={false}
          variant={loginActive ? "secondary" : "ghost"}
          className="h-9 px-3"
        >
          Log in
        </Button>
        <Button render={<Link href="/login?mode=signup" />} nativeButton={false} className="h-9 px-4">
          Sign up
        </Button>
      </div>
    )
  }

  const state = STATUS[sync]
  const StatusIcon = state.icon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" className="hidden h-9 gap-2 pr-3 pl-1.5 sm:inline-flex" aria-label="Your account" />
        }
      >
        <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          {initials(user.name, user.email)}
        </span>
        <span className="max-w-32 truncate">{user.name || user.email}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="truncate text-sm text-foreground">{user.email}</DropdownMenuLabel>
          <p className={cn("flex items-start gap-1.5 px-1.5 pb-1.5 text-xs", state.className)}>
            <StatusIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            {state.label}
          </p>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/assistant" />}>Your chats</DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/dashboard" />}>Your finances</DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/learn" />}>Course progress</DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/account" />}>Account settings</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => signOutAndClear()}>
          <LogOutIcon />
          Sign out
        </DropdownMenuItem>
        <p className="px-1.5 pt-0.5 pb-1 text-[11px] leading-snug text-muted-foreground">
          Signing out removes your data from this device. It stays in your account.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
