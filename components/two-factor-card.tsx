"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { CopyIcon, DownloadIcon, LoaderCircleIcon, ShieldCheckIcon } from "lucide-react"

import { GoogleAgainButton } from "@/components/google-again"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { beginTwoFactorSetup, finishTwoFactorSetup, makeNewRecoveryCodes, turnOffTwoFactor } from "@/lib/auth/two-factor-actions"
import type { TwoFactorActionResult } from "@/lib/auth/two-factor-setup"
import { formatDate } from "@/lib/format"

export type TwoFactorCardStatus = { enabled: false } | { enabled: true; enabledAt: string; recoveryCodesLeft: number }

type Step =
  | { name: "idle" }
  | { name: "password" }
  | { name: "google" }
  | { name: "scan"; qrSvg: string; secret: string }
  | { name: "codes"; codes: string[] }
  | { name: "confirm"; action: "off" | "new-codes" }

/**
 * The Account page's two-step verification controls: turn on, recovery codes, turn off.
 *
 * A Google-only account has no password to confirm, so it logs in with Google again instead
 * (`googleAgain`: offered when this server has Google sign-in) and comes back with `resume` set to
 * carry on. While that login is fresh (`freshGoogle`, the last few minutes), turning it off needs no
 * code (lib/auth/two-factor-code.ts).
 */
