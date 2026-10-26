import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { fitScreenshot, MAX_SCREENSHOT_BYTES, MAX_SCREENSHOT_REQUEST_BYTES, parseScreenshotUpload, problemMessage } from "./image.ts"

const patches = ({ width, height }: { width: number; height: number }) => Math.ceil(width / 28) * Math.ceil(height / 28)

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(60).fill(7)]).toString("base64")
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(60).fill(7)]).toString("base64")
const WEBP = Buffer.from([...Buffer.from("RIFF"), 1, 2, 3, 4, ...Buffer.from("WEBP"), ...new Array(60).fill(7)]).toString("base64")

describe("fitScreenshot", () => {
  it("leaves an image that already fits alone", () => {
    assert.deepEqual(fitScreenshot(1000, 1000), { width: 1000, height: 1000 })
  })

  it("shrinks a phone screenshot to fit the patch limit, keeping its shape", () => {
    const fitted = fitScreenshot(1290, 2796)
    assert.ok(patches(fitted) <= 4784, `${patches(fitted)} patches`)
    assert.ok(Math.abs(fitted.width / fitted.height - 1290 / 2796) < 0.01)
    assert.ok(fitted.height > 2000, "still large enough to read")
  })

  it("caps the long edge of a wide image", () => {
    const fitted = fitScreenshot(8000, 1000)
    assert.ok(fitted.width <= 2576)
    assert.ok(patches(fitted) <= 4784)
  })

  it("handles nonsense sizes", () => {
    assert.deepEqual(fitScreenshot(0, 100), { width: 0, height: 0 })
    assert.deepEqual(fitScreenshot(Number.NaN, 100), { width: 0, height: 0 })
  })
})

describe("parseScreenshotUpload", () => {
  it("accepts JPEG, PNG and WebP whose bytes match the type", () => {
    assert.equal(parseScreenshotUpload({ mediaType: "image/jpeg", data: JPEG }).ok, true)
    assert.equal(parseScreenshotUpload({ mediaType: "image/png", data: PNG }).ok, true)
    assert.equal(parseScreenshotUpload({ mediaType: "image/webp", data: WEBP }).ok, true)
  })

  it("refuses a file whose bytes don't match its type", () => {
    assert.equal(parseScreenshotUpload({ mediaType: "image/png", data: JPEG }).ok, false)
    const text = Buffer.from("<html><script>alert(1)</script></html>").toString("base64")
    assert.equal(parseScreenshotUpload({ mediaType: "image/jpeg", data: text }).ok, false)
  })

  it("refuses other types, broken base64 and missing fields", () => {
    assert.equal(parseScreenshotUpload({ mediaType: "image/gif", data: JPEG }).ok, false)
    assert.equal(parseScreenshotUpload({ mediaType: "application/pdf", data: JPEG }).ok, false)
    assert.equal(parseScreenshotUpload({ mediaType: "image/jpeg", data: `${JPEG}!` }).ok, false)
    assert.equal(parseScreenshotUpload({ mediaType: "image/jpeg", data: JPEG.slice(1) }).ok, false)
    assert.equal(parseScreenshotUpload({ mediaType: "image/jpeg" }).ok, false)
    assert.equal(parseScreenshotUpload(null).ok, false)
  })

  it("refuses an image over the size cap, counted from the base64 length", () => {
    const big = Buffer.alloc(MAX_SCREENSHOT_BYTES + 1, 7)
    big.set([0xff, 0xd8, 0xff], 0)
    const result = parseScreenshotUpload({ mediaType: "image/jpeg", data: big.toString("base64") })
    assert.equal(result.ok, false)
    assert.match(result.ok ? "" : result.error, /too large/)
  })

  it("keeps a full-size upload under Vercel's 4.5 MB request limit", () => {
    assert.ok(MAX_SCREENSHOT_REQUEST_BYTES < 4_500_000)
  })
})

describe("problemMessage", () => {
  it("points a screenshot on the wrong page to the right one", () => {
    assert.match(problemMessage("transactions", "wrong_kind", "Screenshot 2"), /^Screenshot 2 shows investments\. Add it on the Portfolio page/)
    assert.match(problemMessage("holdings", "wrong_kind", "Screenshot 1"), /Add it on the Dashboard/)
  })

  it("says plainly when a picture isn't a financial screen or can't be read", () => {
    assert.match(problemMessage("holdings", "not_financial", "This screenshot"), /brokerage or retirement account screen/)
    assert.match(problemMessage("transactions", "unreadable", "This screenshot"), /too blurry/)
  })
})
