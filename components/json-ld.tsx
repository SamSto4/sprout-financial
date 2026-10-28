import { serializeJsonLd, type JsonLdObject } from "@/lib/seo/json-ld"

/**
 * Structured data for search engines (builders in lib/seo/json-ld.ts). A type="application/ld+json"
 * script is a data block: browsers never run it, so it needs no nonce under the page's
 * Content-Security-Policy (lib/security-headers.ts), and React doesn't warn about it.
 * serializeJsonLd escapes "<", so no value can end the tag early.
 */
export function JsonLd({ data }: { data: JsonLdObject }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />
}
