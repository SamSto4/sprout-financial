// Site-wide name and navigation. Change the name here to rebrand every page.
export const SITE_NAME = "Sprout"
export const SITE_TAGLINE = "Plain-English money skills, with an AI tutor"

export const NAV_LINKS = [
  { title: "Learn", href: "/learn" },
  { title: "My plan", href: "/plan" },
  { title: "Portfolio", href: "/portfolio" },
  { title: "Assistant", href: "/assistant" },
  { title: "Dashboard", href: "/dashboard" },
  { title: "About", href: "/about" },
] as const

/**
 * The footer's links: the main navigation, plus pages linked only from the bottom of the page.
 * The FAQ stays out of the header on purpose (product decision, AGENTS.md section 6b).
 */
export const FOOTER_LINKS = [...NAV_LINKS, { title: "FAQ", href: "/faq" }] as const

/**
 * What this server has switched on, for copy that must match it (the home page and the FAQ).
 * Worked out on the server by siteFeatures() in lib/site-features.ts.
 */
export type SiteFeatures = {
  /** MongoDB is configured, so people can create accounts and sync. */
  accounts: boolean
  /** New password accounts confirm their email first (verificationRequired in lib/auth/verify.ts). */
  emailConfirmation: boolean
  /** Two-step verification can be turned on (isTwoFactorAvailable in lib/auth/two-factor-server.ts). */
  twoFactor: boolean
  /** "Continue with Google" is offered (googleEnabled in lib/auth/auth.ts). */
  googleSignIn: boolean
  /** Repeated wrong passwords are slowed down (rate limits on, lib/rate-limit/server.ts). */
  loginLimits: boolean
  /** Market data tools and charts are available (isMarketDataConfigured in lib/market/fmp.ts). */
  marketData: boolean
}
