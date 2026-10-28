// Emails that tell the account owner about a security change, sent through lib/email/send.ts by
// sendSecurityNoticeLater in security-log-server.ts. Pure, so the wording can be unit-tested.
//
// They never include a code, recovery code, secret, token, IP address, raw user agent or any of the
// person's financial data, and their only links are plain pages on this site (built from siteUrl(),
// never the request's Host header). No link signs anyone in or changes anything by being opened.

import { formatDateTimeUtc } from "../format.ts"
import { deviceLabel, locationLabel, type RequestContext } from "./security-log.ts"

export type SecurityNoticeKind =
  | "two_step_on"
  | "two_step_off"
  | "password_changed"
  | "recovery_code_login"
  | "two_step_attempts"
  | "two_step_code_attempts"

export type SecurityNotice = {
  kind: SecurityNoticeKind
  at: Date
  context: RequestContext
  /** siteUrl(process.env) */
  base: string
  /** Whether the account has a password (Google-only accounts get different advice). */
  hasPassword: boolean
}

export type SecurityEmail = { to: string; subject: string; text: string; html: string }

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)
}

const WRAP = "font-family:system-ui,sans-serif;color:#18352A;max-width:480px"
const MUTED = "color:#60756A;font-size:14px"

/** Plain text and HTML from the same paragraphs, so the two can't say different things. */
type Block = { text: string; html: string }
const para = (text: string): Block => ({ text, html: `<p>${escapeHtml(text)}</p>` })
const linkPara = (before: string, label: string, url: string, after = ""): Block => ({
  text: `${before}${label}: ${url}${after ? `\n${after}` : ""}`,
  html: `<p>${escapeHtml(before)}<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>.${after ? ` ${escapeHtml(after)}` : ""}</p>`,
})

function detailsBlock(at: Date, context: RequestContext): Block {
  const lines = [`When: ${formatDateTimeUtc(at)}`, `Device: ${deviceLabel(context)}`]
  const place = locationLabel(context)
  if (place) lines.push(`Approximate location: ${place}`)
  return { text: lines.join("\n"), html: `<p style="${MUTED}">${lines.map(escapeHtml).join("<br>")}</p>` }
}

function render(to: string, subject: string, blocks: Block[]): SecurityEmail {
  return {
    to,
    subject,
    text: blocks.map((block) => block.text).join("\n\n"),
    html: `<div style="${WRAP}">\n${blocks.map((block) => block.html).join("\n")}\n</div>`,
  }
}

export function securityNoticeEmail(to: string, notice: SecurityNotice): SecurityEmail {
  const account = `${notice.base}/account`
  const forgot = `${notice.base}/forgot-password`
  const details = detailsBlock(notice.at, notice.context)
  const seeLog = para("Your account page lists recent logins and security changes.")

  if (notice.kind === "two_step_on") {
    // Someone holding a signed-in browser could have done it: the owner needs to know straight away,
    // because from now on deleting the account or turning this off needs that person's authenticator.
    return render(to, "Two-step verification was turned on for your Sprout account", [
      para(
        notice.hasPassword
          ? "Two-step verification was turned on for your Sprout account, so logging in with your password now also needs a code from an authenticator app."
          : "Two-step verification was turned on for your Sprout account, so deleting the account or turning two-step verification off now needs a code from an authenticator app."
      ),
      details,
      para("If this was you, keep your recovery codes somewhere safe. There's nothing else to do."),
      notice.hasPassword
        ? linkPara("If it wasn't you, someone else knows your password and is logged in to your account. ", "Choose a new password", forgot, "That signs out every device.")
        : linkPara(
            "If it wasn't you, someone else is logged in to your account. End their session with Sign out everywhere on ",
            "your account page",
            account,
            "Then log in with Google again and turn two-step verification off there: a Google login from the last few minutes works in place of a code."
          ),
      seeLog,
    ])
  }

  if (notice.kind === "two_step_code_attempts") {
    return render(to, "Wrong two-step codes were entered while logged in to your Sprout account", [
      para(
        "Someone logged in to your Sprout account entered several wrong two-step verification codes, trying to delete the account, turn two-step verification off or make new recovery codes. Nothing was changed, and no more codes are accepted for a while."
      ),
      details,
      para("If this was you, wait a little, then use the newest code from your authenticator app or one of your recovery codes."),
      linkPara("If it wasn't you, someone else is logged in to your account. End their session with Sign out everywhere on ", "your account page", account),
      notice.hasPassword
        ? linkPara("If they might know your password, ", "choose a new password", forgot)
        : para("Then check the security settings of the Google account you log in with."),
      seeLog,
    ])
  }

  if (notice.kind === "two_step_off") {
    return render(to, "Two-step verification was turned off for your Sprout account", [
      para("Two-step verification was turned off for your Sprout account, so a code from your authenticator app is no longer needed."),
      details,
      para("If this was you, there's nothing else to do."),
      notice.hasPassword
        ? linkPara("If it wasn't you, someone else may be logged in to your account. ", "Choose a new password", forgot, "That signs out every device. Then log in and turn two-step verification back on from your account page.")
        : linkPara("If it wasn't you, check the security settings of the Google account you log in with, then turn two-step verification back on from ", "your account page", account),
      seeLog,
    ])
  }

  if (notice.kind === "password_changed") {
    return render(to, "Your Sprout password was changed", [
      para("The password for your Sprout account was changed with a reset link sent to this address. Every device that was logged in will need to log in again."),
      details,
      para("If this was you, there's nothing else to do."),
      linkPara("If it wasn't you, someone was able to open email sent to this address. Change your email account's password first, then ", "choose a new Sprout password", forgot),
      seeLog,
    ])
  }

  if (notice.kind === "two_step_attempts") {
    // Only password logins ask for a code, so this account has a password.
    return render(to, "Wrong two-step codes were entered for your Sprout account", [
      para(
        "Someone entered your Sprout password correctly, then several wrong two-step verification codes. Your account is still protected: logging in with your password is paused for a while."
      ),
      details,
      para("If this was you, wait a little, then use the newest code from your authenticator app or one of your recovery codes."),
      linkPara(
        "If it wasn't you, someone knows your password. ",
        "Choose a new password",
        forgot,
        "That signs out every device and lets you log in again straight away. Two-step verification stays on."
      ),
      seeLog,
    ])
  }

  return render(to, "A recovery code was used to log in to Sprout", [
    para("Someone logged in to your Sprout account with your password and one of your recovery codes. That code won't work again."),
    details,
    linkPara("If this was you, for example because you don't have your phone, you can make new recovery codes on ", "your account page", account),
    linkPara("If it wasn't you, someone has your password and at least one recovery code. ", "Choose a new password", forgot, "That signs out every device. Then log in and make new recovery codes, which stops the old ones working."),
  ])
}
