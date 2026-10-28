"use client"

import { createContext, useContext } from "react"

/**
 * Whether this server has accounts (MongoDB configured, siteFeatures().accounts). The root layout
 * passes it to Providers once, so client components (the header, the budget planner, the assistant)
 * can leave out Log in and Sign up where /login would only say accounts aren't available.
 */
export const AccountsContext = createContext(false)

export function useAccountsEnabled(): boolean {
  return useContext(AccountsContext)
}
