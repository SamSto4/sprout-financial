import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  CONTENT_SECURITY_POLICY,
  SECURITY_HEADERS,
  UNPROXIED_PATHS,
  headerRules,
  newNonce,
  pageContentSecurityPolicy,
} from "./security-headers.ts"

function directive(policy: string, name: string) {
  const found = policy.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name} `))
  return found?.split(/\s+/).slice(1) ?? null
}

const NONCE = newNonce()
const production = pageContentSecurityPolicy({ nonce: NONCE })
const preview = pageContentSecurityPolicy({ nonce: NONCE, preview: true })
const development = pageContentSecurityPolicy({ nonce: NONCE, development: true })
const ALL = { production, preview, development }

describe("page nonces", () => {
  it("are 16 random bytes, base64, and different every time", () => {
    const nonces = new Set(Array.from({ length: 200 }, () => newNonce()))
    assert.equal(nonces.size, 200)
    for (const nonce of nonces) {
      assert.match(nonce, /^[A-Za-z0-9+/]{22}==$/)
      assert.equal(Buffer.from(nonce, "base64").length, 16)
    }
  })

  it("are refused if they could add to the header", () => {
    for (const bad of ["", "short", `${NONCE}; script-src *`, `${NONCE}'`, `${NONCE} https:`, "a".repeat(30) + "\n"]) {
      assert.throws(() => pageContentSecurityPolicy({ nonce: bad }), /nonce/)
    }
  })
})

describe("page content security policy", () => {
  it("only runs scripts with this request's nonce or from the site itself", () => {
    for (const [name, policy] of Object.entries(ALL)) {
      const scripts = directive(policy, "script-src")
      assert.ok(scripts, `${name}: script-src is set`)
      assert.ok(scripts.includes(`'nonce-${NONCE}'`), `${name}: carries the nonce`)
      assert.ok(scripts.includes("'self'"), `${name}: allows the site's own files`)
      for (const source of ["'unsafe-inline'", "'strict-dynamic'", "*", "https:", "http:", "data:", "blob:"]) {
        assert.ok(!scripts.includes(source), `${name}: script-src must not allow ${source}`)
      }
    }
  })

  it("allows eval only in development", () => {
    assert.ok(directive(development, "script-src")?.includes("'unsafe-eval'"))
    for (const policy of [production, preview]) assert.ok(!policy.includes("unsafe-eval"))
  })

  it("lets Vercel's toolbar load only on preview deployments", () => {
    assert.ok(!production.includes("vercel.live"))
    assert.ok(!development.includes("vercel.live"))
    for (const name of ["script-src", "frame-src", "connect-src", "img-src"]) {
      assert.ok(directive(preview, name)?.includes("https://vercel.live"), `${name} on previews`)
    }
    assert.deepEqual(directive(production, "frame-src"), ["'none'"])
  })

  it("keeps everything else on the site, with no wildcard hosts", () => {
    for (const [name, policy] of Object.entries(ALL)) {
      assert.deepEqual(directive(policy, "default-src"), ["'self'"], name)
      for (const part of policy.split(";")) {
        for (const source of part.trim().split(/\s+/).slice(1)) {
          assert.ok(!["*", "https:", "http:", "wss:", "ws:"].includes(source), `${name}: ${part.trim()} must not allow ${source}`)
          assert.ok(!source.includes("*"), `${name}: no wildcard hosts (${source})`)
        }
      }
      assert.deepEqual(directive(policy, "connect-src"), name === "preview" ? ["'self'", "https://vercel.live", "wss://ws-us3.pusher.com"] : ["'self'"])
    }
  })

  it("allows inline styles without a nonce, because a nonce would switch 'unsafe-inline' off", () => {
    for (const policy of Object.values(ALL)) {
      const styles = directive(policy, "style-src")
      assert.ok(styles?.includes("'unsafe-inline'"))
      assert.ok(!styles?.some((source) => source.startsWith("'nonce-")))
    }
  })

  it("keeps images working for icons, QR codes and screenshots being prepared", () => {
    assert.deepEqual(directive(production, "img-src"), ["'self'", "data:", "blob:"])
  })

  it("forbids framing, plugins and <base>, and forms posting elsewhere than the site or Google sign-in", () => {
    for (const policy of Object.values(ALL)) {
      assert.deepEqual(directive(policy, "frame-ancestors"), ["'none'"])
      assert.deepEqual(directive(policy, "object-src"), ["'none'"])
      assert.deepEqual(directive(policy, "base-uri"), ["'none'"])
      assert.deepEqual(directive(policy, "form-action"), ["'self'", "https://accounts.google.com"])
    }
  })

  it("is one header line with each directive once", () => {
    for (const policy of Object.values(ALL)) {
      assert.ok(!/[\r\n]/.test(policy))
      const names = policy.split(";").map((part) => part.trim().split(/\s+/)[0])
      assert.equal(new Set(names).size, names.length)
    }
  })
})

