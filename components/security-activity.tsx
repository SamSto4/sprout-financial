import Link from "next/link"
import {
  KeyRoundIcon,
  LogInIcon,
  LogOutIcon,
  MailIcon,
  ShieldCheckIcon,
  ShieldOffIcon,
  TriangleAlertIcon,
  UserPlusIcon,
  type LucideIcon,
} from "lucide-react"
import { cn } from "cn"

import type { SecurityActivity, SecurityEventType, SecurityLogRow, SecurityLogTone } from "@/lib/auth/security-log"

/** Rows shown before "Show older". The rest (up to MAX_ROWS) open in place, with no script. */
const VISIBLE_ROWS = 8

const ICONS: Record<SecurityEventType, LucideIcon> = {
  sign_in: LogInIcon,
  account_created: UserPlusIcon,
  password_wrong: TriangleAlertIcon,
  two_step_prompted: TriangleAlertIcon,
  two_step_failed: TriangleAlertIcon,
  two_step_on: ShieldCheckIcon,
  two_step_off: ShieldOffIcon,
  recovery_codes_replaced: KeyRoundIcon,
  password_reset_requested: MailIcon,
  password_changed: KeyRoundIcon,
  signed_out_everywhere: LogOutIcon,
}

// Color backs up the wording, never replaces it: every title says what happened.
const TONES: Record<SecurityLogTone, string> = {
  normal: "bg-secondary text-primary",
  attempt: "bg-warning/10 text-[#8a611b]",
  warning: "bg-destructive/10 text-[#a33b3b]",
}

const LINK = "font-medium text-primary underline-offset-4 hover:underline"

function ActivityRow({ row }: { row: SecurityLogRow }) {
  const Icon = ICONS[row.type]
  return (
    <li className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full", TONES[row.tone])}>
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{row.title}</p>
          <p className="text-sm break-words text-muted-foreground">{row.detail}</p>
        </div>
        <time dateTime={row.at} title={row.exact} className="shrink-0 text-xs text-muted-foreground sm:text-sm">
          {row.when}
        </time>
      </div>
    </li>
  )
}

/**
 * The Account page's "Recent security activity" list (rows from getSecurityActivity in
 * lib/auth/security-log-server.ts). A server component: the older rows open with <details>.
 */
export function SecurityActivityList({
  activity,
  hasPassword,
  canReset,
  suggestTwoStep,
}: {
  activity: SecurityActivity
  /** Null when the account couldn't be read: the advice line is left out. */
  hasPassword: boolean | null
  /** Password reset works on this server (passwordResetAvailable in lib/auth/reset-server.ts). */
  canReset: boolean
  /** Two-step verification is available, off, and the account has a password. */
  suggestTwoStep: boolean
}) {
  if (activity.status === "unavailable") {
    return (
      <p role="status" className="rounded-lg border bg-surface px-3 py-2 text-sm text-muted-foreground">
        Your recent activity couldn&apos;t be loaded just now. Refresh the page to try again.
      </p>
    )
  }

  const visible = activity.rows.slice(0, VISIBLE_ROWS)
  const older = activity.rows.slice(VISIBLE_ROWS)

  return (
    <div className="space-y-4">
      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-surface px-4 py-6 text-center text-sm text-muted-foreground">
          Nothing recorded yet. From now on, logins and changes to your security settings will show up here.
        </p>
      ) : (
        <ol className="divide-y" aria-label="Recent security activity">
          {visible.map((row) => (
            <ActivityRow key={row.key} row={row} />
          ))}
        </ol>
      )}

      {older.length > 0 && (
        <details className="rounded-lg border bg-surface px-4 py-3 text-sm">
          <summary className="cursor-pointer rounded-sm font-medium marker:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            Show {older.length} older {older.length === 1 ? "event" : "events"}
          </summary>
          <ol className="mt-3 divide-y" aria-label="Older security activity">
            {older.map((row) => (
              <ActivityRow key={row.key} row={row} />
            ))}
          </ol>
        </details>
      )}

      {hasPassword === true && canReset && (
        <p className="text-sm text-muted-foreground">
          Don&apos;t recognize something?{" "}
          <Link href="/forgot-password" className={LINK}>
            Choose a new password
          </Link>
          . That signs out every device, this one included.{suggestTwoStep && " Then turn on two-step verification above."}
        </p>
      )}
      {/* Without email there's no reset here, so the advice is the card below, which always works. */}
      {hasPassword === true && !canReset && (
        <p className="text-sm text-muted-foreground">
          Don&apos;t recognize something? Use Sign out everywhere below to end every session, this one included.
          {suggestTwoStep && " Then log in again and turn on two-step verification above."}
        </p>
      )}
      {hasPassword === false && (
        <p className="text-sm text-muted-foreground">
          Don&apos;t recognize something? You log in with Google, so check recent activity in your{" "}
          <a href="https://myaccount.google.com/security" className={LINK}>
            Google Account&apos;s security settings
          </a>
          , then use Sign out everywhere below.
        </p>
      )}
    </div>
  )
}
