// robots.txt and sitemap.xml contents (app/robots.ts, app/sitemap.ts). Pure so they can be
// unit-tested with `node --test` (seo.test.ts).

import type { MetadataRoute } from "next"

import { LESSONS } from "../learn/course.ts"
import { absoluteUrl } from "./metadata.ts"
import { lessonSeo, PUBLIC_PAGES } from "./pages.ts"

/** Every public page, with the lessons in course order right after /learn. */
export function sitemapPaths(): string[] {
  return Object.values(PUBLIC_PAGES).flatMap((page): string[] =>
    page.path === "/learn" ? [page.path, ...LESSONS.map((lesson) => lessonSeo(lesson).path)] : [page.path]
  )
}

/**
 * Only <loc> for each page. No lastModified: nothing records when a page's content last changed,
 * and the build time would claim every page changed on every deploy. No priority or changeFrequency:
 * Google ignores both.
 */
export function sitemapEntries(base: string): MetadataRoute.Sitemap {
  return sitemapPaths().map((path) => ({ url: absoluteUrl(base, path) }))
}

/**
 * Production: crawl everything but the API (JSON for the app's own pages, much of it behind sign-in
 * or rate limits), and here's the sitemap. Noindex pages stay crawlable so their noindex is seen.
 * Anywhere else (previews, `next dev`): crawl nothing. Pages there also carry noindex (siteMetadata).
 */
export function robotsFile({ base, indexable }: { base: string; indexable: boolean }): MetadataRoute.Robots {
  if (!indexable) return { rules: [{ userAgent: "*", disallow: "/" }] }
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: "/api/" }],
    sitemap: `${base}/sitemap.xml`,
  }
}
