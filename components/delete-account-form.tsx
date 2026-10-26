"use client"

import { useState } from "react"
import { signOut } from "next-auth/react"
import { LoaderCircleIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { confirmsDeletion } from "@/lib/auth/account-deletion"
import { deleteAccount } from "@/lib/sync/account-sync"

/**
 * Deletes the account after the person types their email. No browser confirm() dialog: typing the
 * address is the confirmation, and the button stays disabled until it matches.
 */
export function DeleteAccountForm({ email }: { email: string }) {
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const matches = confirmsDeletion(confirm, email)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!matches || pending) return
    setPending(true)
    setError(null)
    const result = await deleteAccount(email, confirm)
    if (!result.ok) {
      setError(result.error)
      setPending(false)
      return
    }
    // The account and this browser's copy are gone; end the session and go home.
    await signOut({ redirectTo: "/?account=deleted" })
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="confirm-delete">
            {/* One span, so the label's flex gap doesn't open spaces around the address. */}
            <span className="break-all">
              Type <span className="font-semibold text-foreground">{email}</span> to confirm
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
          />
          <FieldDescription id="confirm-delete-help">This can&apos;t be undone.</FieldDescription>
        </Field>
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
            disabled={!matches || pending}
            aria-busy={pending}
          >
            {pending ? <LoaderCircleIcon className="animate-spin" aria-hidden="true" /> : <Trash2Icon aria-hidden="true" />}
            {pending ? "Deleting your account…" : "Delete my account"}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  )
}
