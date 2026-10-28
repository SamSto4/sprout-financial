// Page metadata for search engines and link previews, built from lib/seo/pages.ts. Pure so it can
// be unit-tested with `node --test` (seo.test.ts); app/layout.tsx and each page.tsx call it.
//
// How the pieces fit (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md):
// - The root layout sets metadataBase (the real site address), the title template, Open Graph and
//   Twitter defaults, and noindex on deployments search engines shouldn't list.
// - app/opengraph-image.tsx (and a lesson's own opengraph-image.tsx) add the share image.
// - Each page sets only its title, description and canonical path. Next.js copies the title and
//   description into og:title, og:description and the Twitter tags itself.
// - Pages never set `openGraph` or `twitter`: metadata merges shallowly, so a page's openGraph
//   replaces the layout's whole object, and the share image with it (seo.test.ts checks this).
// - The root layout never sets `alternates`: a canonical there would apply to every page that
//   doesn't set its own, including the noindex ones.

import type { Metadata } from "next"

import { SITE_NAME } from "../site.ts"
import { HOME_TITLE, PUBLIC_PAGES, TITLE_TEMPLATE, type PageSeo } from "./pages.ts"

/** A URL on this site, written the way Next.js writes canonical links (the home page has no trailing slash). */
export function absoluteUrl(base: string, path: string): string {
  return path === "/" ? base : `${base}${path}`
}

export type SiteMetadataOptions = {
  /** siteUrl(process.env) */
  base: string
  /** isIndexable(process.env) */
  indexable: boolean
  /** GOOGLE_SITE_VERIFICATION, the token Google Search Console gives for the HTML-tag method. */
  googleVerification?: string
}

/** Search Console tokens are URL-safe base64. Anything else is ignored rather than printed into every page. */
const VERIFICATION_TOKEN = /^[A-Za-z0-9_-]{10,100}$/

/** The root layout's metadata: the defaults every page inherits. */
export function siteMetadata({ base, indexable, googleVerification }: SiteMetadataOptions): Metadata {
  const token = googleVerification?.trim()
  return {
    metadataBase: new URL(base),
    title: { default: HOME_TITLE, template: TITLE_TEMPLATE },
    description: PUBLIC_PAGES.home.description,
    applicationName: SITE_NAME,
    openGraph: { type: "website", siteName: SITE_NAME, locale: "en_US" },
    twitter: { card: "summary_large_image" },
    ...(indexable ? {} : { robots: { index: false, follow: false } }),
    ...(token && VERIFICATION_TOKEN.test(token) ? { verification: { google: token } } : {}),
  }
}

/** A public page: its title, description and canonical URL. */
export function pageMetadata(page: PageSeo): Metadata {
  return {
    title: page.absoluteTitle ? { absolute: page.title } : page.title,
    description: page.description,
    alternates: { canonical: page.path },
  }
}

/** A page search engines shouldn't list (lib/seo/pages.ts NOINDEX_PATHS). Its links may still be followed. */
export function noindexMetadata(title: string, extra: Pick<Metadata, "referrer"> = {}): Metadata {
  return { title, robots: { index: false, follow: true }, ...extra }
}
