import "server-only"

import { cookies } from "next/headers"

import { addDeviceToken, DEVICE_COOKIE_DAYS, deviceCookieName, knownDeviceKey, readCookie } from "@/lib/auth/device-cookie"

// The device cookie (lib/auth/device-cookie.ts) read from a login request and set after a login or
// password reset. Secure (and "__Host-" named) in production, where the site is served over HTTPS.

const secure = () => process.env.NODE_ENV === "production"
const secret = () => process.env.AUTH_SECRET ?? ""

/** The loginDevice counter key when this request comes from a browser known to this account, else null. */
export function knownDevice(requestHeaders: { get(name: string): string | null }, email: string): string | null {
  return knownDeviceKey(readCookie(requestHeaders.get("cookie"), deviceCookieName(secure())), email, Date.now(), secret())
}

/**
 * Marks this browser as known to the account. Only for server actions, after the person proved
 * they hold the account (a successful login, or a reset link). Never throws: a browser that isn't
 * remembered simply keeps using the per-account login limit.
 */
export async function rememberDevice(email: string): Promise<void> {
  try {
    const store = await cookies()
    const name = deviceCookieName(secure())
    const value = addDeviceToken(store.get(name)?.value, email, Date.now(), secret())
    if (!value) return
    store.set(name, value, { httpOnly: true, secure: secure(), sameSite: "strict", path: "/", maxAge: DEVICE_COOKIE_DAYS * 86_400 })
  } catch (error) {
    console.error(JSON.stringify({ event: "device_cookie", outcome: "failed", error: error instanceof Error ? error.name : "unknown" }))
  }
}
