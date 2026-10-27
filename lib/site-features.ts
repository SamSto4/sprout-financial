import "server-only"

import { googleEnabled } from "@/lib/auth/auth"
import { isTwoFactorAvailable } from "@/lib/auth/two-factor-server"
import { verificationRequired } from "@/lib/auth/verify"
import { isDatabaseConfigured } from "@/lib/db/mongodb"
import { isMarketDataConfigured } from "@/lib/market/fmp"
import { rateLimitsEnabled } from "@/lib/rate-limit/server"
import type { SiteFeatures } from "@/lib/site"

/** What this server has switched on, so the home page and FAQ never describe a feature that's off. */
export function siteFeatures(): SiteFeatures {
  const accounts = isDatabaseConfigured()
  return {
    accounts,
    // The login page shows no form without a database, so these only count alongside accounts.
    emailConfirmation: accounts && verificationRequired(process.env),
    twoFactor: accounts && isTwoFactorAvailable(),
    googleSignIn: accounts && googleEnabled,
    loginLimits: accounts && rateLimitsEnabled(),
    marketData: isMarketDataConfigured(),
  }
}
