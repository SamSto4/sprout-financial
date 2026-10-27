import type { Metadata } from "next"
import { cookies } from "next/headers"
import Link from "next/link"
import { redirect } from "next/navigation"

import { AuthCard } from "@/components/auth-card"
import { ResetPasswordForm } from "@/components/password-reset-forms"
import { buttonVariants } from "@/components/ui/button"
import { legacyLinkRedirect, pageToken, tokenLinkCookieName } from "@/lib/auth/token-link"
import { noindexMetadata } from "@/lib/seo/metadata"

// No token is ever in this page's address (emailed links go through /reset-password/open), so no
// referrer policy is needed; no-referrer would also make a form posted without JavaScript send
// Origin: null, which Next.js refuses as a cross-site server action.
export const metadata: Metadata = noindexMetadata("Choose a new password")

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  // Emailed links go through /reset-password/open, which leaves the token in a cookie for this page,
  // so the address never holds it (lib/auth/token-link.ts). A link sent before that goes the same way.
  const legacy = legacyLinkRedirect("reset", (await searchParams).token)
  if (legacy) redirect(legacy)
  const token = pageToken((await cookies()).get(tokenLinkCookieName("reset", process.env.NODE_ENV === "production"))?.value)
  return (
    <AuthCard>
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <div className="flex flex-col items-center gap-4 text-center">
          <h1 className="text-2xl font-semibold">This link doesn&apos;t work</h1>
          <p className="text-sm text-muted-foreground">
            The reset link is incomplete or has expired. Open the whole link from the email in this browser, or ask for
            a new one.
          </p>
          <Link href="/forgot-password" className={buttonVariants({ size: "lg", className: "h-10 w-full" })}>
            Get a new reset link
          </Link>
        </div>
      )}
    </AuthCard>
  )
}
