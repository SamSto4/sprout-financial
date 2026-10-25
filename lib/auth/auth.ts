import NextAuth, { CredentialsSignin } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"

import { isSessionStale } from "@/lib/auth/session-version"
import { findUserByEmail, passwordChangedAt, recordSignIn, verifyPassword } from "@/lib/auth/users"
import { isDatabaseConfigured } from "@/lib/db/mongodb"
import { checkRateLimit } from "@/lib/rate-limit/server"

// AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET are the names Auth.js and Vercel's guides use.
const googleClientId = process.env.GOOGLE_CLIENT_ID || process.env.AUTH_GOOGLE_ID
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.AUTH_GOOGLE_SECRET
export const googleEnabled = Boolean(googleClientId && googleClientSecret)

/** Thrown from authorize() when a visitor has made too many login attempts. The form reads `code`. */
export class TooManyAttempts extends CredentialsSignin {
  code = "rate_limited"
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
        if (typeof email !== "string" || typeof password !== "string" || password.length > 200) return null
        const user = await verifyPassword(email, password)
        return user ? { id: user.email, email: user.email, name: user.name || null, image: user.image ?? null } : null
      },
    }),
  ],
  callbacks: {
    /**
     * Ends sessions that started before the account's password last changed, so a password reset
     * logs out every other device. Runs whenever a session is read. If the database can't be
     * reached the session is kept, so an outage doesn't log everyone out.
     */
    async jwt({ token, user }) {
      if (user) {
        token.signedInAt = Date.now()
        return token
      }
      if (!token.email || !isDatabaseConfigured()) return token
      try {
        if (isSessionStale(token.signedInAt, await passwordChangedAt(token.email))) return null
      } catch (error) {
        console.error("Couldn't check the session against the password:", error instanceof Error ? error.message : error)
      }
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
        await recordSignIn({ email: user.email, name: user.name, image: user.image }, account?.provider)
      } catch (error) {
        console.error("Failed to record sign-in:", error instanceof Error ? error.message : error)
      }
    },
  },
})
