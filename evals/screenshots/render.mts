// Draws the eval screenshots in fixtures.ts as images in evals/screenshots/images/. The images are
// committed, so this only needs running after a fixture changes. It needs Playwright, which isn't
// a dependency of the app: `npx -y playwright@1 install chromium` once, then
//
//   node evals/screenshots/render.mts
//
// Phones render at 390 px wide and 3x density (an iPhone screenshot); desktops at 1100 px and 2x.
// JPEG at quality 90, like the browser sends after shrinking (lib/screenshots/prepare-image.ts).

import { mkdirSync } from "node:fs"
import { createRequire } from "node:module"

import { SCREENS } from "./fixtures.ts"

// Just what this script uses, since Playwright (and its types) aren't installed with the app.
type Page = { setContent(html: string): Promise<void>; screenshot(options: { path: string; type: "jpeg"; quality: number }): Promise<unknown>; close(): Promise<void> }
type Browser = { newPage(options: { viewport: { width: number; height: number }; deviceScaleFactor: number }): Promise<Page>; close(): Promise<void> }

const require = createRequire(import.meta.url)
const { chromium } = require("playwright") as { chromium: { launch(): Promise<Browser> } }

const OUTPUT = new URL("./images/", import.meta.url)
mkdirSync(OUTPUT, { recursive: true })

const browser = await chromium.launch()
try {
  for (const screen of SCREENS) {
    const phone = screen.device === "phone"
    const page = await browser.newPage({ viewport: phone ? { width: 390, height: 844 } : { width: 1100, height: 720 }, deviceScaleFactor: phone ? 3 : 2 })
    await page.setContent(screen.html)
    await page.screenshot({ path: new URL(`${screen.name}.jpg`, OUTPUT).pathname, type: "jpeg", quality: 90 })
    await page.close()
    console.log(`  ${screen.name}.jpg`)
  }
} finally {
  await browser.close()
}
