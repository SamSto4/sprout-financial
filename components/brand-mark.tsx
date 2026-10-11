import { cn } from "cn"

// A small ledger-style mark: three rising bars on a baseline.
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("size-6", className)}>
      <rect width="24" height="24" rx="6" fill="var(--primary)" />
      <rect x="6" y="13" width="3" height="5" rx="1" fill="#9ccfae" />
      <rect x="10.5" y="10" width="3" height="8" rx="1" fill="#e8f5ec" />
      <rect x="15" y="6" width="3" height="12" rx="1" fill="#ffffff" />
    </svg>
  )
}
