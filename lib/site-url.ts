// The site's public address, and whether search engines may index this deployment. The
// environment is passed in so both can be unit-tested with `node --test` (site-url.test.ts).
// Used for links in emails (lib/auth/*), page metadata and structured data (app/layout.tsx,
// lib/seo/*), robots.txt and the sitemap.

type Env = Record<string, string | undefined>

/**
 * SITE_URL as an origin ("https://sprout.example"), or null if it's anything else: a path, query,
 * user name, or a host with characters a domain can't have. It ends up in emails, <link> tags and
 * XML, so only plain addresses are accepted.
 */
function configuredOrigin(value: string | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") return null
  if (!/^[a-z0-9.-]+$/.test(url.hostname)) return null
  return url.origin
}

/**
 * The site's own address, without a trailing slash. Never taken from the request's Host header,
 * which a visitor controls: a forged one would email people a "reset" link to someone else's site,
 * or point canonical links at another domain.
 */
export function siteUrl(env: Env): string {
  const configured = configuredOrigin(env.SITE_URL)
  if (configured) return configured
  // Vercel sets these. Previews get their own address so the flow can be tried before release.
  if (env.VERCEL_ENV === "preview" && env.VERCEL_URL) return `https://${env.VERCEL_URL}`
  if (env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`
  return "http://localhost:3000"
}

/**
 * Whether search engines may index this deployment: Vercel production, or a production build
 * hosted somewhere else. Preview deployments (which may run against test data) and `next dev`
 * are kept out of search results.
 */
export function isIndexable(env: Env): boolean {
  if (env.VERCEL_ENV) return env.VERCEL_ENV === "production"
  return env.NODE_ENV === "production"
}
