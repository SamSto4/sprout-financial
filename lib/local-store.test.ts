import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"

import { createStoredValue } from "./local-store.ts"

/**
 * One tab's `window`, with another tab writing to the same storage: otherTab writes straight to
 * storage and queues the storage event this tab would get; deliver() dispatches them in order.
 */
function installFakeWindow() {
  const data = new Map<string, string>()
  const queued: { key: string | null }[] = []
  const localStorage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  }
  const target = Object.assign(new EventTarget(), { localStorage })
  Object.defineProperty(globalThis, "window", { value: target, configurable: true, writable: true })
  return {
    otherTab: {
      set(key: string, value: unknown) {
        data.set(key, JSON.stringify(value))
        queued.push({ key })
      },
      remove(key: string) {
        data.delete(key)
        queued.push({ key })
      },
      clearAll() {
        data.clear()
        queued.push({ key: null })
      },
    },
    deliver() {
      for (const { key } of queued.splice(0)) target.dispatchEvent(Object.assign(new Event("storage"), { key }))
    },
  }
}

const parseList = (raw: unknown) => (Array.isArray(raw) ? (raw as string[]) : [])

describe("createStoredValue", () => {
  let tab: ReturnType<typeof installFakeWindow>
  beforeEach(() => {
    tab = installFakeWindow()
  })

  it("reads another tab's change even when nothing in this tab is subscribed", () => {
    // A tab whose page doesn't show the budget: only account sync reads it, when it starts.
    tab.otherTab.set("sprout-budgets", ["old account's month"])
    tab.deliver()
    const budgets = createStoredValue<string[]>("sprout-budgets", parseList, [])
    assert.deepEqual(budgets.get(), ["old account's month"])

    // Another tab clears this browser's copy (a new account signs in there), then syncs its own.
    tab.otherTab.remove("sprout-budgets")
    tab.deliver()
    assert.deepEqual(budgets.get(), [], "the cleared value, not the copy loaded before")
    tab.otherTab.set("sprout-budgets", ["new account's month"])
    tab.deliver()
    assert.deepEqual(budgets.get(), ["new account's month"])
  })

  it("keeps watching after the last subscriber leaves (account sync stopped)", () => {
    const chats = createStoredValue<string[]>("sprout-chats", parseList, [])
    const seen: string[][] = []
    const unsubscribe = chats.subscribe(() => seen.push(chats.get()))
    tab.otherTab.set("sprout-chats", ["a"])
    tab.deliver()
    assert.deepEqual(seen, [["a"]])
    unsubscribe()
    tab.otherTab.set("sprout-chats", [])
    tab.deliver()
    assert.deepEqual(seen, [["a"]], "no longer told")
    assert.deepEqual(chats.get(), [], "but still reads the current value")
  })

  it("reloads after site data is cleared in another tab", () => {
    tab.otherTab.set("sprout-chats", ["a"])
    tab.deliver()
    const chats = createStoredValue<string[]>("sprout-chats", parseList, [])
    assert.deepEqual(chats.get(), ["a"])
    tab.otherTab.clearAll()
    tab.deliver()
    assert.deepEqual(chats.get(), [])
  })

  it("ignores other keys and keeps the same value until something changes", () => {
    tab.otherTab.set("sprout-chats", ["a"])
    tab.deliver()
    const chats = createStoredValue<string[]>("sprout-chats", parseList, [])
    const first = chats.get()
    tab.otherTab.set("sprout-budgets", ["b"])
    tab.deliver()
    assert.equal(chats.get(), first, "useSyncExternalStore needs a stable value between changes")
  })

  it("tells subscribers about another tab's change with the new value already in place", () => {
    const chats = createStoredValue<string[]>("sprout-chats", parseList, [])
    const seen: string[][] = []
    chats.subscribe(() => seen.push(chats.get()))
    chats.subscribe(() => seen.push(chats.get()))
    tab.otherTab.set("sprout-chats", ["x"])
    tab.deliver()
    assert.deepEqual(seen, [["x"], ["x"]])
  })
})
