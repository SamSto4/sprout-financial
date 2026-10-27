import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { connection } from "next/server"
import { CheckIcon } from "lucide-react"

import { DeleteAccountForm } from "@/components/delete-account-form"
import { PageHeader } from "@/components/page-header"
import { SecurityActivityList } from "@/components/security-activity"
import { SignOutEverywhere } from "@/components/sign-out-everywhere"
import { TwoFactorCard, type TwoFactorCardStatus } from "@/components/two-factor-card"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { auth } from "@/lib/auth/auth"
import { SECURITY_LOG_RETENTION_DAYS } from "@/lib/auth/security-log"
import { getSecurityActivity } from "@/lib/auth/security-log-server"
import { isTwoFactorAvailable, twoFactorStatus } from "@/lib/auth/two-factor-server"
import { findUserByEmail } from "@/lib/auth/users"
import { isDatabaseConfigured } from "@/lib/db/mongodb"

export const metadata: Metadata = { title: "Your account", robots: { index: false } }

const SYNCED = [
  "Your chats with the assistant",
  "Imported transactions and monthly budgets",
  "Your plan and portfolio",
  "Course progress and quiz scores",
]

export default async function AccountPage() {
  // Per request, not once at build time: the settings and the session are only known then.
  await connection()
  if (!isDatabaseConfigured()) redirect("/")
  const session = await auth()
  const email = session?.user?.email
  if (!email) redirect("/login?next=/account")

  const twoFactorReady = isTwoFactorAvailable()
  const [user, factor, activity] = await Promise.all([
    // Only needed for wording; if it can't be read, the page still loads.
    findUserByEmail(email).catch(() => null),
    twoFactorReady ? twoFactorStatus(email) : null,
    getSecurityActivity(email),
  ])
  const twoFactor: TwoFactorCardStatus | null = factor
    ? factor.enabled
      ? { enabled: true, enabledAt: factor.enabledAt.toISOString(), recoveryCodesLeft: factor.recoveryCodesLeft }
      : { enabled: false }
    : null

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <PageHeader eyebrow="Your account" title="Account" description="What's saved to your Sprout account, and how to remove it." />

      <div className="mt-10 flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="font-sans text-base font-semibold">Signed in as</CardTitle>
            <CardDescription className="text-base break-all text-foreground">{email}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Saved to your account and kept in step across your devices:</p>
            <ul className="mt-3 space-y-2">
              {SYNCED.map((item) => (
                <li key={item} className="flex items-center gap-2.5 text-sm">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                    <CheckIcon className="size-3" strokeWidth={3} aria-hidden="true" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {twoFactor && (
          <Card>
            <CardHeader>
              <CardTitle className="font-sans text-base font-semibold">Two-step verification</CardTitle>
              <CardDescription className="text-sm">A code from an app on your phone, on top of your password.</CardDescription>
            </CardHeader>
            <CardContent>
              <TwoFactorCard status={twoFactor} hasPassword={Boolean(user?.passwordHash)} />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="font-sans text-base font-semibold">Recent security activity</CardTitle>
            <CardDescription className="text-sm">
              Logins, failed attempts and security changes from the last {SECURITY_LOG_RETENTION_DAYS} days. Places are
              approximate, based on the internet connection.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SecurityActivityList
              activity={activity}
              hasPassword={user ? Boolean(user.passwordHash) : null}
              suggestTwoStep={Boolean(twoFactor && !twoFactor.enabled && user?.passwordHash)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-sans text-base font-semibold">Sign out everywhere</CardTitle>
            <CardDescription className="text-sm">
              Ends your Sprout sessions on every device, this one included. Use it if you stayed logged in on a shared
              computer, or lost a phone or laptop.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SignOutEverywhere />
          </CardContent>
        </Card>

        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="font-sans text-base font-semibold text-[#a33b3b]">Delete your account</CardTitle>
            <CardDescription className="space-y-2 text-sm">
              <span className="block">
                This permanently deletes your account and everything listed above from Sprout&apos;s servers, and clears
                it from this browser. Other devices are signed out; anything saved in their browsers stays there until you
                sign out or clear it.
              </span>
              <span className="block">
                If you signed in with Google, you can also remove Sprout&apos;s access from your Google Account&apos;s
                security settings, under third-party connections.
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DeleteAccountForm email={email} needsCode={Boolean(twoFactor?.enabled)} />
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
