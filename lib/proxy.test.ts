// Which responses get which Content-Security-Policy. proxy.ts's matcher is read the way Next.js's
// build reads it (statically, with its own parser and matcher compiler), so this tests what the
// server actually runs, not a copy of path-to-regexp's rules.

import assert from "node:assert/strict"
import { createRequire } from "node:module"
import path from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"

import { CONTENT_SECURITY_POLICY, headerRules } from "./security-headers.ts"

type Matcher = { regexp: string; has?: unknown; missing?: unknown }
type Request = { headers: Record<string, string>; cookies: Record<string, string> }

const require = createRequire(import.meta.url)
const { loadBindings } = require("next/dist/build/swc/index.js") as { loadBindings: () => Promise<unknown> }
const { getPageStaticInfo } = require("next/dist/build/analysis/get-page-static-info.js") as {
  getPageStaticInfo: (params: object) => Promise<{ middleware?: { matchers?: Matcher[] } }>
}
const { getMiddlewareRouteMatcher } = require("next/dist/shared/lib/router/utils/middleware-route-matcher.js") as {
  getMiddlewareRouteMatcher: (matchers: Matcher[]) => (pathname: string, request: Request, query: object) => boolean
}
const { buildCustomRoute } = require("next/dist/lib/build-custom-route.js") as {
  buildCustomRoute: (type: "header", route: { source: string }, restricted: string[]) => { regex: string }
}

await loadBindings()
const info = await getPageStaticInfo({
  pageFilePath: path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "proxy.ts"),
  nextConfig: {},
  isDev: false,
  page: "/proxy",
  pageType: "root",
})
const matchers = info.middleware?.matchers
assert.ok(matchers && matchers.length > 0, "proxy.ts exports a matcher Next.js can read")
const proxyRuns = getMiddlewareRouteMatcher(matchers)
const runsOn = (pathname: string, headers: Record<string, string> = {}) => proxyRuns(pathname, { headers, cookies: {} }, {})

/** The next.config.ts header rules that set a Content-Security-Policy on this path. */
function fallbackPolicies(pathname: string) {
  return headerRules()
    .filter((rule) => new RegExp(buildCustomRoute("header", rule, []).regex).test(pathname))
    .flatMap((rule) => rule.headers.filter((header) => header.key === "Content-Security-Policy"))
}

const PAGES = ["/", "/learn", "/learn/budgeting-basics", "/assistant", "/dashboard", "/login", "/account", "/verify-email"]
// Not-found pages render the full layout, so made-up URLs must get the page policy too.
const NOT_FOUND = ["/learn/budgeting.txt", "/robots.txt", "/sitemap.xml", "/x.png", "/a/b.jpg", "/assistant.csv", "/logo.svg", "/x.ico", "/nope"]
// API routes, including not-found pages under /api/ (they get the script-free fallback instead).
const API = ["/api", "/api/", "/api/nope", "/api/account", "/api/account/x/y", "/api/chat", "/api/import/screenshot", "/api/market/history", "/api/auth/signout"]
const PUBLIC_FILES = ["/sample-transactions.csv", "/sample-holdings.csv", "/next.svg"]
const SKIPPED = [
  ...API,
  "/_next/static",
  "/_next/static/chunks/main.js",
  "/_next/static/css/app.css",
  "/_next/static/media/font.woff2",
  "/_next/image",
  "/_vercel",
  "/_vercel/insights/script.js",
  "/favicon.ico",
]
// Look-alikes of skipped paths: ordinary not-found pages, so they get the page policy.
const LOOK_ALIKES = ["/apis", "/api.txt", "/apix/y", "/learn/api/x", "/_next/staticx", "/_next/images", "/_vercelx", "/favicon.ico.txt", "/learn/favicon.ico"]

describe("the proxy's matcher", () => {
  it("runs on every page, every not-found URL (whatever it ends in) and every public file", () => {
    for (const pathname of [...PAGES, ...NOT_FOUND, ...PUBLIC_FILES]) assert.ok(runsOn(pathname), pathname)
  })

  it("skips API routes, so Next.js doesn't buffer their request bodies before the routes' own size caps run", () => {
    for (const pathname of API) assert.equal(runsOn(pathname), false, pathname)
  })

  it("runs on prefetches and React Server Component requests too", () => {
    const prefetches: Record<string, string>[] = [{ "next-router-prefetch": "1" }, { purpose: "prefetch" }, { "sec-purpose": "prefetch" }, { rsc: "1" }]
    for (const headers of prefetches) {
      assert.ok(runsOn("/login", headers), JSON.stringify(headers))
    }
    assert.ok(runsOn("/learn.rsc"))
  })

  it("skips only API routes, build files, the image optimizer, Vercel's scripts and the favicon", () => {
    for (const pathname of SKIPPED) assert.equal(runsOn(pathname), false, pathname)
    // Prefixes are matched whole: a look-alike path is an ordinary not-found page.
    for (const pathname of LOOK_ALIKES) assert.ok(runsOn(pathname), pathname)
  })
})

describe("one Content-Security-Policy per response", () => {
  it("comes from the proxy wherever it runs, and from next.config.ts (the script-free fallback) everywhere else", () => {
    for (const pathname of [...PAGES, ...NOT_FOUND, ...PUBLIC_FILES, ...SKIPPED, ...LOOK_ALIKES]) {
      const fallback = fallbackPolicies(pathname)
      if (runsOn(pathname)) assert.deepEqual(fallback, [], `${pathname}: only the proxy's policy`)
      else assert.deepEqual(fallback.map((header) => header.value), [CONTENT_SECURITY_POLICY], `${pathname}: the fallback policy`)
    }
  })
})
