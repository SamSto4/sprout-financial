import type { Metadata } from "next"

import { Landing } from "@/components/home/landing"
import { SignedInHome } from "@/components/home/signed-in-home"
import { JsonLd } from "@/components/json-ld"
import { viewerEmail } from "@/lib/auth/session"
import { homeJsonLd } from "@/lib/seo/json-ld"
import { pageMetadata } from "@/lib/seo/metadata"
import { PUBLIC_PAGES } from "@/lib/seo/pages"
import { siteFeatures } from "@/lib/site-features"
import { siteUrl } from "@/lib/site-url"

// Title, description and canonical link (lib/seo/pages.ts). `/?account=deleted` gets canonical `/`.
export const metadata: Metadata = pageMetadata(PUBLIC_PAGES.home)

// Signed-out visitors (and search engines) get an introduction to Sprout; signed-in visitors get
// their next steps. The session is read on the server, so there's no flash of the wrong page.
export default async function HomePage({ searchParams }: PageProps<"/">) {
  const [{ account }, email] = await Promise.all([searchParams, viewerEmail()])
  const features = siteFeatures()
  // The site and its publisher (lib/seo/json-ld.ts), the same whoever is signed in.
  const structuredData = <JsonLd data={homeJsonLd(siteUrl(process.env))} />
  if (email) {
    return (
      <>
        {structuredData}
        <SignedInHome syncs={features.accounts} />
      </>
    )
  }
  return (
    <>
      {structuredData}
      {/* Set by the account page after a deletion (components/delete-account-form.tsx). */}
      <Landing features={features} accountDeleted={account === "deleted"} />
    </>
  )
}
