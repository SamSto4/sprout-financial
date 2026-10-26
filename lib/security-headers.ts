// Response headers. Kept free of framework imports so it can be unit-tested with `node --test`.
//
// Two Content-Security-Policies:
// - pageContentSecurityPolicy(): every page, set per request by proxy.ts with a fresh nonce.
// - CONTENT_SECURITY_POLICY: everything else (API routes, public files), from next.config.ts.
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
  /** `next dev`: React needs eval for its error overlay, and Vercel Analytics loads its debug script. */
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

/** API routes and public files: they run no scripts, so this only keeps them out of frames and plugins. */
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
