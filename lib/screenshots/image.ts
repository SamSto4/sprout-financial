// Rules for screenshot images, shared by the browser (which shrinks and re-encodes each picture
// before upload) and the server (which checks what arrives). Pure and tested with `node --test`.

/** What a screenshot is read for: the Dashboard's transactions or the Portfolio page's holdings. */
export const SCREENSHOT_KINDS = ["transactions", "holdings"] as const
export type ScreenshotKind = (typeof SCREENSHOT_KINDS)[number]

export function isScreenshotKind(value: unknown): value is ScreenshotKind {
  return (SCREENSHOT_KINDS as readonly unknown[]).includes(value)
}

/** What went wrong with a screenshot as a whole, chosen by the model from a fixed list. */
export const SCREENSHOT_PROBLEMS = ["none", "not_financial", "wrong_kind", "unreadable"] as const
export type ScreenshotProblem = (typeof SCREENSHOT_PROBLEMS)[number]

/** What to tell the person when a screenshot gave no rows. Worded here, not by the model. */
export function problemMessage(kind: ScreenshotKind, problem: ScreenshotProblem, label: string): string {
  if (problem === "wrong_kind") {
    return kind === "transactions"
      ? `${label} shows investments. Add it on the Portfolio page instead.`
      : `${label} shows transactions. Add it on the Dashboard instead.`
  }
  if (problem === "not_financial") {
    return `${label} doesn't look like a ${kind === "transactions" ? "bank or card" : "brokerage or retirement account"} screen.`
  }
  if (problem === "unreadable") return `${label} was too blurry, small or cut off to read. Try a sharper screenshot.`
  return `No ${kind} found in ${label.toLowerCase()}.`
}

/** What the server accepts. The browser always sends JPEG; PNG and WebP are allowed so a direct
 * client can send a lossless screenshot. */
export const SCREENSHOT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const
export type ScreenshotType = (typeof SCREENSHOT_TYPES)[number]

/**
 * The most image data the server takes in one request, decoded: one image, or all the pieces of a
 * tall capture together. Base64 adds a third, so a request stays under Vercel's 4.5 MB body limit
 * (https://vercel.com/docs/functions/limitations).
 */
export const MAX_SCREENSHOT_BYTES = 3_000_000
/** The request body cap for one screenshot: the base64 image (or pieces) plus a little JSON around it. */
export const MAX_SCREENSHOT_REQUEST_BYTES = Math.ceil((MAX_SCREENSHOT_BYTES * 4) / 3) + 4_096

/** A picture straight off a phone can be large; anything bigger than this isn't a screenshot. */
export const MAX_ORIGINAL_BYTES = 25_000_000

/** Screenshots picked at once. Each is read with its own request (a tall one in pieces, still one request). */
export const MAX_SCREENSHOTS = 6

// Claude reads images in 28×28-pixel patches. Current models take up to 2,576 px on the long edge
// and 4,784 patches; anything larger is shrunk on Anthropic's side anyway, so sending more only
// costs upload time (https://platform.claude.com/docs/en/build-with-claude/vision).
const MAX_LONG_EDGE = 2576
/** Also the most tokens one image costs: each patch is a token. */
export const MAX_PATCHES = 4784
const PATCH = 28

function patches(width: number, height: number) {
  return Math.ceil(width / PATCH) * Math.ceil(height / PATCH)
}

/** The largest size, keeping the aspect ratio, that fits Claude's image limits. Never enlarges. */
export function fitScreenshot(width: number, height: number): { width: number; height: number } {
  if (!(width > 0 && height > 0)) return { width: 0, height: 0 }
  let scale = Math.min(1, MAX_LONG_EDGE / Math.max(width, height), Math.sqrt((MAX_PATCHES * PATCH * PATCH) / (width * height)))
  let fitted = { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) }
  // Rounding up to whole patches can tip it just over; step down until it fits.
  while (patches(fitted.width, fitted.height) > MAX_PATCHES) {
    scale *= 0.98
    fitted = { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) }
  }
  return fitted
}

// ---- Tall captures ("capture more", stitched or full-page screenshots), read in pieces ----
//
// Shrinking a capture several screens tall into one image leaves text a few pixels high: a
// month-long phone capture comes out 132 px wide, and digits like 6 and 8 merge well before that.
// So a tall capture that would be shrunk to under PIECES_BELOW_SCALE of its size is cut, top to
// bottom, into pieces each as large as an ordinary screenshot, and the pieces are read together in
// one request. Each cut falls in the quietest band of pixel rows near the bottom of a piece (the
// space between lines of text), so no line is split and nothing is repeated between pieces.

