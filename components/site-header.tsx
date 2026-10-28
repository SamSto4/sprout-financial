"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import { ChevronRightIcon, MenuIcon, XIcon } from "lucide-react"
import { cn } from "cn"

import { AccountMenu, signOutAndClear } from "@/components/account-menu"
import { useAccountsEnabled } from "@/components/accounts-context"
import { BrandMark } from "@/components/brand-mark"
import { Button } from "@/components/ui/button"
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu"
import { NAV_LINKS, SITE_NAME } from "@/lib/site"

export function SiteHeader() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const { data: session } = useSession()
  const email = session?.user?.email
  const accounts = useAccountsEnabled()
  // Log in and Create an account only where this server has accounts.
  const accountLinks =
    email || !accounts
      ? []
      : [
          { title: "Log in", href: "/login" },
          { title: "Create an account", href: "/login?mode=signup" },
        ]

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  return (
    <header className="sticky top-0 z-50 border-b bg-background/85 backdrop-blur-md backdrop-saturate-150">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="-mx-1 flex min-h-11 items-center gap-2 rounded-md px-1 font-heading text-lg font-semibold">
          <BrandMark />
          {SITE_NAME}
        </Link>

        <NavigationMenu className="hidden lg:flex">
          <NavigationMenuList className="gap-1">
            {NAV_LINKS.map((link) => (
              <NavigationMenuItem key={link.href}>
                <NavigationMenuLink
                  render={<Link href={link.href} />}
                  aria-current={isActive(link.href) ? "page" : undefined}
                  className={cn(
                    "relative rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                    isActive(link.href) &&
                      "text-foreground after:absolute after:inset-x-3 after:-bottom-[13px] after:h-0.5 after:rounded-full after:bg-brand"
                  )}
                >
                  {link.title}
                </NavigationMenuLink>
              </NavigationMenuItem>
            ))}
          </NavigationMenuList>
        </NavigationMenu>

        <div className="flex items-center gap-2">
          <AccountMenu loginActive={isActive("/login")} />
          <Button
            variant="ghost"
            size="icon-lg"
            className="-mr-2 lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <XIcon /> : <MenuIcon />}
          </Button>
        </div>
      </div>

      {open && (
        <nav
          id="mobile-nav"
          aria-label="Main"
          className="animate-rise max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain border-t bg-background shadow-md lg:hidden"
        >
          <ul className="mx-auto flex max-w-6xl flex-col px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {[...NAV_LINKS, ...accountLinks].map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setOpen(false)}
                  aria-current={isActive(link.href) ? "page" : undefined}
                  className={cn(
                    "flex min-h-12 items-center justify-between rounded-lg px-3 text-base font-medium",
                    isActive(link.href) ? "bg-secondary text-secondary-foreground" : "hover:bg-muted active:bg-muted"
                  )}
                >
                  {link.title}
                  <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            ))}
            {email && (
              <li className="mt-1 border-t pt-2">
                <p className="truncate px-3 pb-1 text-xs text-muted-foreground">Signed in as {email}</p>
                <Link
                  href="/account"
                  onClick={() => setOpen(false)}
                  aria-current={isActive("/account") ? "page" : undefined}
                  className={cn(
                    "flex rounded-md px-3 py-3 text-base font-medium",
                    isActive("/account") ? "bg-secondary text-secondary-foreground" : "hover:bg-muted"
                  )}
                >
                  Account settings
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    signOutAndClear()
                  }}
                  className="flex w-full rounded-md px-3 py-3 text-left text-base font-medium hover:bg-muted"
                >
                  Sign out
                </button>
              </li>
            )}
          </ul>
        </nav>
      )}
    </header>
  )
}
