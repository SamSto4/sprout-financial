import type { ReactNode } from "react"

import { Card, CardContent } from "@/components/ui/card"

/** The centred card used by the login, forgot-password and reset-password pages. */
export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
      <Card className="w-full max-w-sm shadow-[0_1px_2px_rgb(24_53_42/0.04),0_16px_40px_-20px_rgb(24_53_42/0.25)]">
        <CardContent className="p-6 sm:p-8">{children}</CardContent>
      </Card>
    </main>
  )
}
