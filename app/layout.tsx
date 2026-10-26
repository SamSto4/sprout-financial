import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import { connection } from "next/server";
import "./globals.css";

import { Providers } from "@/components/providers";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Serif for headings gives the product an editorial, trustworthy voice.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz"],
});

export const metadata: Metadata = {
  title: {
    default: `${SITE_NAME} · ${SITE_TAGLINE}`,
    template: `%s · ${SITE_NAME}`,
  },
  description:
    "Learn budgeting, saving, debt and investing in plain English, with interactive calculators and an AI tutor.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Every page renders per request, so its scripts carry that request's nonce (proxy.ts). A page
  // built ahead of time would have scripts without one, and the security policy would block them.
  await connection();
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
        >
          Skip to content
        </a>
        <Providers>
          <SiteHeader />
          <div id="main" className="flex flex-1 flex-col">
            {children}
          </div>
          <SiteFooter />
        </Providers>
        {/* Vercel Web Analytics: page views only, no cookies. Data appears under Analytics in the Vercel dashboard. */}
        <Analytics />
      </body>
    </html>
  );
}
