import type { Metadata } from "next"
import { cookies } from "next/headers"
import Link from "next/link"
import { redirect } from "next/navigation"

import { AuthCard } from "@/components/auth-card"
import { buttonVariants } from "@/components/ui/button"
import { VerifyEmailForm } from "@/components/verify-email-form"
import { legacyLinkRedirect, pageToken, tokenLinkCookieName } from "@/lib/auth/token-link"
import { noindexMetadata } from "@/lib/seo/metadata"

// No token is ever in this page's address (emailed links go through /verify-email/open); see the
// reset-password page for why there's no referrer policy.
export const metadata: Metadata = noindexMetadata("Confirm your email")

export default async function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  // Emailed links go through /verify-email/open, which leaves the token in a cookie for this page,
  // so the address never holds it (lib/auth/token-link.ts). A link sent before that goes the same way.
  const legacy = legacyLinkRedirect("verify", (await searchParams).token)
  if (legacy) redirect(legacy)
  const token = pageToken((await cookies()).get(tokenLinkCookieName("verify", process.env.NODE_ENV === "production"))?.value)
  return (
    <AuthCard>
      {token ? (
        <VerifyEmailForm token={token} />
      ) : (
        <div className="flex flex-col items-center gap-4 text-center">
          <h1 className="text-2xl font-semibold">This link doesn&apos;t work</h1>
          <p className="text-sm text-muted-foreground">
            The confirmation link is incomplete or has expired. Open the whole link from the email in this browser, or
            sign up again to get a new one.
          </p>
          <Link href="/login?mode=signup" className={buttonVariants({ size: "lg", className: "h-10 w-full" })}>
            Sign up again
          </Link>
        </div>
      )}
    </AuthCard>
  )
}
