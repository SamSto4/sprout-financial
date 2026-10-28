// Plain-text versions of an assistant reply: one to copy, one for screen readers to announce.
// Kept free of framework imports so it can be unit-tested with `node --test`.

import { compactArtifacts, type ArtifactKind } from "../ai/artifacts.ts"

/** Longest announcement read out when a reply finishes; the rest stays in the conversation. */
export const MAX_SPOKEN_LENGTH = 1500

const name = (kind: ArtifactKind) => (kind === "chart" ? "Chart" : "Table")

/** The reply as Markdown, with each chart or table named instead of its JSON. */
export function copyText(markdown: string): string {
  return compactArtifacts(markdown, (kind, title) => `[${name(kind)}${title ? `: ${title}` : ""}]`).trim()
}

/**
 * The reply as plain sentences for a screen reader: no Markdown symbols, table rows read as
 * comma-separated cells, charts and tables named by title. Cut at a word after `max` characters.
 */
export function spokenText(markdown: string, max = MAX_SPOKEN_LENGTH): string {
  // Only the start can be read out, and cutting first keeps the patterns below fast on any input
  // (some are quadratic on long hostile lines; 4 characters of Markdown per spoken one is plenty).
  const text = compactArtifacts(markdown, (kind, title) => `\n${name(kind)}${title ? `: ${title}` : ""}.\n`)
    .slice(0, max * 4)
    .replace(/^ {0,3}(```|~~~).*$/gm, "") // code fence lines
    .replace(/^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(\|[ \t]*:?-{3,}:?[ \t]*)*\|?[ \t]*$/gm, "") // table divider rows
    .replace(/^[ \t]*\|(.*)\|[ \t]*$/gm, (_row, cells: string) => `${cells.split("|").map((cell) => cell.trim()).filter(Boolean).join(", ")}.`)
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1") // links (and images, which the chat never shows) keep their text
    .replace(/^ {0,3}#{1,6}[ \t]+(.*?)[ \t#]*$/gm, (_line, title: string) => (/[.!?:]$/.test(title) ? title : `${title}.`)) // headings end in a pause
    .replace(/^ {0,3}>\s?/gm, "") // quotes
    .replace(/^[ \t]*([-*_])([ \t]*\1){2,}[ \t]*$/gm, "") // horizontal rules
    .replace(/^[ \t]*[-*+][ \t]+/gm, "") // bullets
    .replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, "$2") // bold
    .replace(/(?<![\w*])\*(?=\S)(.+?)(?<=\S)\*(?![\w*])/g, "$1") // italic with *
    .replace(/(?<!\w)_(?=\S)(.+?)(?<=\S)_(?!\w)/g, "$1") // italic with _
    .replace(/`([^`]*)`/g, "$1") // inline code
    .replace(/\s+/g, " ")
    .trim()
  if (text.length <= max) return text
  const cut = text.slice(0, max - 1)
  const space = cut.lastIndexOf(" ")
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,.;:]+$/, "")}…`
}
