import "server-only"

// Sends transactional email (password resets) through Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email).
// Plain fetch, no SDK. Settings:
//   RESEND_API_KEY  required to send
//   EMAIL_FROM      e.g. "Sprout <hello@yourdomain.com>", on a domain verified in Resend.
//                   Without it, Resend's test sender is used, which only delivers to the
//                   Resend account owner's own address.

const RESEND_URL = "https://api.resend.com/emails"
const TEST_SENDER = "Sprout <onboarding@resend.dev>"

export type OutgoingEmail = { to: string; subject: string; text: string; html: string }

export function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY)
}

export class EmailError extends Error {}

export async function sendEmail(email: OutgoingEmail): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    // Lets the reset flow be tried locally: the link appears in the dev server's terminal.
    if (process.env.NODE_ENV !== "production") {
      console.log(`[email not configured] To: ${email.to}\nSubject: ${email.subject}\n\n${email.text}`)
      return
    }
    throw new EmailError("Email isn't configured (RESEND_API_KEY is not set).")
  }

  let response: Response
  try {
    response = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || TEST_SENDER,
        to: [email.to],
        subject: email.subject,
        text: email.text,
        html: email.html,
      }),
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new EmailError("The email service didn't respond.")
  }
  if (!response.ok) {
    // Resend explains problems (unverified domain, bad key) in the body. Never log the recipient.
    const detail = await response.text().catch(() => "")
    throw new EmailError(`The email service refused the message (${response.status}): ${detail.slice(0, 200)}`)
  }
}
