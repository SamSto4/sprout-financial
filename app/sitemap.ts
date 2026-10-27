import type { MetadataRoute } from "next"
import { connection } from "next/server"

import { sitemapEntries } from "@/lib/seo/sitemap"
import { siteUrl } from "@/lib/site-url"

// /sitemap.xml: the home page, the course and every lesson, and the other public pages
// (lib/seo/pages.ts). Read per request so its addresses match the deployment. It runs no scripts,
// so it's served the same whether or not proxy.ts adds the page Content-Security-Policy to it.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection()
  return sitemapEntries(siteUrl(process.env))
}