export function TwoFactorCard({
  status,
  hasPassword,
  googleAgain = false,
  freshGoogle = false,
  resume = null,
}: {
  status: TwoFactorCardStatus
  hasPassword: boolean
  googleAgain?: boolean
  freshGoogle?: boolean
  resume?: "on" | "off" | null
}) {
  const googleOnly = !hasPassword
  // Back from logging in with Google again to turn it off: open that step straight away.
  const [step, setStep] = useState<Step>(() => (resume === "off" && status.enabled && googleOnly ? { name: "confirm", action: "off" } : { name: "idle" }))
  const [code, setCode] = useState("")
  // Password accounts confirm their current password before setup starts (lib/auth/two-factor-setup.ts).
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  // Back from logging in with Google again to turn it on: setup starts as the page loads.
  const resumingSetup = resume === "on" && !status.enabled && googleOnly
  const [pending, setPending] = useState(resumingSetup)
  // Whether the server should still count this session's Google login as fresh; cleared when it says otherwise.
  const [fresh, setFresh] = useState(googleOnly && freshGoogle)
  const router = useRouter()

  /** Runs a server action; true when it worked. */
  async function run(action: () => Promise<TwoFactorActionResult>, next: (result: Extract<TwoFactorActionResult, { ok: true }>) => void) {
    setPending(true)
    setError(null)
    const result = await action().catch((): TwoFactorActionResult => ({ ok: false, error: "Couldn't reach Sprout. Please try again." }))
    setPending(false)
    if (!result.ok) {
      setError(result.error)
      return false
    }
    setCode("")
    next(result)
    return true
  }

  const reset = () => {
    setStep({ name: "idle" })
    setCode("")
    setPassword("")
    setError(null)
  }

  function requestSetup(typed: string) {
    const form = new FormData()
    if (typed) form.set("password", typed)
    return beginTwoFactorSetup(form).catch((): TwoFactorActionResult => ({ ok: false, error: "Couldn't reach Sprout. Please try again." }))
  }

  async function startSetup(typed: string) {
    setPending(true)
    setError(null)
    showSetup(await requestSetup(typed))
  }

  function showSetup(result: TwoFactorActionResult) {
    setPending(false)
    if (!result.ok) {
      if (result.reauth && googleAgain) {
        // The Google login isn't fresh (any more): ask for a new one rather than showing an error.
        setFresh(false)
        setStep({ name: "google" })
        return
      }
      setError(result.error)
      return
    }
    setPassword("")
    setStep({ name: "scan", qrSvg: result.qrSvg ?? "", secret: result.secret ?? "" })
  }

  // Back from logging in with Google again: start setup once (React's development double run
  // included), and take the marker out of the address so a reload doesn't start over.
  const resumed = useRef(false)
  useEffect(() => {
    if (resumed.current || !resume) return
    resumed.current = true
    window.history.replaceState(null, "", "/account")
    if (resumingSetup) void requestSetup("").then(showSetup)
    // Runs once, on the page load that came back from Google.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const codeField = (label: string, help: string) => (
    <Field>
      <FieldLabel htmlFor="two-factor-code">{label}</FieldLabel>
      <Input
        id="two-factor-code"
        value={code}
        onChange={(event) => setCode(event.target.value)}
        autoComplete="one-time-code"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={24}
        autoFocus
        className="figures max-w-56 text-lg tracking-widest"
        aria-describedby="two-factor-code-help"
      />
      <FieldDescription id="two-factor-code-help">{help}</FieldDescription>
    </Field>
  )

  const errorMessage = error && (
    <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-[#a33b3b]">
      {error}
    </p>
  )

  const finish = () => {
    reset()
    router.refresh()
  }

  if (step.name === "codes") return <RecoveryCodes codes={step.codes} onDone={finish} />

  if (step.name === "google") {
    return (
      <div className="space-y-5">
        <p className="text-sm text-muted-foreground">
          To turn on two-step verification, first confirm it&apos;s you by logging in with Google again. You&apos;ll come
          straight back here to finish.
        </p>
        <div className="flex flex-wrap gap-2">
          <GoogleAgainButton purpose="on" />
          <Button type="button" variant="ghost" onClick={reset}>
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  if (step.name === "password") {
    return (
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault()
          void startSetup(password)
        }}
      >
        <p className="text-sm text-muted-foreground">
          To turn on two-step verification, first confirm it&apos;s you with the password you log in with.
        </p>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="two-factor-password">Current password</FieldLabel>
            <Input
              id="two-factor-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              maxLength={200}
              autoFocus
              className="max-w-sm"
            />
          </Field>
        </FieldGroup>
        {errorMessage}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending || password === ""} className="disabled:opacity-100" aria-busy={pending}>
            {pending && <LoaderCircleIcon className="animate-spin" aria-hidden="true" />}
            Continue
          </Button>
          <Button type="button" variant="ghost" onClick={reset}>
            Cancel
          </Button>
        </div>
      </form>
    )
  }

  if (step.name === "scan") {
    return (
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault()
          void run(() => finishTwoFactorSetup(code), (result) => setStep({ name: "codes", codes: result.recoveryCodes ?? [] }))
        }}
      >
        <ol className="space-y-2 text-sm text-muted-foreground">
          <li>1. Open an authenticator app on your phone, such as Google Authenticator, Microsoft Authenticator or 1Password.</li>
          <li>2. Scan this code, or type the key below into the app.</li>
          <li>3. Enter the 6-digit code the app shows for Sprout.</li>
        </ol>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- a generated data: SVG, not a file to optimize */}
          <img
            src={`data:image/svg+xml;utf8,${encodeURIComponent(step.qrSvg)}`}
            alt="QR code to add Sprout to your authenticator app"
            width={176}
            height={176}
            className="size-44 rounded-lg border bg-white p-2"
          />
          <div className="min-w-0 space-y-1">
            <p className="text-xs text-muted-foreground">Or type this key into the app</p>
            <p className="figures font-mono text-sm font-medium break-all select-all">{step.secret}</p>
          </div>
        </div>
        <FieldGroup>{codeField("Code from your app", "It changes every 30 seconds.")}</FieldGroup>
        {errorMessage}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending || code.trim() === ""} className="disabled:opacity-100" aria-busy={pending}>
            {pending && <LoaderCircleIcon className="animate-spin" aria-hidden="true" />}
            Turn on
          </Button>
          <Button type="button" variant="ghost" onClick={reset}>
            Cancel
          </Button>
        </div>
      </form>
    )
  }

  if (step.name === "confirm") {
    const turningOff = step.action === "off"
    // A fresh Google login stands in for the code when turning it off (lib/auth/two-factor-code.ts).
    const noCodeNeeded = turningOff && fresh
    return (
      <div className="space-y-5">
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault()
            void run(
              () => (turningOff ? turnOffTwoFactor(code) : makeNewRecoveryCodes(code)),
              (result) => (turningOff ? finish() : setStep({ name: "codes", codes: result.recoveryCodes ?? [] }))
            ).then((ok) => {
              // Refused although the page thought the Google login was fresh: it's no longer, so ask for a code.
              if (!ok && noCodeNeeded) setFresh(false)
            })
          }}
        >
          <p className="text-sm text-muted-foreground">
            {noCodeNeeded
              ? "You logged in with Google a moment ago, so no code is needed to turn off two-step verification."
              : turningOff
                ? "To turn off two-step verification, enter a code from your app or a recovery code."
                : "To replace your recovery codes, enter a code from your app. Your old recovery codes will stop working."}
          </p>
          {!noCodeNeeded && <FieldGroup>{codeField("Code", "6 digits from your app, or a recovery code.")}</FieldGroup>}
          {errorMessage}
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              variant={turningOff ? "destructive" : "default"}
              disabled={pending || (!noCodeNeeded && code.trim() === "")}
              className="disabled:opacity-100"
              aria-busy={pending}
            >
              {pending && <LoaderCircleIcon className="animate-spin" aria-hidden="true" />}
              {turningOff ? "Turn off" : "Make new codes"}
            </Button>
            <Button type="button" variant="ghost" onClick={reset}>
              Cancel
            </Button>
          </div>
        </form>
        {turningOff && !noCodeNeeded && googleOnly && googleAgain && (
          <div className="space-y-3 border-t pt-4">
            <p className="text-sm text-muted-foreground">
              No code? Log in with Google again and you can turn it off without one.
            </p>
            <GoogleAgainButton purpose="off" />
          </div>
        )}
      </div>
    )
  }

  if (status.enabled) {
    return (
      <div className="space-y-4">
        <p className="flex items-center gap-2 text-sm font-medium text-primary">
          <ShieldCheckIcon className="size-4" aria-hidden="true" />
          On since {formatDate(status.enabledAt)}
        </p>
        <p className="text-sm text-muted-foreground">
          {status.recoveryCodesLeft === 0
            ? "You've used all your recovery codes. Make new ones so you can still log in if you lose your phone."
            : `${status.recoveryCodesLeft} recovery ${status.recoveryCodesLeft === 1 ? "code" : "codes"} left.`}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setStep({ name: "confirm", action: "new-codes" })}>
            New recovery codes
          </Button>
          <Button type="button" variant="ghost" className="text-[#a33b3b]" onClick={() => setStep({ name: "confirm", action: "off" })}>
            Turn off
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {hasPassword
          ? "Once it's on, logging in with your password also needs a code from an app on your phone, so a stolen password isn't enough."
          : "Logging in with Google is protected by your Google account's own 2-step verification. Turning this on means deleting your account, or turning this off again, also needs a code from your phone, or logging in with Google again."}
      </p>
      {errorMessage}
      <Button
        type="button"
        disabled={pending}
        className="disabled:opacity-100"
        aria-busy={pending}
        onClick={() => {
          setError(null)
          if (hasPassword) setStep({ name: "password" })
          else if (!fresh && googleAgain) setStep({ name: "google" })
          else void startSetup("")
        }}
      >
        {pending && <LoaderCircleIcon className="animate-spin" aria-hidden="true" />}
        Turn on two-step verification
      </Button>
    </div>
  )
}

