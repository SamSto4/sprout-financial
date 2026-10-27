// What Vercel Web Analytics is sent about a page view. Kept free of framework imports so it can be
// unit-tested with `node --test`; used by components/analytics.tsx.
//
// The analytics script reports each page's full URL. A query string or fragment can carry a secret
// (a reset or sign-up link's token, if one is ever opened directly) or what someone typed (the
// assistant's ?q= question), and the dashboard only needs the page, so both are dropped before the
// event leaves the browser.

/** The URL without its query string or fragment. */
export function redactAnalyticsUrl(url: string): string {
  return url.split(/[?#]/, 1)[0]
}

/** For the Analytics component's beforeSend: the same event with its URL redacted. */
export function redactAnalyticsEvent<T extends { url: string }>(event: T): T {
  return { ...event, url: redactAnalyticsUrl(event.url) }
}
