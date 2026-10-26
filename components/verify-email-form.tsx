"use client"

import { useActionState, useEffect, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { LoaderCircleIcon, MailCheckIcon } from "lucide-react"

import { Button, buttonVariants } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { confirmSignupAction, type ConfirmState } from "@/lib/auth/verify-actions"

/**
 * The /verify-email page. Asks for the password chosen at sign-up, so the link alone (someone else's
 * sign-up that landed in your inbox, or an email scanner opening it) can't create an account.
 */
export function VerifyEmailForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<ConfirmState, FormData>(confirmSignupAction, {})
  const { update } = useSession()
  const router = useRouter()

  // Same as the login form: refresh the client's session before leaving, so the header and sync
  // see the new sign-in straight away. Read through a ref so the effect runs once.
  const updateRef = useRef(update)
  useEffect(() => {
    updateRef.current = update
  }, [update])
  useEffect(() => {
    const destination = state.redirectTo
    if (!destination) return
    let cancelled = false
    const leave = () => {
      if (cancelled) return
      router.replace(destination)
      router.refresh()
    }
    void updateRef.current().then(leave, leave)
    return () => {
      cancelled = true
    }
  }, [state, router])

  if (state.created) {
    return (
      <div className="flex flex-col items-center gap-4 text-center" role="status">
        <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-primary">
          <MailCheckIcon className="size-6" aria-hidden="true" />
        </span>
        <h1 className="text-2xl font-semibold">Email confirmed</h1>
        {state.redirectTo ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircleIcon className="size-4 animate-spin" aria-hidden="true" />
            Your account is ready. Logging you in…
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">Your account is ready. Log in with your email and password.</p>
            <Link href="/login?verified=done" className={buttonVariants({ size: "lg", className: "h-10 w-full" })}>
              Log in
            </Link>
          </>
        )}
      </div>
    )
  }

  if (state.invalidLink) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-2xl font-semibold">This link can&apos;t be used</h1>
        <p role="alert" className="text-sm text-muted-foreground">
          {state.error}
        </p>
        <Link href="/login?mode=signup" className={buttonVariants({ size: "lg", className: "h-10 w-full" })}>
          Sign up again
        </Link>
        <Link href="/login" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          Log in instead
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-2xl font-semibold">Confirm your email</h1>
        <p className="text-sm text-balance text-muted-foreground">
          Enter the password you chose when you signed up to finish creating your account.
        </p>
      </div>
      <form action={formAction} className="flex flex-col gap-6">
        <input type="hidden" name="token" value={token} />
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
            <FieldDescription>Didn&apos;t sign up for Sprout? Close this page; no account will be created.</FieldDescription>
          </Field>
          {state.error && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-[#a33b3b]">
              {state.error}
            </p>
          )}
          <Field>
            <Button type="submit" size="lg" className="h-10 disabled:opacity-100" disabled={pending} aria-busy={pending}>
              {pending && <LoaderCircleIcon className="animate-spin" aria-hidden="true" />}
              {pending ? "Confirming…" : "Confirm and log in"}
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </div>
  )
}
