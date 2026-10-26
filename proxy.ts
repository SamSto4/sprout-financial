import { NextResponse, type NextRequest } from "next/server"

import { newNonce, pageContentSecurityPolicy } from "@/lib/security-headers"

// Gives every page a Content-Security-Policy with a fresh nonce, so only scripts Next.js rendered
// for this request (it tags them with the nonce) or files from this site can run. What the policy
// allows and why is in lib/security-headers.ts.
export function proxy(request: NextRequest) {
  const policy = pageContentSecurityPolicy({
    nonce: newNonce(),
    development: process.env.NODE_ENV === "development",
    preview: process.env.VERCEL_ENV === "preview",
  })
  // Next.js reads the nonce from the request's copy of the header while rendering the page.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("Content-Security-Policy", policy)
  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set("Content-Security-Policy", policy)
  return response
}

export const config = {
  matcher: [
    {
      // Pages only. API routes, build files and public files run no scripts; next.config.ts gives
      // them the plain headers. Prefetches are skipped: they carry no HTML, only page data.
      source: "/((?!api/|_next/static|_next/image|_vercel|favicon\\.ico|.*\\.(?:csv|svg|png|jpg|ico|txt|xml)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
}
