import type { Metadata } from "next"
import Link from "next/link"

import { AuthCard } from "@/components/auth-card"
import { ResetPasswordForm } from "@/components/password-reset-forms"
import { buttonVariants } from "@/components/ui/button"
import { isResetTokenShape } from "@/lib/auth/reset"
import { noindexMetadata } from "@/lib/seo/metadata"

export const metadata: Metadata = noindexMetadata("Choose a new password", { referrer: "no-referrer" })

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token } = await searchParams
  return (
    <AuthCard>
      {isResetTokenShape(token) ? (
        <ResetPasswordForm token={token} />
      ) : (
        <div className="flex flex-col items-center gap-4 text-center">
          <h1 className="text-2xl font-semibold">This link doesn&apos;t work</h1>
          <p className="text-sm text-muted-foreground">
            The reset link is incomplete. Try copying the whole link from the email, or ask for a new one.
          </p>
          <Link href="/forgot-password" className={buttonVariants({ size: "lg", className: "h-10 w-full" })}>
            Get a new reset link
          </Link>
        </div>
      )}
    </AuthCard>
  )
}
