// Response headers. Kept free of framework imports so it can be unit-tested with `node --test`.
//
// Two Content-Security-Policies, never both on one response:
// - pageContentSecurityPolicy(): every page, and every other path proxy.ts runs on (public files,
//   not-found pages at any URL), set per request with a fresh nonce.
// - CONTENT_SECURITY_POLICY: the few paths the proxy skips (UNPROXIED_PATHS: API routes, build
//   files, the image optimizer, Vercel's scripts, the favicon), from next.config.ts. Nothing there
//   is a page, so it allows no scripts at all: a not-found page rendered at one of those paths
//   (/api/nope) shows as plain HTML, and its links do full navigations, which get the page policy.
//
// What the page policy stops:
// - script-src: a script injected into a page (through a rendering bug that lets a chat reply, an
//   imported file or a web page's text become HTML) running with the person's session and their
//   finances in local storage. Only scripts carrying this request's nonce (Next.js tags its own) or loaded
//   from this site can run. No 'strict-dynamic': the app loads no outside scripts, so anything a
//   script adds must also come from this site. This is why every page renders per request
//   (app/layout.tsx): a page built ahead of time has scripts without the nonce.
// - default-src / connect-src / img-src / font-src / frame-src: the browser loading anything from,
//   or sending data to, another server. Images may also be data: and blob: (icons, QR codes,
//   screenshots being prepared for import). The chat already drops Markdown images
//   (lib/chat/markdown-safety.ts); this is the second layer behind that.
// - form-action: forms posting anywhere but this site, or Google sign-in's redirect.
// - frame-ancestors / X-Frame-Options: another site loading Sprout in a hidden frame to trick
//   someone into clicking (clickjacking) on the login or reset-password forms.
// - object-src / base-uri: old plugin content and <base> tag tricks.
// Not restricted: inline styles ('unsafe-inline' in style-src). Many components and the charts set
// style="" attributes, which a nonce can't cover. A style can't run code, and the img-src,
// font-src and connect-src limits stop CSS from sending anything to another server.
//
// To use an outside service from the browser (Plaid Link, for example), add its exact hosts to
// the directives it needs here, with a test. Don't widen to https:.
//
// Other headers:
// - nosniff: browsers guessing a file is a script when it isn't. It also stops a JSON reply from
//   one of the API routes being run as a script, which script-src's 'self' would otherwise allow.
// - Strict-Transport-Security: browsers only ever using HTTPS for the site (ignored over plain
//   http, so localhost is unaffected). Vercel adds it to its own domains; this covers a custom domain.

/** Hosts Vercel's toolbar needs on preview deployments (vercel.com/docs/vercel-toolbar/managing-toolbar). */
const TOOLBAR = {
  script: ["https://vercel.live"],
  style: ["https://vercel.live"],
  img: ["https://vercel.live", "https://vercel.com"],
  font: ["https://vercel.live", "https://assets.vercel.com"],
  connect: ["https://vercel.live", "wss://ws-us3.pusher.com"],
  frame: ["https://vercel.live"],
}

export type PagePolicyOptions = {
  /** From newNonce(), fresh for each request. */
  nonce: string
  /** Development: React needs eval for its error overlay, and under `vercel dev` (VERCEL=1) Vercel Analytics loads its debug script. */
  development?: boolean
  /** A Vercel preview deployment, which shows Vercel's toolbar. */
  preview?: boolean
}

const NONCE = /^[A-Za-z0-9+/]{22,}={0,2}$/

/** 16 random bytes, base64: unguessable, and new for every page request. */
export function newNonce(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))))
}

/** The Content-Security-Policy for a page, with this request's nonce. */
export function pageContentSecurityPolicy({ nonce, development = false, preview = false }: PagePolicyOptions): string {
  // The nonce goes into a header, so refuse anything that could add a directive.
  if (!NONCE.test(nonce)) throw new Error("A page nonce must be base64 from newNonce().")
  const extra = (hosts: string[]) => (preview ? hosts : [])
  const directives: [string, ...string[]][] = [
    ["default-src", "'self'"],
    [
      "script-src",
      "'self'",
      `'nonce-${nonce}'`,
      ...(development ? ["'unsafe-eval'", "https://va.vercel-scripts.com"] : []),
      ...extra(TOOLBAR.script),
    ],
    ["style-src", "'self'", "'unsafe-inline'", ...extra(TOOLBAR.style)],
    ["img-src", "'self'", "data:", "blob:", ...extra(TOOLBAR.img)],
    ["font-src", "'self'", ...extra(TOOLBAR.font)],
    ["connect-src", "'self'", ...extra(TOOLBAR.connect)],
    ["frame-src", ...(preview ? TOOLBAR.frame : ["'none'"])],
    ["object-src", "'none'"],
    ["base-uri", "'none'"],
    ["form-action", "'self'", "https://accounts.google.com"],
    ["frame-ancestors", "'none'"],
  ]
  return directives.map((parts) => parts.join(" ")).join("; ")
}

/**
 * The paths proxy.ts doesn't run on, as next.config.ts header sources. They get
 * CONTENT_SECURITY_POLICY; every other path gets the page policy from the proxy. Keep this and the
 * proxy's matcher in step (lib/proxy.test.ts checks that each path gets exactly one policy).
 */
export const UNPROXIED_PATHS = ["/api/:path*", "/_next/static/:path*", "/_next/image", "/_vercel/:path*", "/favicon.ico"]

/** For UNPROXIED_PATHS: no scripts, no requests, no forms elsewhere; only the site's own styles, images and fonts. */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'none'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'none'",
].join("; ")

/** On every response. The Content-Security-Policy comes from the proxy or UNPROXIED_PATHS instead. */
export const SECURITY_HEADERS: { key: string; value: string }[] = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
]

/** next.config.ts's `headers()`. */
export function headerRules(): { source: string; headers: { key: string; value: string }[] }[] {
  return [
    { source: "/:path*", headers: SECURITY_HEADERS },
    ...UNPROXIED_PATHS.map((source) => ({ source, headers: [{ key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY }] })),
  ]
}
