import { cn } from "cn"

// Sprout's recurring motif: a thin compound-growth curve rising left to right, with a small
// leaf where it ends. Decorative only. The curve is the shape of real compounding (slow, then
// faster), never a chart of data, so it carries no numbers.
//
// `draw` traces the line in once on load. It's CSS only, so it runs without JavaScript, and under
// reduced motion the line is simply shown.
export function GrowthLine({
  className,
  draw = false,
  leaf = true,
}: {
  className?: string
  draw?: boolean
  leaf?: boolean
}) {
  return (
    <svg
      viewBox="0 0 240 80"
      fill="none"
      aria-hidden="true"
      preserveAspectRatio="none"
      className={cn("text-brand", className)}
    >
      <path
        d="M2 76 C 70 74, 120 66, 160 48 S 214 12, 232 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        pathLength={1}
        className={draw ? "growth-line-draw" : undefined}
      />
      {leaf && (
        <path
          d="M232 6 c 2 -5 6 -6 8 -5 c -1 3 -3 6 -8 5 Z"
          fill="currentColor"
          className={draw ? "growth-line-leaf" : undefined}
        />
      )}
    </svg>
  )
}
