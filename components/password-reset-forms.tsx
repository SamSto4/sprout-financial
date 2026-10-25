"use client"

import { useActionState, useState } from "react"
import Link from "next/link"
import { LoaderCircleIcon, MailCheckIcon } from "lucide-react"

import { Button, buttonVariants } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { requestPasswordReset, resetPassword, type ForgotState, type ResetState } from "@/lib/auth/reset-actions"
import { MAX_PASSWORD_BYTES, MIN_PASSWORD_LENGTH } from "@/lib/auth/validate"

function FormError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-[#a33b3b]">
      {message}
    </p>
  )
}

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<ForgotState, FormData>(requestPasswordReset, {})
  // Controlled, so the address survives React resetting the form after an error.
  const [email, setEmail] = useState("")

  if (state.sent) {
    return (
      <div className="flex flex-col items-center gap-4 text-center" role="status">
        <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-primary">
          <MailCheckIcon className="size-6" aria-hidden="true" />
        </span>
        <h1 className="text-2xl font-semibold">Check your email</h1>
        <p className="text-sm text-muted-foreground">
          If <span className="font-medium text-foreground">{state.email}</span> has a Sprout account, we&apos;ve sent it a
          link to choose a new password. It works for one hour.
        </p>
        <p className="text-xs text-muted-foreground">Nothing there after a few minutes? Check your spam folder.</p>
        <Link href="/login" className={buttonVariants({ variant: "outline", size: "lg", className: "h-10 w-full" })}>
          Back to log in
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-2xl font-semibold">Forgot your password?</h1>
        <p className="text-sm text-balance text-muted-foreground">
          Enter the email you signed up with and we&apos;ll send you a link to choose a new one.
        </p>
      </div>
      <form action={formAction} className="flex flex-col gap-6">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <FormError message={state.error} />
          <Field>
            <Button type="submit" size="lg" className="h-10 disabled:opacity-100" disabled={pending} aria-busy={pending}>
              {pending && <LoaderCircleIcon className="animate-spin" aria-hidden="true" />}
              {pending ? "Sending…" : "Send reset link"}
            </Button>
          </Field>
        </FieldGroup>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          Log in
        </Link>
      </p>
    </div>
  )
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<ResetState, FormData>(resetPassword, {})

  if (state.done) {
    return (
      <div className="flex flex-col items-center gap-4 text-center" role="status">
        <h1 className="text-2xl font-semibold">Password updated</h1>
        <p className="text-sm text-muted-foreground">You can now log in with your new password.</p>
        <Link href="/login?reset=done" className={buttonVariants({ size: "lg", className: "h-10 w-full" })}>
          Log in
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-2xl font-semibold">Choose a new password</h1>
        <p className="text-sm text-muted-foreground">
          {MIN_PASSWORD_LENGTH} to {MAX_PASSWORD_BYTES} characters.
        </p>
      </div>
      <form action={formAction} className="flex flex-col gap-6">
        <input type="hidden" name="token" value={token} />
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="password">New password</FieldLabel>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              maxLength={MAX_PASSWORD_BYTES}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="confirm">Confirm new password</FieldLabel>
            <Input
              id="confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              maxLength={MAX_PASSWORD_BYTES}
              required
            />
            <FieldDescription>Type it again so a typo doesn&apos;t lock you out.</FieldDescription>
          </Field>
          <FormError message={state.error} />
          {state.error?.includes("expired") && (
            <Link href="/forgot-password" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
              Get a new reset link
            </Link>
          )}
          <Field>
            <Button type="submit" size="lg" className="h-10 disabled:opacity-100" disabled={pending} aria-busy={pending}>
              {pending && <LoaderCircleIcon className="animate-spin" aria-hidden="true" />}
              {pending ? "Saving…" : "Save new password"}
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </div>
  )
}
