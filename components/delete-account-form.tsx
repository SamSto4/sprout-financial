"use client"

import { useState } from "react"
import { signOut } from "next-auth/react"
import { LoaderCircleIcon, Trash2Icon } from "lucide-react"

import { GoogleAgainButton } from "@/components/google-again"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { confirmsDeletion } from "@/lib/auth/account-deletion"
import { markAccountDeleted, tabStorage } from "@/lib/auth/deleted-notice"
import { deleteAccount } from "@/lib/sync/account-sync"

/**
 * Deletes the account after the person types their email, plus a two-step code when the account
 * has two-step verification on (checkDeletionCode in lib/auth/account-deletion.ts). No browser
 * confirm() dialog: typing the address is the confirmation, and the button stays disabled until
 * it matches. A Google-only account can log in with Google again instead of giving a code
 * (`googleAgain`); `codeWaived` says it just did, and `focus` brings it back to this form.
 */
export function DeleteAccountForm({
  email,
  needsCode,
  codeWaived = false,
  googleAgain = false,
  focus = false,
}: {
  email: string
  needsCode: boolean
  codeWaived?: boolean
  googleAgain?: boolean
  focus?: boolean
}) {
  const [confirm, setConfirm] = useState("")
  const [code, setCode] = useState("")
  // Also turned on if the server asks for a code the page didn't know was needed.
  const [askCode, setAskCode] = useState(needsCode)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const matches = confirmsDeletion(confirm, email)
  const ready = matches && (!askCode || code.trim() !== "")

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!ready || pending) return
    setPending(true)
    setError(null)
    const result = await deleteAccount(email, confirm, askCode ? code : undefined)
    if (!result.ok) {
      if (result.needsCode) setAskCode(true)
      setError(result.error)
      setPending(false)
      return
    }
    // The account and this browser's copy are gone; end the session and go home. The mark lets the
    // home page say so in this tab only (lib/auth/deleted-notice.ts), not for anyone given the link.
    markAccountDeleted(tabStorage(), Date.now())
    await signOut({ redirectTo: "/?account=deleted" })
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} noValidate>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="confirm-delete">
              {/* One span, so the label's flex gap doesn't open spaces around the address. Only the address
                  may break anywhere (a long one would overflow on a phone); the words around it wrap normally. */}
              <span>
                Type <span className="font-semibold break-all text-foreground">{email}</span> to confirm
              </span>
            </FieldLabel>
            <Input
              id="confirm-delete"
              name="confirm"
              type="email"
              autoComplete="off"
              spellCheck={false}
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              aria-describedby="confirm-delete-help"
              disabled={pending}
              autoFocus={focus}
            />
            <FieldDescription id="confirm-delete-help">
              This can&apos;t be undone.
              {codeWaived && !askCode && " Two-step verification is on, but you logged in with Google a moment ago, so no code is needed."}
            </FieldDescription>
          </Field>
          {askCode && (
            <Field>
              <FieldLabel htmlFor="delete-code">Code from your authenticator app</FieldLabel>
              <Input
                id="delete-code"
                name="code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                autoComplete="one-time-code"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={24}
                className="figures max-w-56 text-lg tracking-widest"
                aria-describedby="delete-code-help"
                disabled={pending}
              />
              <FieldDescription id="delete-code-help">
                Two-step verification is on, so deleting needs a code: 6 digits from your app, or a recovery code.
              </FieldDescription>
            </Field>
          )}
          {error && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-[#a33b3b]">
              {error}
            </p>
          )}
          <Field>
            <Button
              type="submit"
              variant="destructive"
              size="lg"
              className="h-10 sm:w-fit"
              disabled={!ready || pending}
              aria-busy={pending}
            >
              {pending ? <LoaderCircleIcon className="animate-spin" aria-hidden="true" /> : <Trash2Icon aria-hidden="true" />}
              {pending ? "Deleting your account…" : "Delete my account"}
            </Button>
          </Field>
        </FieldGroup>
      </form>
      {askCode && googleAgain && (
        <div className="space-y-3 border-t pt-4">
          <p className="text-sm text-muted-foreground">No code? Log in with Google again and you can delete your account without one.</p>
          <GoogleAgainButton purpose="delete" />
        </div>
      )}
    </div>
  )
}
