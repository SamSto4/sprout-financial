// Draws the eval screenshots in fixtures.ts as images in evals/screenshots/images/. The images are
// committed, so this only needs running after a fixture changes. It needs Playwright, which isn't
// a dependency of the app: `npx -y playwright@1 install chromium` once, then
//
//   node evals/screenshots/render.mts                      every screen
//   node evals/screenshots/render.mts dark-mode-bank ...   just these
//
// Phones render at 390 px wide and 3x density (an iPhone screenshot); desktops at 1100 px and 2x,
// unless a screen sets its own size. JPEG at quality 90, like the browser sends.
//
// A capture bigger than Claude reads (a long scrolling screenshot) goes through the browser's own
// import code: lib/screenshots/prepare-image.ts and image.ts, with their types stripped, run in
// the page on a PNG of the capture. So the eval reads exactly what the server would receive: one
// shrunk image, or the pieces of a tall capture, saved as <name>.1.jpg, <name>.2.jpg and so on.
// (A capture that already fits is only re-encoded by the browser; Playwright's JPEG at quality 90
// stands in for that.)

import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import * as nodeModule from "node:module"

import { planScreenshot } from "../../lib/screenshots/image.ts"
import { capturedSize, SCREENS } from "./fixtures.ts"

// Just what this script uses, since Playwright (and its types) aren't installed with the app.
type Page = {
  setContent(html: string): Promise<void>
  screenshot(options: { path?: string; type: "jpeg" | "png"; quality?: number }): Promise<Uint8Array>
  evaluate<T, A>(fn: (arg: A) => T | Promise<T>, arg: A): Promise<T>
  close(): Promise<void>
}
type Browser = { newPage(options: { viewport: { width: number; height: number }; deviceScaleFactor: number }): Promise<Page>; close(): Promise<void> }

// Node 22.13+ has stripTypeScriptTypes; the app's @types/node (20) doesn't know it yet.
const { createRequire, stripTypeScriptTypes } = nodeModule as typeof nodeModule & { stripTypeScriptTypes(code: string): string }
const require = createRequire(import.meta.url)
const { chromium } = require("playwright") as { chromium: { launch(): Promise<Browser> } }

const OUTPUT = new URL("./images/", import.meta.url)
mkdirSync(OUTPUT, { recursive: true })

const only = process.argv.slice(2)
const unknown = only.filter((name) => !SCREENS.some((screen) => screen.name === name))
if (unknown.length > 0) throw new Error(`No screen named ${unknown.join(", ")}`)

// The browser's import code as ES modules the page can load: image.ts, and prepare-image.ts
// importing it.
const LIB = new URL("../../lib/screenshots/", import.meta.url)
const moduleUrl = (js: string) => `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`
const javascript = (file: string) => stripTypeScriptTypes(readFileSync(new URL(file, LIB), "utf8"))
const IMPORT = 'from "./image.ts"'
const prepareSource = javascript("prepare-image.ts")
if (prepareSource.split(IMPORT).length !== 2) throw new Error(`prepare-image.ts should import ./image.ts exactly once, as \`${IMPORT}\``)
const PREPARE_MODULE = moduleUrl(prepareSource.replace(IMPORT, `from "${moduleUrl(javascript("image.ts"))}"`))

/** Runs in the page: prepareScreenshot() from lib/screenshots/prepare-image.ts, on a PNG capture. */
async function prepareInPage({ module, png }: { module: string; png: string }) {
  const { prepareScreenshot } = (await import(module)) as { prepareScreenshot(file: File): Promise<{ mediaType: string; data: string }[]> }
  const blob = await (await fetch(`data:image/png;base64,${png}`)).blob()
  return prepareScreenshot(new File([blob], "capture.png", { type: "image/png" }))
}

/** Removes what an earlier run drew for this screen: <name>.jpg and any pieces. */
function removeOld(name: string) {
  for (const file of readdirSync(OUTPUT)) {
    if (file === `${name}.jpg` || new RegExp(`^${name}\\.\\d+\\.jpg$`).test(file)) rmSync(new URL(file, OUTPUT))
  }
}

const browser = await chromium.launch()
try {
  for (const screen of SCREENS.filter((item) => only.length === 0 || only.includes(item.name))) {
    const phone = screen.device === "phone"
    const scale = screen.scale ?? (phone ? 3 : 2)
    const captured = capturedSize(screen)
    const viewport = { width: captured.width / scale, height: captured.height / scale }
    const page = await browser.newPage({ viewport, deviceScaleFactor: scale })
    await page.setContent(screen.html)
    // Anything past the edge wouldn't be in the picture, but would still be in the answer key.
    const overflow = await page.evaluate(
      ({ width, height }) => ({ width: document.documentElement.scrollWidth - width, height: document.documentElement.scrollHeight - height }),
      viewport
    )
    if (overflow.width > 0 || overflow.height > 0) throw new Error(`${screen.name} overflows its ${viewport.width}x${viewport.height} viewport by ${overflow.width}x${overflow.height} px`)

    removeOld(screen.name)
    const path = new URL(`${screen.name}.jpg`, OUTPUT).pathname
    const plan = planScreenshot(captured.width, captured.height)
    if (plan.kind === "whole" && plan.width === captured.width && plan.height === captured.height) {
      await page.screenshot({ path, type: "jpeg", quality: 90 })
      console.log(`  ${screen.name}.jpg  ${captured.width}x${captured.height}`)
    } else {
      const png = Buffer.from(await page.screenshot({ type: "png" })).toString("base64")
      const blank = await browser.newPage({ viewport: { width: 400, height: 400 }, deviceScaleFactor: 1 })
      const images = await blank.evaluate(prepareInPage, { module: PREPARE_MODULE, png })
      await blank.close()
      if (images.length === 1) {
        writeFileSync(path, Buffer.from(images[0].data, "base64"))
        console.log(`  ${screen.name}.jpg  ${captured.width}x${captured.height} shrunk to ${plan.width}x${plan.height}`)
      } else {
        images.forEach((image, index) => writeFileSync(new URL(`${screen.name}.${index + 1}.jpg`, OUTPUT), Buffer.from(image.data, "base64")))
        const kb = Math.round(images.reduce((sum, image) => sum + (image.data.length * 3) / 4, 0) / 1000)
        console.log(`  ${screen.name}.1-${images.length}.jpg  ${captured.width}x${captured.height} in ${images.length} pieces ${plan.width} px wide, ${kb} KB`)
      }
    }
    await page.close()
  }
} finally {
  await browser.close()
}
