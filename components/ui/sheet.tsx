"use client"

// A panel that slides up from the bottom of the screen, on Base UI's Dialog (already a dependency,
// as for the other primitives here): it traps focus, closes on Escape or a tap outside, and gives
// focus back to whatever opened it. Used on phones, where a side panel has no room.

import { Dialog as SheetPrimitive } from "@base-ui/react/dialog"
import { XIcon } from "lucide-react"
import { cn } from "cn"

function Sheet(props: SheetPrimitive.Root.Props) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return <SheetPrimitive.Title data-slot="sheet-title" className={cn("font-sans text-base font-semibold", className)} {...props} />
}

function SheetDescription({ className, ...props }: SheetPrimitive.Description.Props) {
  return <SheetPrimitive.Description data-slot="sheet-description" className={cn("text-sm text-muted-foreground", className)} {...props} />
}

function SheetContent({
  className,
  children,
  closeLabel = "Close",
  ...props
}: SheetPrimitive.Popup.Props & { closeLabel?: string }) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Backdrop
        data-slot="sheet-overlay"
        className="fixed inset-0 z-50 bg-foreground/25 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0"
      />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 flex max-h-[85svh] flex-col rounded-t-2xl border-t bg-background shadow-[0_-12px_32px_-16px_rgb(24_53_42/0.3)] outline-none transition-transform duration-250 ease-out data-ending-style:translate-y-full data-starting-style:translate-y-full",
          className
        )}
        {...props}
      >
        <div aria-hidden="true" className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border" />
        <SheetPrimitive.Close
          aria-label={closeLabel}
          className="absolute top-2.5 right-3 inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <XIcon className="size-4" aria-hidden="true" />
        </SheetPrimitive.Close>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
      </SheetPrimitive.Popup>
    </SheetPrimitive.Portal>
  )
}

export { Sheet, SheetContent, SheetDescription, SheetTitle }
