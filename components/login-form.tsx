"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { emailAuth, googleAuth, type AuthState } from "@/lib/auth/actions"
import { MAX_PASSWORD_BYTES, MIN_PASSWORD_LENGTH } from "@/lib/auth/validate"

type Intent = "login" | "signup"

export function LoginForm({
  googleEnabled,
  redirectTo,
  className,
}: {
  googleEnabled: boolean
  redirectTo: string
  className?: string
}) {
  const [intent, setIntent] = useState<Intent>("login")
  // Controlled, so the email survives React resetting the form after a failed attempt.
  const [email, setEmail] = useState("")
  const [state, formAction, pending] = useActionState<AuthState, FormData>(emailAuth, {})
  const creating = intent === "signup"
  const { update } = useSession()
  const router = useRouter()
  const finishing = Boolean(state.redirectTo)

  // useSession() returns a new `update` whenever the session changes, and calling it changes the
  // session. Read it through a ref so the effect below runs once per sign-in instead of looping.
  const updateRef = useRef(update)
  useEffect(() => {
    updateRef.current = update
  }, [update])

  // After a successful sign-in, refresh the client's session before leaving the page.
  useEffect(() => {
    const destination = state.redirectTo
    if (!destination) return
    let cancelled = false
    const leave = () => {
      if (cancelled) return
      router.replace(destination)
      router.refresh()
    }
    // The session cookie is already set, so navigate even if the refresh fails.
    void updateRef.current().then(leave, leave)
    return () => {
      cancelled = true
    }
  }, [state, router])

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-2xl font-semibold">{creating ? "Create your account" : "Log in to your account"}</h1>
        <p className="text-sm text-balance text-muted-foreground">
          {creating
            ? "Save your chats, course progress and finances, and use them on any device."
            : "Pick up where you left off on any device."}
        </p>
      </div>

      <div role="tablist" aria-label="Log in or create an account" className="grid grid-cols-2 rounded-lg bg-muted p-1">
        {(["login", "signup"] as Intent[]).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={intent === value}
            onClick={() => setIntent(value)}
            className={cn(
              "rounded-md py-1.5 text-sm font-medium transition-colors",
              intent === value ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {value === "login" ? "Log in" : "Create account"}
          </button>
        ))}
      </div>

      <form action={formAction} className="flex flex-col gap-6">
        <input type="hidden" name="intent" value={intent} />
        <input type="hidden" name="redirectTo" value={redirectTo} />
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
          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={creating ? "new-password" : "current-password"}
              minLength={MIN_PASSWORD_LENGTH}
              maxLength={creating ? MAX_PASSWORD_BYTES : undefined}
              required
              aria-describedby={creating ? "password-hint" : undefined}
            />
            {creating && (
              <FieldDescription id="password-hint">
                {MIN_PASSWORD_LENGTH} to {MAX_PASSWORD_BYTES} characters.
              </FieldDescription>
            )}
          </Field>
          {state.error && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-[#a33b3b]">
              {state.error}
            </p>
          )}
          <Field>
            <Button type="submit" size="lg" className="h-10" disabled={pending || finishing}>
              {pending || finishing
                ? creating
                  ? "Creating your account…"
                  : "Logging in…"
                : creating
                  ? "Create account"
                  : "Log in"}
            </Button>
          </Field>
        </FieldGroup>
      </form>

      {googleEnabled && (
        <form action={googleAuth} className="flex flex-col gap-6">
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <FieldSeparator>Or</FieldSeparator>
          <Button variant="outline" type="submit" size="lg" className="h-10">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.96 10.96 0 0 0 12 1 11 11 0 0 0 2.18 7.06L5.84 9.9C6.71 7.3 9.14 5.38 12 5.38z" />
            </svg>
            Continue with Google
          </Button>
        </form>
      )}
    </div>
  )
}
