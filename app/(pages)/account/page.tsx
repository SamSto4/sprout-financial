import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { connection } from "next/server"
import { CheckIcon } from "lucide-react"

import { DeleteAccountForm } from "@/components/delete-account-form"
import { PageHeader } from "@/components/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { auth } from "@/lib/auth/auth"
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
            <DeleteAccountForm email={email} />
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
