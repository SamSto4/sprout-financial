// Images drawn by next/og (Satori) at build time: the card shown when a Sprout link is shared
// (app/opengraph-image.tsx, app/(pages)/learn/[lesson]/opengraph-image.tsx) and the home-screen
// icon (app/apple-icon.tsx). Satori supports flexbox and a subset of CSS, and these use its bundled
// Geist font, so nothing is downloaded during the build. Colors are DESIGN.md's palette; keep them
// in step with app/globals.css and components/brand-mark.tsx.

import { SITE_NAME } from "@/lib/site"

const COLOR = {
  primary: "#216B47",
  surface: "#F4FAF6",
  text: "#18352A",
  muted: "#60756A",
  border: "#DDEBE2",
  barShort: "#9CCFAE",
  barMiddle: "#E8F5EC",
  barTall: "#FFFFFF",
}

/** The brand mark (components/brand-mark.tsx) drawn with boxes: three rising bars on green. */
export function BrandMarkImage({ size, rounded = true }: { size: number; rounded?: boolean }) {
  const unit = size / 24
  const bar = (left: number, top: number, height: number, color: string) => (
    <div
      style={{
        position: "absolute",
        left: left * unit,
        top: top * unit,
        width: 3 * unit,
        height: height * unit,
        borderRadius: unit,
        background: color,
      }}
    />
  )
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        width: size,
        height: size,
        borderRadius: rounded ? 6 * unit : 0,
        background: COLOR.primary,
      }}
    >
      {bar(6, 13, 5, COLOR.barShort)}
      {bar(10.5, 10, 8, COLOR.barMiddle)}
      {bar(15, 6, 12, COLOR.barTall)}
    </div>
  )
}

/** A 1200 x 630 share card: brand, an optional eyebrow, the title, and a footer line. */
export function SocialCard({ eyebrow, title, footer }: { eyebrow?: string; title: string; footer: string }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: COLOR.surface,
        color: COLOR.text,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <BrandMarkImage size={64} />
        <div style={{ fontSize: 40 }}>{SITE_NAME}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {eyebrow ? (
          // No letterSpacing: Satori adds it unevenly around the spaces either side of a "·".
          <div style={{ fontSize: 28, color: COLOR.primary, textTransform: "uppercase" }}>{eyebrow}</div>
        ) : null}
        <div style={{ fontSize: 72, lineHeight: 1.1, maxWidth: 1000 }}>{title}</div>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          borderTop: `2px solid ${COLOR.border}`,
          paddingTop: 28,
          fontSize: 26,
          color: COLOR.muted,
        }}
      >
        <div>{footer}</div>
        <div>Educational, not financial advice</div>
      </div>
    </div>
  )
}