/** The most pieces one capture is cut into. Each counts as one screenshot against the rate limits. */
export const MAX_SCREENSHOT_PIECES = 10
/** A tall capture shrunk to under this share of its size is cut into pieces instead. No ordinary
 * screenshot is shrunk this much (a 3x phone screen to about 0.9 at most, a 2x laptop screen to 0.7). */
const PIECES_BELOW_SCALE = 0.7
/** The share of a piece, at its bottom, searched for a place to cut. */
const CUT_WINDOW = 0.15

export type ScreenshotPlan =
  /** Sent as one image, at fitScreenshot's size. */
  | { kind: "whole"; width: number; height: number }
  /**
   * Cut into pieces: the capture is scaled by `scale` (never above 1) to `width` × `height`, then
   * cut into pieces of that width, each at most `pieceHeight` tall.
   */
  | { kind: "pieces"; scale: number; width: number; height: number; pieceHeight: number }

export type PiecesPlan = Extract<ScreenshotPlan, { kind: "pieces" }>

/** The tallest piece of this width that fits Claude's limits on its own. */
function tallestPiece(width: number) {
  return Math.min(MAX_LONG_EDGE, Math.floor(MAX_PATCHES / Math.ceil(width / PATCH)) * PATCH)
}

/** Rows at the bottom of a piece searched for a cut. */
export function cutWindow(pieceHeight: number) {
  return Math.max(2, Math.round(pieceHeight * CUT_WINDOW))
}

/** The most pieces a capture this tall can come to, if every cut falls as high as it can. */
function mostPieces(height: number, pieceHeight: number) {
  const shortest = pieceHeight - cutWindow(pieceHeight) + 1
  return height <= pieceHeight ? 1 : 1 + Math.ceil((height - pieceHeight) / shortest)
}

/**
 * How to send a picked image: whole (shrunk to fit, as fitScreenshot does) or, for a tall capture
 * that would come out too small to read, in pieces. Pieces are as large as Claude reads one image,
 * never enlarged, and shrunk only as far as it takes to stay within MAX_SCREENSHOT_PIECES.
 */
export function planScreenshot(width: number, height: number): ScreenshotPlan {
  const whole = fitScreenshot(width, height)
  if (whole.width === 0 || height <= width) return { kind: "whole", ...whole }
  const wholeScale = whole.height / height
  if (wholeScale >= PIECES_BELOW_SCALE) return { kind: "whole", ...whole }

  let scale = Math.min(1, MAX_LONG_EDGE / width)
  for (;;) {
    const pieceWidth = Math.max(1, Math.floor(width * scale))
    const scaled = { scale: pieceWidth / width, height: Math.max(1, Math.round((height * pieceWidth) / width)) }
    const pieceHeight = tallestPiece(pieceWidth)
    if (mostPieces(scaled.height, pieceHeight) <= MAX_SCREENSHOT_PIECES) {
      return { kind: "pieces", scale: scaled.scale, width: pieceWidth, height: scaled.height, pieceHeight }
    }
    scale *= 0.98
    // So long that pieces would be hardly sharper than the whole image: send it whole.
    if (scale <= wholeScale * 1.25) return { kind: "whole", ...whole }
  }
}

/**
 * Cuts a planned capture into pieces, top to bottom, with no gap and no overlap. `findCut(top)` is
 * given the top of a piece (in the scaled capture) and returns how tall to make it, between
 * `pieceHeight - cutWindow(pieceHeight) + 1` and `pieceHeight - 1` (anything else is clamped).
 * The browser finds it with quietestCut() on the bottom rows of the piece.
 */
export function cutIntoPieces(plan: PiecesPlan, findCut: (top: number) => number): { top: number; height: number }[] {
  const pieces: { top: number; height: number }[] = []
  const lowest = plan.pieceHeight - cutWindow(plan.pieceHeight) + 1
  let top = 0
  while (top < plan.height) {
    const rest = plan.height - top
    if (rest <= plan.pieceHeight) {
      pieces.push({ top, height: rest })
      break
    }
    const cut = Math.round(findCut(top))
    const height = Number.isFinite(cut) ? Math.min(plan.pieceHeight - 1, Math.max(lowest, cut)) : plan.pieceHeight - 1
    pieces.push({ top, height })
    top += height
  }
  return pieces
}

// A pixel counts as changed from the one above it when a color channel differs by more than this.
// Text and icons differ by far more; a flat background, a soft gradient or JPEG noise by far less.
const CHANGED = 24

/**
 * For each pair of neighbouring pixel rows in an RGBA image (as canvas getImageData returns it),
 * how many pixels changed from the upper row to the lower: entry i compares row i with row i + 1.
 */
