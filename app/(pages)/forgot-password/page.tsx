import type { Metadata } from "next"
import { connection } from "next/server"

import { AuthCard } from "@/components/auth-card"
import { ForgotPasswordForm } from "@/components/password-reset-forms"
import { isDatabaseConfigured } from "@/lib/db/mongodb"
import { isEmailConfigured } from "@/lib/email/send"
import { noindexMetadata } from "@/lib/seo/metadata"

export const metadata: Metadata = noindexMetadata("Reset your password")

export default async function ForgotPasswordPage() {
  // Read the email settings per request, not once at build time.
  await connection()
  const available = isDatabaseConfigured() && (process.env.NODE_ENV !== "production" || isEmailConfigured())
  return (
    <AuthCard>
      {available ? (
        <ForgotPasswordForm />
      ) : (
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold">Password reset isn&apos;t available here</h1>
          <p className="text-sm text-muted-foreground">
            Password reset isn&apos;t set up on this server yet. If you signed up with Google, use Continue with Google on the
            login page.
          </p>
        </div>
      )}
    </AuthCard>
  )
}
