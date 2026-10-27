import NextAuth, { CredentialsSignin } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"

import { knownDevice } from "@/lib/auth/device-server"
import type { SecondFactorKind } from "@/lib/auth/security-log"
import {
  currentRequestContext,
  recordSecurityEventLater,
  recordWrongPasswordLater,
  requestContextFrom,
  sendSecurityNoticeLater,
} from "@/lib/auth/security-log-server"
import { isSessionExpired, isSessionStale } from "@/lib/auth/session-version"
import { checkSecondFactor } from "@/lib/auth/two-factor-server"
import { findUserByEmail, recordSignIn, sessionsEndedAt, verifyPassword } from "@/lib/auth/users"
import { isDatabaseConfigured } from "@/lib/db/mongodb"
import { accountKey, twoFactorLoginKey } from "@/lib/rate-limit/limits"
import { checkRateLimit, checkRateLimitFor } from "@/lib/rate-limit/server"

// AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET are the names Auth.js and Vercel's guides use.
const googleClientId = process.env.GOOGLE_CLIENT_ID || process.env.AUTH_GOOGLE_ID
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.AUTH_GOOGLE_SECRET
export const googleEnabled = Boolean(googleClientId && googleClientSecret)

/** Thrown from authorize() when a visitor has made too many login attempts. The form reads `code`. */
export class TooManyAttempts extends CredentialsSignin {
  code = "rate_limited"
}

// Two-step verification at password login. Only reached after the password was right.
export class TwoFactorRequired extends CredentialsSignin {
  code = "two_factor_required"
}
export class TwoFactorInvalid extends CredentialsSignin {
  code = "two_factor_invalid"
}
/** Two-step verification is on but this server can't check it (see checkSecondFactor): refused. */
export class TwoFactorUnavailable extends CredentialsSignin {
  code = "two_factor_unavailable"
}
/** Too many two-step codes tried with this account's current password (twoFactorLogin): refused unchecked. */
export class TwoFactorLimited extends CredentialsSignin {
  code = "two_factor_rate_limited"
}

