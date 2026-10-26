import NextAuth, { CredentialsSignin } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"

import { isSessionExpired, isSessionStale } from "@/lib/auth/session-version"
import { claimUnverifiedAccount, findUserByEmail, recordSignIn, sessionsEndedAt, verifyPassword } from "@/lib/auth/users"
import { isDatabaseConfigured } from "@/lib/db/mongodb"
import { accountKey } from "@/lib/rate-limit/limits"
import { checkRateLimit, checkRateLimitFor } from "@/lib/rate-limit/server"

// AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET are the names Auth.js and Vercel's guides use.
const googleClientId = process.env.GOOGLE_CLIENT_ID || process.env.AUTH_GOOGLE_ID
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.AUTH_GOOGLE_SECRET
export const googleEnabled = Boolean(googleClientId && googleClientSecret)

/** Thrown from authorize() when a visitor has made too many login attempts. The form reads `code`. */
export class TooManyAttempts extends CredentialsSignin {
  code = "rate_limited"
}

/**
 * Thrown from authorize() when the password is right but the email isn't confirmed yet. Only
 * reached with the correct password, so it tells nobody else anything about the account.
 */
export class EmailNotVerified extends CredentialsSignin {
  code = "unverified"
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
      credentials: { email: { type: "email" }, password: { type: "password" } },
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

        // Per account too, so guesses spread across many IP addresses still get slowed down.
        const accountAttempts = await checkRateLimitFor("loginAccount", accountKey(email))
        if (!accountAttempts.allowed) throw new TooManyAttempts()

        const user = await verifyPassword(email, password)
        if (user?.unverifiedExpiresAt) throw new EmailNotVerified()
        return user ? { id: user.email, email: user.email, name: user.name || null, image: user.image ?? null } : null
      },
    }),
  ],
  callbacks: {
    /**
     * Ends sessions that started before the account's password last changed or the account was
     * deleted, so either one logs out every other device. Runs whenever a session is read. If the
     * database can't be reached the session is kept, so an outage doesn't log everyone out.
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
     * An unconfirmed password account is the exception: nobody has proved they own the address
     * except the person signing in with Google now, so it becomes theirs and its password is removed.
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
          if (!existing.unverifiedExpiresAt) return "/login?error=PasswordAccount"
          await claimUnverifiedAccount(email)
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
        await recordSignIn({ email: user.email, name: user.name, image: user.image }, account?.provider)
      } catch (error) {
        console.error("Failed to record sign-in:", error instanceof Error ? error.message : error)
      }
    },
  },
})
