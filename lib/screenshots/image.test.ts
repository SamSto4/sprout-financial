import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  cutIntoPieces,
  cutWindow,
  fitScreenshot,
  MAX_SCREENSHOT_BYTES,
  MAX_SCREENSHOT_PIECES,
  MAX_SCREENSHOT_REQUEST_BYTES,
  parseScreenshotUpload,
  parseScreenshotUploads,
  planScreenshot,
  problemMessage,
  quietestCut,
  rowChanges,
  type PiecesPlan,
} from "./image.ts"

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

describe("planScreenshot", () => {
  const pieces = (width: number, height: number): PiecesPlan => {
    const plan = planScreenshot(width, height)
    assert.equal(plan.kind, "pieces", `${width}x${height} should be cut into pieces`)
    return plan as PiecesPlan
  }

  it("sends an ordinary screenshot whole, at fitScreenshot's size", () => {
    for (const [width, height] of [
      [1170, 2532], // iPhone, fits as it is
      [1290, 2796], // iPhone Pro Max, shrunk a little
      [2200, 1440], // 2x laptop
      [3456, 2234], // 2x 16-inch laptop, shrunk to about 0.7
      [8000, 1000], // wide, not tall
    ]) {
      assert.deepEqual(planScreenshot(width, height), { kind: "whole", ...fitScreenshot(width, height) }, `${width}x${height}`)
    }
  })

  it("sends a capture a little taller than a screen whole too", () => {
    assert.equal(planScreenshot(1170, 3600).kind, "whole") // shrunk to 0.72
  })

  it("cuts a scrolling capture into full-size pieces instead of shrinking it to a strip", () => {
    for (const [width, height] of [
      [1170, 8400], // three phone screens: whole, 358 px wide
      [1170, 13800], // five and a half: 218 px wide
      [1170, 4000], // one and a half: 0.64
    ]) {
      const plan = pieces(width, height)
      assert.equal(plan.scale, 1, "never shrunk while it fits in the most pieces")
      assert.equal(plan.width, width)
      assert.equal(plan.height, height)
      assert.ok(plan.pieceHeight <= 2576)
      assert.ok(patches({ width: plan.width, height: plan.pieceHeight }) <= 4784)
    }
  })

  it("shrinks a very long capture only as far as it takes to stay within the most pieces", () => {
    const month = pieces(1170, 22800)
    assert.ok(month.scale < 1 && month.scale > 0.9, `scale ${month.scale}`)
    const longer = pieces(1170, 60000)
    assert.ok(longer.scale < month.scale)
    // Still far sharper than the whole capture in one image.
    assert.ok(longer.width > 4 * fitScreenshot(1170, 60000).width)
  })

  it("keeps a wide capture's pieces within the patch limit", () => {
    const plan = pieces(2560, 9000) // a 2x full-page desktop capture
    assert.ok(plan.width <= 2576)
    assert.ok(patches({ width: plan.width, height: plan.pieceHeight }) <= 4784)
    const huge = pieces(3840, 20000)
    assert.ok(huge.width <= 2576 && huge.scale < 1)
    assert.ok(patches({ width: huge.width, height: huge.pieceHeight }) <= 4784)
  })

  it("handles nonsense sizes", () => {
    assert.deepEqual(planScreenshot(0, 100), { kind: "whole", width: 0, height: 0 })
    assert.deepEqual(planScreenshot(100, Number.NaN), { kind: "whole", width: 0, height: 0 })
  })
})

describe("cutIntoPieces", () => {
  const covers = (plan: PiecesPlan, cut: { top: number; height: number }[]) => {
    let top = 0
    for (const piece of cut) {
      assert.equal(piece.top, top, "no gap and no overlap")
      assert.ok(piece.height > 0 && piece.height <= plan.pieceHeight)
      top += piece.height
    }
    assert.equal(top, plan.height, "covers the whole capture")
  }

  it("never needs more than the most pieces, even when every cut falls as high as it can", () => {
    for (const [width, height] of [
      [1170, 8400],
      [1170, 13800],
      [1170, 22800],
      [1170, 60000],
      [2560, 9000],
      [3840, 20000],
      [750, 30000],
    ]) {
      const plan = planScreenshot(width, height) as PiecesPlan
      const highest = cutIntoPieces(plan, () => 0)
      covers(plan, highest)
      assert.ok(highest.length <= MAX_SCREENSHOT_PIECES, `${width}x${height}: ${highest.length} pieces`)
      covers(plan, cutIntoPieces(plan, () => plan.pieceHeight))
    }
  })

  it("cuts where it's told, within the bottom of the piece", () => {
    const plan = planScreenshot(1170, 8400) as PiecesPlan
    const window = cutWindow(plan.pieceHeight)
    const cut = cutIntoPieces(plan, () => plan.pieceHeight - 100)
    assert.deepEqual(
      cut.map((piece) => piece.height),
      [plan.pieceHeight - 100, plan.pieceHeight - 100, plan.pieceHeight - 100, 8400 - 3 * (plan.pieceHeight - 100)]
    )
    // Outside the band, or not a number: kept to the band.
    assert.equal(cutIntoPieces(plan, () => 5)[0].height, plan.pieceHeight - window + 1)
    assert.equal(cutIntoPieces(plan, () => Number.NaN)[0].height, plan.pieceHeight - 1)
  })
})

