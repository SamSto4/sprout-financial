import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"

import { recordSignIn, verifyPassword } from "@/lib/auth/users"

export const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)

// Sessions are signed JWT cookies; accounts and synced data live in MongoDB, keyed by email.
export const { auth, handlers, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    ...(googleEnabled
      ? [Google({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET })]
      : []),
    Credentials({
      credentials: { email: { type: "email" }, password: { type: "password" } },
      // Returns null on every failure: throwing sends Auth.js to its generic error page
      // instead of reporting "wrong email or password" on the form.
      async authorize(credentials) {
        const email = credentials?.email
        const password = credentials?.password
        if (typeof email !== "string" || typeof password !== "string") return null
        const user = await verifyPassword(email, password)
        return user ? { id: user.email, email: user.email, name: user.name || null, image: user.image ?? null } : null
      },
    }),
  ],
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
