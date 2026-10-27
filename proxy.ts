import { NextResponse, type NextRequest } from "next/server"

import { newNonce, pageContentSecurityPolicy } from "@/lib/security-headers"

// Gives every page (and every other response but the build's files; see the matcher below) a
// Content-Security-Policy with a fresh nonce, so only scripts Next.js rendered for this request (it
// tags them with the nonce) or files from this site can run. What the policy allows and why is in
// lib/security-headers.ts.
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
    // Every path but the build's own files, the image optimizer, Vercel's scripts and the favicon,
    // so no HTML is ever served without this policy: not a page, not a not-found page at a made-up
    // URL (/learn/x.txt, /api/nope), not a prefetch. A policy on only some pages wouldn't hold,
    // because the browser keeps the first page's policy for the whole visit. API replies and public
    // files get it too, which does nothing on JSON, a CSV or an image. The skipped paths get the
    // script-free fallback policy from next.config.ts instead (UNPROXIED_PATHS in
    // lib/security-headers.ts, which must list exactly these; lib/proxy.test.ts checks).
    "/((?!_next/static/|_next/image$|_vercel/|favicon\\.ico$).*)",
  ],
}
