import type { ReactNode } from "react"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { connection } from "next/server"
import { CheckIcon } from "lucide-react"
import { cn } from "cn"

import { DeleteAccountForm } from "@/components/delete-account-form"
import { PageHeader } from "@/components/page-header"
import { SecurityActivityList } from "@/components/security-activity"
import { SignOutEverywhere } from "@/components/sign-out-everywhere"
import { TwoFactorCard, type TwoFactorCardStatus } from "@/components/two-factor-card"
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card"
import { auth, googleEnabled } from "@/lib/auth/auth"
import { passwordResetAvailable } from "@/lib/auth/reset-server"
import { SECURITY_LOG_RETENTION_DAYS } from "@/lib/auth/security-log"
import { getSecurityActivity } from "@/lib/auth/security-log-server"
import { isFreshGoogleSession } from "@/lib/auth/session"
import { isTwoFactorAvailable, twoFactorStatus } from "@/lib/auth/two-factor-server"
import { findUserByEmail } from "@/lib/auth/users"
import { isDatabaseConfigured } from "@/lib/db/mongodb"
import { noindexMetadata } from "@/lib/seo/metadata"

export const metadata: Metadata = noindexMetadata("Your account")

const SYNCED = [
  "Your chats with the assistant",
  "Imported transactions and monthly budgets",
  "Your plan (About you) and portfolio",
  "Course progress and quiz scores",
]

/**
 * A card's title as a real h2, so screen-reader users can jump between the sections (two-step
 * verification, security activity, sign out everywhere, deletion). Looks like CardTitle; the
 * data-slot keeps CardHeader's layout rules working.
 */
function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2 data-slot="card-title" className={cn("font-sans text-base leading-snug font-semibold tracking-normal", className)}>
      {children}
    </h2>
  )
}

/** Where logInWithGoogleAgain (lib/auth/two-factor-actions.ts) comes back to: what to carry on with. */
function resumeFrom(value: string | string[] | undefined): "on" | "off" | "delete" | null {
  return value === "on" || value === "off" || value === "delete" ? value : null
}

export default async function AccountPage({ searchParams }: PageProps<"/account">) {
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
  // A Google-only account has no password to confirm: logging in with Google again in the last few
  // minutes stands in for it, and for a two-step code when turning it off or deleting the account.
  const googleOnly = Boolean(user && !user.passwordHash)
  const freshGoogle = googleOnly && isFreshGoogleSession(session)
  const resume = resumeFrom((await searchParams).reauth)
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
            <SectionTitle>Signed in as</SectionTitle>
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
              <SectionTitle>Two-step verification</SectionTitle>
              <CardDescription className="text-sm">A code from an app on your phone, on top of your password.</CardDescription>
            </CardHeader>
            <CardContent>
              <TwoFactorCard
                status={twoFactor}
                hasPassword={Boolean(user?.passwordHash)}
                googleAgain={googleOnly && googleEnabled}
                freshGoogle={freshGoogle}
                resume={resume === "on" || resume === "off" ? resume : null}
              />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <SectionTitle>Recent security activity</SectionTitle>
            <CardDescription className="text-sm">
              Logins, failed attempts and security changes from the last {SECURITY_LOG_RETENTION_DAYS} days. Places are
              approximate, based on the internet connection.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SecurityActivityList
              activity={activity}
              hasPassword={user ? Boolean(user.passwordHash) : null}
              canReset={passwordResetAvailable()}
              suggestTwoStep={Boolean(twoFactor && !twoFactor.enabled && user?.passwordHash)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <SectionTitle>Sign out everywhere</SectionTitle>
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
            <SectionTitle className="text-[#a33b3b]">Delete your account</SectionTitle>
            <CardDescription className="space-y-2 text-sm">
              <span className="block">
                This permanently deletes your account and everything listed above from Sprout&apos;s servers, and clears
                it from this browser. Other devices are signed out, and Sprout removes its copy from each of those
                browsers the next time it&apos;s opened there.
              </span>
              <span className="block">
                If you signed in with Google, you can also remove Sprout&apos;s access from your Google Account&apos;s
                security settings, under third-party connections.
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DeleteAccountForm
              email={email}
              needsCode={Boolean(twoFactor?.enabled) && !freshGoogle}
              codeWaived={Boolean(twoFactor?.enabled) && freshGoogle}
              googleAgain={Boolean(twoFactor?.enabled) && googleOnly && googleEnabled}
              focus={resume === "delete"}
            />
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
