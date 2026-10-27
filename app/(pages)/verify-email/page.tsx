import type { Metadata } from "next"
import Link from "next/link"

import { AuthCard } from "@/components/auth-card"
import { buttonVariants } from "@/components/ui/button"
import { VerifyEmailForm } from "@/components/verify-email-form"
import { isResetTokenShape } from "@/lib/auth/reset"
import { noindexMetadata } from "@/lib/seo/metadata"

// no-referrer: the token is in this page's address, so it must not leak to any link it opens.
export const metadata: Metadata = noindexMetadata("Confirm your email", { referrer: "no-referrer" })

export default async function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  const { token } = await searchParams
  return (
    <AuthCard>
      {isResetTokenShape(token) ? (
        <VerifyEmailForm token={token} />
      ) : (
        <div className="flex flex-col items-center gap-4 text-center">
          <h1 className="text-2xl font-semibold">This link doesn&apos;t work</h1>
          <p className="text-sm text-muted-foreground">
            The confirmation link is incomplete. Try copying the whole link from the email, or sign up again to get a new
            one.
          </p>
          <Link href="/login?mode=signup" className={buttonVariants({ size: "lg", className: "h-10 w-full" })}>
            Sign up again
          </Link>
        </div>
      )}
    </AuthCard>
  )
}
