"use client"

import { useActionState } from "react"
import Link from "next/link"
import { LoaderCircleIcon, MailCheckIcon } from "lucide-react"

import { Button, buttonVariants } from "@/components/ui/button"
import { confirmEmailAction, type ConfirmState } from "@/lib/auth/verify-actions"

/** The /verify-email page: one button, so opening the link alone (an email scanner, say) changes nothing. */
export function VerifyEmailForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<ConfirmState, FormData>(confirmEmailAction, {})

  if (state.done) {
    return (
      <div className="flex flex-col items-center gap-4 text-center" role="status">
        <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-primary">
          <MailCheckIcon className="size-6" aria-hidden="true" />
        </span>
        <h1 className="text-2xl font-semibold">Email confirmed</h1>
        <p className="text-sm text-muted-foreground">Your account is ready. Log in with the email and password you chose.</p>
        <Link href="/login?verified=done" className={buttonVariants({ size: "lg", className: "h-10 w-full" })}>
          Log in
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-2xl font-semibold">Confirm your email</h1>
        <p className="text-sm text-balance text-muted-foreground">
          One click and your Sprout account is ready to use.
        </p>
      </div>
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="token" value={token} />
        {state.error && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-[#a33b3b]">
            {state.error}
          </p>
        )}
        <Button type="submit" size="lg" className="h-10 disabled:opacity-100" disabled={pending} aria-busy={pending}>
          {pending && <LoaderCircleIcon className="animate-spin" aria-hidden="true" />}
          {pending ? "Confirming…" : "Confirm my email"}
        </Button>
      </form>
      {state.error && (
        <Link href="/login" className="text-center text-sm font-medium text-primary underline-offset-4 hover:underline">
          Go to log in
        </Link>
      )}
    </div>
  )
}
