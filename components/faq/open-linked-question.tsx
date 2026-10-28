"use client"

import { useEffect } from "react"

/**
 * Opens the question a link points at (/faq#some-question). Browsers scroll to the target but
 * leave a <details> closed (Chromium only opens one when the target is inside it). Runs on arrival,
 * including after an in-app navigation from the home page, and whenever the hash changes.
 */
export function OpenLinkedQuestion() {
  useEffect(() => {
    function openTarget() {
      // FAQ ids are lower-case ASCII slugs (lib/faq.test.ts), so the hash needs no decoding.
      const id = window.location.hash.slice(1)
      if (!id) return
      const target = document.getElementById(id)
      if (target instanceof HTMLDetailsElement && !target.open) {
        target.open = true
        // No smooth scrolling: an instant jump also suits reduced motion.
        target.scrollIntoView({ block: "start" })
      }
    }
    openTarget()
    window.addEventListener("hashchange", openTarget)
    return () => window.removeEventListener("hashchange", openTarget)
  }, [])
  return null
}
