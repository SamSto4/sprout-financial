// Browser only: turns a picked image into what /api/import/screenshot accepts. Redrawing it on a
// canvas shrinks it to what Claude reads anyway (fitScreenshot), turns it into a JPEG, and leaves
// behind the photo's hidden metadata, such as where it was taken. Uses the DOM, so it isn't
// covered by `node --test`; the size rules it relies on are (image.test.ts).

import { fitScreenshot, MAX_ORIGINAL_BYTES, MAX_SCREENSHOT_BYTES, type ScreenshotUpload } from "./image.ts"

/** A problem worth showing the person as-is. */
export class PrepareError extends Error {}

// Lower qualities are tried only if the image is still too large; text stays readable at all three.
const JPEG_QUALITIES = [0.9, 0.8, 0.7]

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

export async function prepareScreenshot(file: File): Promise<ScreenshotUpload> {
  if (file.size > MAX_ORIGINAL_BYTES) throw new PrepareError("That picture is over 25 MB. Use a screenshot instead.")

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new PrepareError("Couldn't open that picture. Try a PNG or JPEG screenshot.")
  }
  const { width, height } = fitScreenshot(bitmap.width, bitmap.height)
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  if (!context || width === 0) {
    bitmap.close()
    throw new PrepareError("Couldn't open that picture. Try a PNG or JPEG screenshot.")
  }
  // JPEG has no transparency: without a white background, a transparent PNG would turn black.
  context.fillStyle = "#fff"
  context.fillRect(0, 0, width, height)
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  for (const quality of JPEG_QUALITIES) {
    const blob = await toJpeg(canvas, quality)
    if (blob && blob.size <= MAX_SCREENSHOT_BYTES) return { mediaType: "image/jpeg", data: await toBase64(blob) }
  }
  throw new PrepareError("That picture is too detailed to send. Try a screenshot of just the list.")
}