/** Shown once: the codes aren't stored anywhere they could be read again. */
function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [copied, setCopied] = useState(false)
  const text = `Sprout recovery codes\nEach code works once, in place of a code from your authenticator app.\n\n${codes.join("\n")}\n`

  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }))
    const link = document.createElement("a")
    link.href = url
    link.download = "sprout-recovery-codes.txt"
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 text-sm font-medium text-primary">
        <ShieldCheckIcon className="size-4" aria-hidden="true" />
        Save your recovery codes
      </p>
      <p className="text-sm text-muted-foreground">
        If you lose your phone, each of these codes lets you log in once. Keep them somewhere safe, like a password manager.
        This is the only time they&apos;re shown.
      </p>
      <ul className="figures grid gap-x-6 gap-y-1.5 rounded-lg border bg-surface px-4 py-3 font-mono text-sm sm:grid-cols-2" aria-label="Recovery codes">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            void navigator.clipboard.writeText(text).then(
              () => setCopied(true),
              () => setCopied(false)
            )
          }
        >
          <CopyIcon />
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button type="button" variant="outline" onClick={download}>
          <DownloadIcon />
          Download
        </Button>
        <Button type="button" onClick={onDone}>
          I&apos;ve saved them
        </Button>
      </div>
    </div>
  )
}
