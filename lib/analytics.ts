// What Vercel Web Analytics is sent about a page view. Kept free of framework imports so it can be
// unit-tested with `node --test`; used by components/analytics.tsx.
//
// The script itself is served by Vercel at /_vercel/insights/script.js, so it exists only on a
// Vercel deployment; anywhere else (next start on another host) every page would request it, get a
// 404 and log two console errors. The root layout mounts it only where analyticsAvailable() says.
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

/** Whether Vercel serves the analytics script here: on Vercel (VERCEL=1), at build and at run time. */
export function analyticsAvailable(env: Record<string, string | undefined>): boolean {
  return env.VERCEL === "1"
}
