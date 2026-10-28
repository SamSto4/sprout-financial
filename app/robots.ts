import type { MetadataRoute } from "next"
import { connection } from "next/server"

import { robotsFile } from "@/lib/seo/sitemap"
import { isIndexable, siteUrl } from "@/lib/site-url"

// /robots.txt. Read per request like every page (app/layout.tsx), so a build promoted from preview
// to production answers for where it runs now. Plain text that runs no scripts, so it's served the
// same whether or not proxy.ts adds the page Content-Security-Policy to it.
export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection()
  return robotsFile({ base: siteUrl(process.env), indexable: isIndexable(process.env) })
}
