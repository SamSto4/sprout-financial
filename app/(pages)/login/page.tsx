import type { Metadata } from "next"
import Link from "next/link"
import { CheckIcon } from "lucide-react"

import { LoginForm } from "@/components/login-form"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { auth, googleEnabled } from "@/lib/auth/auth"
import { safeRedirect, signInErrorMessage } from "@/lib/auth/validate"
import { isDatabaseConfigured } from "@/lib/db/mongodb"
import { noindexMetadata } from "@/lib/seo/metadata"

export const metadata: Metadata = noindexMetadata("Log in")

const benefits = [
  "Your chats with the assistant, on every device",
  "Course progress and quiz scores saved",
  "Your imported finances ready on the dashboard",
]

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error, mode, reset, verified } = await searchParams
  const redirectTo = safeRedirect(typeof next === "string" ? next : "/")
  // Set by Auth.js when a sign-in was refused, e.g. Google for an email with a password account.
  const signInError = signInErrorMessage(error)
  const session = await auth()

  return (
    <main className="grid flex-1 lg:grid-cols-2">
      <section className="hidden flex-col justify-center border-r bg-surface px-12 py-16 lg:flex xl:px-20">
        <p className="eyebrow">Your account</p>
        <p className="mt-3 max-w-md font-heading text-4xl leading-tight font-semibold">
          Small, steady steps build <span className="text-primary italic">financial confidence</span>.
        </p>
        <ul className="mt-10 space-y-4">
          {benefits.map((benefit) => (
            <li key={benefit} className="flex items-center gap-3 text-muted-foreground">
              <span className="flex size-6 items-center justify-center rounded-full bg-secondary text-primary">
                <CheckIcon className="size-3.5" strokeWidth={3} aria-hidden="true" />
              </span>
              {benefit}
            </li>
          ))}
        </ul>
        <p className="mt-10 max-w-md text-xs leading-relaxed text-muted-foreground">
          When you&apos;re signed in, your chats, course progress and imported transactions are stored in your account so
          they sync. Signing out removes them from the device you&apos;re using.
        </p>
      </section>

      <div className="flex items-center justify-center px-4 py-12 sm:px-6">
        <Card className="w-full max-w-sm shadow-[0_1px_2px_rgb(24_53_42/0.04),0_16px_40px_-20px_rgb(24_53_42/0.25)]">
          <CardContent className="p-6 sm:p-8">
            {session?.user?.email ? (
              <div className="space-y-4 text-center">
                <h1 className="text-2xl font-semibold">You&apos;re signed in</h1>
                <p className="text-sm text-muted-foreground">
                  Signed in as <span className="font-medium text-foreground">{session.user.email}</span>. Your data is
                  syncing to your account.
                </p>
                <Link href="/dashboard" className={buttonVariants({ size: "lg", className: "h-10 w-full" })}>
                  Go to your dashboard
                </Link>
              </div>
            ) : isDatabaseConfigured() ? (
              <>
                {signInError && (
                  <p
                    role="alert"
                    className="mb-6 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-[#a33b3b]"
                  >
                    {signInError}
                  </p>
                )}
                {verified === "done" && (
                  <p role="status" className="mb-6 rounded-lg border border-primary/30 bg-secondary px-3 py-2 text-sm text-secondary-foreground">
                    Your email is confirmed. Log in to start using your account.
                  </p>
                )}
                {reset === "done" && (
                  <p role="status" className="mb-6 rounded-lg border border-primary/30 bg-secondary px-3 py-2 text-sm text-secondary-foreground">
                    Your password was changed. Log in with your new password.
                  </p>
                )}
                <LoginForm
                  key={mode === "signup" ? "signup" : "login"}
                  googleEnabled={googleEnabled}
                  redirectTo={redirectTo}
                  initialIntent={mode === "signup" ? "signup" : "login"}
                />
              </>
            ) : (
              <div className="space-y-2 text-center">
                <h1 className="text-2xl font-semibold">Accounts aren&apos;t available here</h1>
                <p className="text-sm text-muted-foreground">Accounts aren&apos;t set up on this server yet.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