// Sessions are signed JWT cookies; accounts and synced data live in MongoDB, keyed by email.
export const { auth, handlers, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt" },
  // Errors (a refused Google sign-in, for example) come back to the login page as ?error=<code>.
  pages: { signIn: "/login", error: "/login" },
  providers: [
    ...(googleEnabled
      ? [Google({ clientId: googleClientId, clientSecret: googleClientSecret })]
      : []),
    Credentials({
      credentials: { email: { type: "email" }, password: { type: "password" }, code: { type: "text" } },
      // Returns null on a wrong email or password: throwing sends Auth.js to its generic error page
      // instead of reporting "wrong email or password" on the form.
      async authorize(credentials, request) {
        // The login limit lives here rather than in the form's server action, because Auth.js also
        // accepts credentials posted straight to /api/auth/callback/credentials, which skips the form.
        const attempts = await checkRateLimit("login", request.headers)
        if (!attempts.allowed) throw new TooManyAttempts()

        const email = credentials?.email
        const password = credentials?.password
        if (typeof email !== "string" || typeof password !== "string" || password.length > 200 || email.length > 254) return null

        // Per account too, so guesses spread across many IP addresses still get slowed down. A
        // browser this account was used in before is counted on its own instead (device cookie,
        // lib/auth/device-cookie.ts), so someone else's guesses can't lock the owner out. Checking
        // the cookie needs no database, so it takes the same time whether or not the account exists.
        const device = knownDevice(request.headers, email)
        const accountAttempts = device
          ? await checkRateLimitFor("loginDevice", device)
          : await checkRateLimitFor("loginAccount", accountKey(email))
        if (!accountAttempts.allowed) throw new TooManyAttempts()

        // Security log entries (lib/auth/security-log-server.ts) are written after the response, so
        // they can't slow down or change the answer. Device and rough place come from this request.
        const context = requestContextFrom(request.headers)
        const user = await verifyPassword(email, password)
        if (!user) {
          // Only kept when the address has a password account, which is checked after the reply.
          recordWrongPasswordLater(email, context)
          return null
        }

        // With two-step verification on, the password alone isn't enough. Every code tried (app or
        // recovery, right or wrong) is counted per account and password version before it's checked
        // (twoFactorLogin): the login limits above alone would allow ~1,900 guesses a day.
        let secondFactor: SecondFactorKind | undefined
        if (user.twoFactor) {
          const code = credentials?.code
          if (typeof code !== "string" || !code.trim()) {
            recordSecurityEventLater(user.email, { type: "two_step_prompted", ...context })
            throw new TwoFactorRequired()
          }
          const codeAttempts = await checkRateLimitFor("twoFactorLogin", twoFactorLoginKey(user.email, user.passwordChangedAt))
          if (!codeAttempts.allowed) {
            // Someone has the password: tell the owner (at most once a day).
            sendSecurityNoticeLater(user.email, "two_step_attempts", context)
            throw new TwoFactorLimited()
          }
          const check = await checkSecondFactor(user.email, code.slice(0, 64))
          if (check.status === "unavailable") throw new TwoFactorUnavailable()
          if (check.status !== "ok") {
            recordSecurityEventLater(user.email, { type: "two_step_failed", ...context })
            throw new TwoFactorInvalid()
          }
          secondFactor = check.usedRecoveryCode ? "recovery" : "app"
        }
        recordSecurityEventLater(user.email, { type: "sign_in", method: "password", secondFactor, ...context })
        if (secondFactor === "recovery") sendSecurityNoticeLater(user.email, "recovery_code_login", context)
        return { id: user.email, email: user.email, name: user.name || null, image: user.image ?? null }
      },
    }),
  ],
  callbacks: {
    /**
     * Ends sessions that started before the account's password last changed, the owner chose "Sign
     * out everywhere", or the account was deleted, so each one logs out every device. Runs whenever
     * a session is read. If the database can't be reached the session is kept, so an outage
     * doesn't log everyone out.
     */
    async jwt({ token, user }) {
      if (user) {
        token.signedInAt = Date.now()
        return token
      }
      // Checked against the cookie as it arrived: a session with no signedInAt predates this
      // check, and isSessionStale treats it as older than any password reset or deletion.
      const signedInAt = token.signedInAt
      if (isSessionExpired(signedInAt, Date.now())) return null
      if (token.email && isDatabaseConfigured()) {
        try {
          if (isSessionStale(signedInAt, await sessionsEndedAt(token.email))) return null
        } catch (error) {
          console.error("Couldn't check the session against the password:", error instanceof Error ? error.message : error)
        }
      }
      // Older sessions without signedInAt start their 30-day clock now.
      if (typeof signedInAt !== "number") token.signedInAt = Date.now()
      return token
    },
    /**
     * Accounts are matched by email, so Google sign-in must not join an existing password account.
     * Password sign-up doesn't prove the person owns the address, so someone could register a
     * stranger's email; if Google then logged the real owner into that same account, the person
     * who set the password could read everything they synced. Google sign-in is therefore only
     * allowed for a verified Google address with no password account on it (or one already linked).
     */
    async signIn({ account, profile, user }) {
      if (account?.provider !== "google") return true
      if (profile?.email_verified !== true) return false
      const email = user.email ?? profile.email
      if (!email) return false
      if (!isDatabaseConfigured()) return true
      try {
        const existing = await findUserByEmail(email)
        if (existing?.passwordHash && !existing.authProviders.includes("google")) {
          return "/login?error=PasswordAccount"
        }
        return true
      } catch (error) {
        // Can't check, so don't let the sign-in through.
        console.error("Couldn't check the account for Google sign-in:", error instanceof Error ? error.message : error)
        return false
      }
    },
  },
  events: {
    // Bookkeeping after a successful sign-in. A database hiccup is logged, not fatal.
    async signIn({ user, account }) {
      if (!user.email) return
      try {
        const { created } = await recordSignIn({ email: user.email, name: user.name, image: user.image }, account?.provider)
        // Password logins are logged in authorize(), which knows whether a code was used. Auth.js
        // doesn't pass the request here, so a Google login reads it with headers().
        if (account?.provider === "google") {
          const context = await currentRequestContext()
          recordSecurityEventLater(user.email, { type: created ? "account_created" : "sign_in", method: "google", ...context })
        }
      } catch (error) {
        console.error("Failed to record sign-in:", error instanceof Error ? error.message : error)
      }
    },
  },
})