describe("the fallback policy, for the paths the proxy skips", () => {
  it("runs no scripts and loads nothing from anywhere, so a stray HTML page there can't hydrate", () => {
    assert.deepEqual(directive(CONTENT_SECURITY_POLICY, "default-src"), ["'none'"])
    assert.deepEqual(directive(CONTENT_SECURITY_POLICY, "script-src"), ["'none'"])
    assert.ok(!CONTENT_SECURITY_POLICY.includes("unsafe-eval"))
    assert.equal(directive(CONTENT_SECURITY_POLICY, "connect-src"), null, "falls back to default-src 'none'")
  })

  it("still shows the site's own styles, images and fonts", () => {
    assert.deepEqual(directive(CONTENT_SECURITY_POLICY, "style-src"), ["'self'", "'unsafe-inline'"])
    assert.deepEqual(directive(CONTENT_SECURITY_POLICY, "img-src"), ["'self'", "data:", "blob:"])
    assert.deepEqual(directive(CONTENT_SECURITY_POLICY, "font-src"), ["'self'"])
  })

  it("forbids framing, plugins, <base> and forms posting elsewhere, and names no outside host", () => {
    assert.deepEqual(directive(CONTENT_SECURITY_POLICY, "frame-ancestors"), ["'none'"])
    assert.deepEqual(directive(CONTENT_SECURITY_POLICY, "object-src"), ["'none'"])
    assert.deepEqual(directive(CONTENT_SECURITY_POLICY, "base-uri"), ["'none'"])
    assert.deepEqual(directive(CONTENT_SECURITY_POLICY, "form-action"), ["'self'"])
    for (const host of ["vercel.live", "vercel.com", "pusher", "https:", "*"]) assert.ok(!CONTENT_SECURITY_POLICY.includes(host), host)
  })
})

describe("security headers on every response", () => {
  it("forbids framing the site (clickjacking) in old browsers too", () => {
    assert.equal(SECURITY_HEADERS.find((header) => header.key === "X-Frame-Options")?.value, "DENY")
  })

  it("sends each header once, including nosniff (which also stops a JSON reply running as a script)", () => {
    const keys = SECURITY_HEADERS.map((header) => header.key.toLowerCase())
    assert.equal(new Set(keys).size, keys.length)
    for (const key of ["x-content-type-options", "referrer-policy", "strict-transport-security"]) assert.ok(keys.includes(key))
    assert.equal(SECURITY_HEADERS.find((header) => header.key === "X-Content-Type-Options")?.value, "nosniff")
  })

  it("leaves the Content-Security-Policy to the proxy, except on the paths it skips", () => {
    const rules = headerRules()
    assert.deepEqual(rules[0], { source: "/:path*", headers: SECURITY_HEADERS })
    assert.ok(!SECURITY_HEADERS.some((header) => header.key.toLowerCase() === "content-security-policy"))
    const policyRules = rules.filter((rule) => rule.headers.some((header) => header.key === "Content-Security-Policy"))
    assert.deepEqual(policyRules.map((rule) => rule.source), UNPROXIED_PATHS)
    for (const rule of policyRules) assert.deepEqual(rule.headers, [{ key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY }])
  })
})
