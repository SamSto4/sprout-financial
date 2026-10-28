import { ImageResponse } from "next/og"

import { BrandMarkImage } from "@/components/social-card"

// The icon phones use for a home-screen shortcut, and the logo in the home page's structured data
// (lib/seo/json-ld.ts). Square and unrounded: iOS rounds the corners itself. Drawn at build time;
// served at /apple-icon. A picture runs no scripts, so a Content-Security-Policy from proxy.ts on it
// changes nothing.
export const size = { width: 180, height: 180 }
export const contentType = "image/png"

export default function AppleIcon() {
  return new ImageResponse(<BrandMarkImage size={180} rounded={false} />, { ...size })
}
