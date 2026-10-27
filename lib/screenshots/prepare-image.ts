// Browser only: turns a picked image into what /api/import/screenshot accepts. Redrawing it on a
// canvas shrinks it to what Claude reads anyway (planScreenshot), turns it into JPEG, and leaves
// behind the photo's hidden metadata, such as where it was taken. A tall capture comes back as
// several pieces, cut between lines of text, for the server to read together. Uses the DOM, so
// it isn't covered by `node --test`; the size and cutting rules it relies on are (image.test.ts).
// The screenshot eval runs this same file in a browser (evals/screenshots/render.mts), so keep
// it to standard DOM APIs and imports from ./image.ts only.

import {
  cutIntoPieces,
  cutWindow,
  MAX_ORIGINAL_BYTES,
  MAX_SCREENSHOT_BYTES,
  planScreenshot,
  quietestCut,
  rowChanges,
  type ScreenshotUpload,
} from "./image.ts"

/** A problem worth showing the person as-is. */
export class PrepareError extends Error {}

// Lower qualities are tried only if the image is still too large; text stays readable at all three.
const JPEG_QUALITIES = [0.9, 0.8, 0.7]

const UNREADABLE = "Couldn't open that picture. Try a PNG or JPEG screenshot."

function toJpeg(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality))
}

function toBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/**
 * Part of the picture (source rows from `sourceTop`, `sourceHeight` of them) drawn at `width` ×
 * `height`. `toRead` when its pixels will be read back, which keeps the canvas off the GPU.
 */
function draw(bitmap: ImageBitmap, sourceTop: number, sourceHeight: number, width: number, height: number, toRead = false) {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d", { willReadFrequently: toRead })
  if (!context) throw new PrepareError(UNREADABLE)
  // JPEG has no transparency: without a white background, a transparent PNG would turn black.
  context.fillStyle = "#fff"
  context.fillRect(0, 0, width, height)
  // The default ("low") skips source pixels when shrinking a lot, which merges thin strokes, so a
  // 6 reads as an 8. "high" averages them.
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = "high"
  context.drawImage(bitmap, 0, sourceTop, bitmap.width, Math.min(sourceHeight, bitmap.height - sourceTop), 0, 0, width, height)
  return { canvas, context }
}

/** Frees a canvas's memory now rather than whenever it's collected (Safari caps the total). */
function release(canvas: HTMLCanvasElement) {
  canvas.width = 0
  canvas.height = 0
}

type Piece = { sourceTop: number; sourceHeight: number; width: number; height: number }

/** The image to send, or for a tall capture the pieces, cut where no line of text is split. */
function planPieces(bitmap: ImageBitmap): Piece[] {
  const plan = planScreenshot(bitmap.width, bitmap.height)
  if (plan.kind === "whole") {
    if (plan.width === 0) throw new PrepareError(UNREADABLE)
    return [{ sourceTop: 0, sourceHeight: bitmap.height, width: plan.width, height: plan.height }]
  }
  const window = cutWindow(plan.pieceHeight)
  const pieces = cutIntoPieces(plan, (top) => {
    // Draw the tallest piece that could start here and find the quietest rows near its bottom.
    const { canvas, context } = draw(bitmap, top / plan.scale, plan.pieceHeight / plan.scale, plan.width, plan.pieceHeight, true)
    const band = context.getImageData(0, plan.pieceHeight - window, plan.width, window).data
    release(canvas)
    return plan.pieceHeight - window + quietestCut(rowChanges(band, plan.width, window)) + 1
  })
  const result = pieces.map(({ top, height }) => ({ sourceTop: top / plan.scale, sourceHeight: height / plan.scale, width: plan.width, height }))
  // A last piece with nothing on it (the empty space below a list) would only cost a read.
  const last = result[result.length - 1]
  if (result.length > 1) {
    const { canvas, context } = draw(bitmap, last.sourceTop, last.sourceHeight, last.width, last.height, true)
    const blank = rowChanges(context.getImageData(0, 0, last.width, last.height).data, last.width, last.height).every((count) => count === 0)
    release(canvas)
    if (blank) result.pop()
  }
  return result
}

/**
 * The picked image as the server takes it: one JPEG, or the pieces of a tall capture in order,
 * together under MAX_SCREENSHOT_BYTES.
 */
export async function prepareScreenshot(file: File): Promise<ScreenshotUpload[]> {
  if (file.size > MAX_ORIGINAL_BYTES) throw new PrepareError("That picture is over 25 MB. Use a screenshot instead.")

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new PrepareError(UNREADABLE)
  }
  try {
    const pieces = planPieces(bitmap)
    for (const quality of JPEG_QUALITIES) {
      const blobs: Blob[] = []
      let total = 0
      for (const piece of pieces) {
        const { canvas } = draw(bitmap, piece.sourceTop, piece.sourceHeight, piece.width, piece.height)
        const blob = await toJpeg(canvas, quality)
        release(canvas)
        if (!blob) throw new PrepareError(UNREADABLE)
        total += blob.size
        if (total > MAX_SCREENSHOT_BYTES) break
        blobs.push(blob)
      }
      if (total <= MAX_SCREENSHOT_BYTES) {
        return Promise.all(blobs.map(async (blob) => ({ mediaType: "image/jpeg" as const, data: await toBase64(blob) })))
      }
    }
    throw new PrepareError("That picture is too detailed to send. Try a screenshot of just the list.")
  } finally {
    bitmap.close()
  }
}