describe("rowChanges and quietestCut", () => {
  // A white band 4 px wide with dark "text" on some rows.
  const band = (inked: number[], rows: number, width = 4) => {
    const rgba = new Uint8ClampedArray(width * rows * 4).fill(255)
    for (const row of inked) rgba.fill(30, row * width * 4, row * width * 4 + 8) // two dark pixels
    return rgba
  }

  it("counts the pixels that change from each row to the next", () => {
    assert.deepEqual([...rowChanges(band([2], 5), 4, 5)], [0, 2, 2, 0])
  })

  it("ignores faint changes such as a soft gradient or JPEG noise", () => {
    const rgba = new Uint8ClampedArray(4 * 3 * 4).fill(255)
    rgba.fill(240, 16, 32) // row 1 a shade darker
    assert.deepEqual([...rowChanges(rgba, 4, 3)], [0, 0])
  })

  it("cuts in the middle of the longest blank band between lines of text", () => {
    // Text on rows 0-3, 10-12 and 24-25: blank bands of rows 4-9 and 13-23.
    const inked = [0, 1, 2, 3, 10, 11, 12, 24, 25]
    const cut = quietestCut(rowChanges(band(inked, 30), 4, 30))
    assert.equal(cut, 17) // between rows 17 and 18, the middle of rows 13-23
    assert.ok(!inked.includes(cut) && !inked.includes(cut + 1))
  })

  it("prefers the lower of two equal bands, so pieces stay large", () => {
    assert.equal(quietestCut([0, 0, 0, 5, 0, 0, 0, 5]), 5)
  })

  it("still cuts somewhere when no row is blank", () => {
    assert.equal(quietestCut([9, 4, 7, 4, 4, 8]), 3)
    assert.equal(quietestCut([]), 0)
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

  it("takes one image or the pieces of a tall capture, in order", () => {
    const one = parseScreenshotUploads({ mediaType: "image/jpeg", data: JPEG })
    assert.equal(one.ok && one.images.length, 1)
    const three = parseScreenshotUploads([
      { mediaType: "image/jpeg", data: JPEG },
      { mediaType: "image/png", data: PNG },
      { mediaType: "image/jpeg", data: JPEG },
    ])
    assert.deepEqual(three.ok && three.images.map((image) => image.mediaType), ["image/jpeg", "image/png", "image/jpeg"])
  })

  it("refuses no pieces, too many, any bad piece, or pieces too large together", () => {
    assert.equal(parseScreenshotUploads([]).ok, false)
    assert.equal(parseScreenshotUploads(new Array(MAX_SCREENSHOT_PIECES + 1).fill({ mediaType: "image/jpeg", data: JPEG })).ok, false)
    assert.equal(parseScreenshotUploads(new Array(MAX_SCREENSHOT_PIECES).fill({ mediaType: "image/jpeg", data: JPEG })).ok, true)
    assert.equal(parseScreenshotUploads([{ mediaType: "image/jpeg", data: JPEG }, { mediaType: "image/png", data: JPEG }]).ok, false)
    assert.equal(parseScreenshotUploads(undefined).ok, false)
    const half = Buffer.alloc(Math.ceil(MAX_SCREENSHOT_BYTES / 2) + 3, 7)
    half.set([0xff, 0xd8, 0xff], 0)
    const piece = { mediaType: "image/jpeg", data: half.toString("base64") }
    assert.equal(parseScreenshotUpload(piece).ok, true, "each piece alone is under the cap")
    const both = parseScreenshotUploads([piece, piece])
    assert.equal(both.ok, false)
    assert.match(both.ok ? "" : both.error, /too large/)
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
