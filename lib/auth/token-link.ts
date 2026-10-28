// Links in reset and sign-up emails, and how their one-time token gets from the link to the form.
// Kept free of framework imports so it can be unit-tested with `node --test`.
//
// An emailed link has to carry its token in the URL. The link goes to /reset-password/open (or
// /verify-email/open), which puts the token in a short-lived cookie and redirects to the page
// without it. So the token isn't left in the address bar (a screen share, a copied URL, the browser
// history's visible entry), and the page's own requests (the form's posts, analytics page views)
// never carry it in their URL. Only that first request does, which no link can avoid.
// Works without JavaScript: it's a plain redirect, and the page reads the cookie on the server.
// Since the page's address never holds the token, the page needs no "no-referrer" policy, which
// would make browsers send "Origin: null" with a form posted without JavaScript, and Next.js
// refuses a server action from an origin it can't match.
//
// The cookie is HttpOnly, SameSite=Lax (a Strict cookie set while following a link from a webmail
// page wouldn't be sent on the redirect it causes), sent only to its own page, and lasts as long as
// the link does. It's left to expire after use: the token itself works once, and clearing it would
// make the page forget the form's "done" state when it refreshes after the action.

import { isResetTokenShape, RESET_TOKEN_TTL_MINUTES } from "./reset.ts"
import { VERIFY_LINK_TTL_HOURS } from "./verify.ts"

export type TokenLinkKind = "reset" | "verify"

/** Pages that read a token from these links. The emailed links (resetLink, verifyLink) are <page>/open?token=. */
export const TOKEN_LINK_PAGES = { reset: "/reset-password", verify: "/verify-email" } as const

const MAX_AGE_SECONDS: Record<TokenLinkKind, number> = {
  reset: RESET_TOKEN_TTL_MINUTES * 60,
  verify: VERIFY_LINK_TTL_HOURS * 60 * 60,
}

/** "__Secure-" makes the browser refuse the cookie unless it was set over HTTPS with Secure. */
export function tokenLinkCookieName(kind: TokenLinkKind, secure: boolean): string {
  return `${secure ? "__Secure-" : ""}sprout-${kind}-link`
}

/** The Set-Cookie header value that carries a token from the link to its page. */
export function tokenLinkCookie(kind: TokenLinkKind, token: string, secure: boolean): string {
  return [
    `${tokenLinkCookieName(kind, secure)}=${token}`,
    `Path=${TOKEN_LINK_PAGES[kind]}`,
    `Max-Age=${MAX_AGE_SECONDS[kind]}`,
    "HttpOnly",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ")
}

/**
 * The response for GET <page>/open?token=...: a redirect to the page, with the token in a cookie
 * when it has the right shape (otherwise the page shows that the link doesn't work). The page is a
 * relative address, so it never depends on the request's Host header.
 */
export function openTokenLink(requestUrl: string, kind: TokenLinkKind, secure: boolean): Response {
  const token = new URL(requestUrl).searchParams.get("token")
  const headers = new Headers({ Location: TOKEN_LINK_PAGES[kind], "Cache-Control": "no-store" })
  if (isResetTokenShape(token)) headers.append("Set-Cookie", tokenLinkCookie(kind, token, secure))
  return new Response(null, { status: 303, headers })
}

/**
 * Where to send a page opened with ?token= in its address (a link emailed before links went
 * through /open): through /open as well, so the token leaves the address the same way. Null when
 * there's no usable token in the address.
 */
export function legacyLinkRedirect(kind: TokenLinkKind, fromQuery: unknown): string | null {
  return isResetTokenShape(fromQuery) ? `${TOKEN_LINK_PAGES[kind]}/open?token=${fromQuery}` : null
}

/** The page's token, from the cookie the link set. Null when it's missing or doesn't have the right shape. */
export function pageToken(fromCookie: unknown): string | null {
  return isResetTokenShape(fromCookie) ? fromCookie : null
}