export function rowChanges(rgba: ArrayLike<number>, width: number, rows: number): Uint32Array {
  const changes = new Uint32Array(Math.max(0, rows - 1))
  const stride = width * 4
  for (let row = 0; row < rows - 1; row++) {
    let count = 0
    for (let at = row * stride, end = at + stride; at < end; at += 4) {
      const below = at + stride
      if (
        Math.abs(rgba[at] - rgba[below]) > CHANGED ||
        Math.abs(rgba[at + 1] - rgba[below + 1]) > CHANGED ||
        Math.abs(rgba[at + 2] - rgba[below + 2]) > CHANGED
      ) {
        count++
      }
    }
    changes[row] = count
  }
  return changes
}

/**
 * Where to cut a band of rows, given its rowChanges(): in the middle of the longest run of rows
 * that change least (the blank space between lines of text), and on a tie the lowest run, so
 * pieces stay large. Returns i: the cut falls between row i and row i + 1 of the band.
 */
export function quietestCut(changes: ArrayLike<number>): number {
  if (changes.length === 0) return 0
  let least = Infinity
  for (let index = 0; index < changes.length; index++) least = Math.min(least, changes[index])
  let best = { start: 0, length: 0 }
  for (let index = 0; index < changes.length; ) {
    if (changes[index] > least) {
      index++
      continue
    }
    const start = index
    while (index < changes.length && changes[index] <= least) index++
    if (index - start >= best.length) best = { start, length: index - start }
  }
  return best.start + Math.floor((best.length - 1) / 2)
}

export type ScreenshotUpload = { mediaType: ScreenshotType; data: string }

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/

/** The first bytes each format starts with, so a renamed file can't pass as an image. */
function startsLike(bytes: number[], mediaType: ScreenshotType) {
  const at = (offset: number, expected: number[]) => expected.every((byte, index) => bytes[offset + index] === byte)
  if (mediaType === "image/jpeg") return at(0, [0xff, 0xd8, 0xff])
  if (mediaType === "image/png") return at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50]) // "RIFF" … "WEBP"
}

/** The size of base64 data once decoded. */
function decodedBytes(data: string) {
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0
  return (data.length / 4) * 3 - padding
}

/**
 * Checks an uploaded screenshot from a request body: a supported type, valid base64, under the
 * size cap, and bytes that really are that kind of image. Says why when it isn't.
 */
export function parseScreenshotUpload(raw: unknown): { ok: true; image: ScreenshotUpload } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "Send one image." }
  const { mediaType, data } = raw as Record<string, unknown>
  if (typeof mediaType !== "string" || !(SCREENSHOT_TYPES as readonly string[]).includes(mediaType)) {
    return { ok: false, error: "Use a JPEG, PNG or WebP image." }
  }
  if (typeof data !== "string" || data.length < 16 || data.length % 4 !== 0 || !BASE64.test(data)) {
    return { ok: false, error: "The image didn't arrive intact. Try again." }
  }
  if (decodedBytes(data) > MAX_SCREENSHOT_BYTES) {
    return { ok: false, error: "That image is too large. Try a smaller screenshot." }
  }
  const head = [...atob(data.slice(0, 16))].map((char) => char.charCodeAt(0))
  if (!startsLike(head, mediaType as ScreenshotType)) {
    return { ok: false, error: "That file isn't an image Sprout can read." }
  }
  return { ok: true, image: { mediaType: mediaType as ScreenshotType, data } }
}

/**
 * Checks the image or images of one screenshot: a single image, or the pieces of a tall capture
 * (planScreenshot), in order. Every piece is checked like a single image, there are at most
 * MAX_SCREENSHOT_PIECES, and together they stay under MAX_SCREENSHOT_BYTES.
 */
export function parseScreenshotUploads(raw: unknown): { ok: true; images: ScreenshotUpload[] } | { ok: false; error: string } {
  const list = Array.isArray(raw) ? raw : [raw]
  if (list.length === 0 || list.length > MAX_SCREENSHOT_PIECES) return { ok: false, error: `Send one screenshot, in at most ${MAX_SCREENSHOT_PIECES} pieces.` }
  const images: ScreenshotUpload[] = []
  let total = 0
  for (const item of list) {
    const parsed = parseScreenshotUpload(item)
    if (!parsed.ok) return parsed
    total += decodedBytes(parsed.image.data)
    if (total > MAX_SCREENSHOT_BYTES) return { ok: false, error: "That image is too large. Try a smaller screenshot." }
    images.push(parsed.image)
  }
  return { ok: true, images }
}
