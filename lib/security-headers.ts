// Response headers sent on every page and API route (next.config.ts). Kept free of framework
// imports so it can be unit-tested with `node --test`.
//
// What each one stops:
// - frame-ancestors / X-Frame-Options: another site loading Sprout in a hidden frame to trick
//   someone into clicking (clickjacking) on the login or reset-password forms.
// - img-src / connect-src: the browser sending data to other servers. The app loads no outside
//   images and only calls its own /api routes; the chat already drops Markdown images
//   (lib/chat/markdown-safety.ts) and this is the second layer behind that.
//   vercel.live, vercel.com and Pusher are for Vercel's toolbar on preview deployments.
// - object-src / base-uri: old plugin content and <base> tag tricks.
// - nosniff: browsers guessing a file is a script when it isn't.
// - Strict-Transport-Security: browsers only ever using HTTPS for the site (ignored over plain
//   http, so localhost is unaffected). Vercel adds it to its own domains; this covers a custom domain.
//
// Not set on purpose: script-src and style-src. Next.js injects inline scripts and Recharts uses
// inline styles, so restricting them needs per-request nonces from a proxy (middleware), which would
// make every page dynamic. See https://nextjs.org/docs/app/guides/content-security-policy.

export const CONTENT_SECURITY_POLICY = [
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "img-src 'self' data: blob: https://vercel.live https://vercel.com",
  "connect-src 'self' https://vercel.live wss://ws-us3.pusher.com",
].join("; ")

export const SECURITY_HEADERS: { key: string; value: string }[] = [
  { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
]
