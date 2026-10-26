"use client"

import { useRef, type ComponentProps } from "react"
import { ImagePlusIcon, LoaderCircleIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { MAX_SCREENSHOTS } from "@/lib/screenshots/image"

/**
 * Opens the photo picker for screenshots. On a phone, image/* lets the person pick from their
 * photos or take a picture. While screenshots are being read, it shows how far along it is.
 */
export function ScreenshotButton({
  onFiles,
  progress,
  label = "Add from screenshots",
  variant = "outline",
  size = "sm",
}: {
  onFiles: (files: File[]) => void
  progress: { done: number; total: number } | null
  label?: string
  variant?: ComponentProps<typeof Button>["variant"]
  size?: ComponentProps<typeof Button>["size"]
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const busy = progress !== null

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])]
          event.target.value = ""
          if (files.length > 0) onFiles(files)
        }}
      />
      <Button
        type="button"
        variant={variant}
        size={size}
        className="disabled:opacity-100"
        disabled={busy}
        aria-busy={busy}
        onClick={() => inputRef.current?.click()}
        title={`Up to ${MAX_SCREENSHOTS} at a time`}
      >
        {busy ? <LoaderCircleIcon className="animate-spin" /> : <ImagePlusIcon />}
        {busy ? `Reading ${progress.total === 1 ? "screenshot" : `${Math.min(progress.done + 1, progress.total)} of ${progress.total}`}…` : label}
      </Button>
      <span className="sr-only" aria-live="polite">
        {busy ? `Reading screenshots, ${progress.done} of ${progress.total} done` : ""}
      </span>
    </>
  )
}

/** The privacy line shown wherever screenshots can be added. */
export function ScreenshotPrivacyNote({ className }: { className?: string }) {
  return (
    <p className={className ?? "text-xs leading-relaxed text-muted-foreground"}>
      Screenshots are read by Sprout&apos;s AI model and then discarded; only the rows you approve are saved. Crop out
      full account numbers first.
    </p>
  )
}
