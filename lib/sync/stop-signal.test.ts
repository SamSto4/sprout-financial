import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"

import { createStoredValue } from "../local-store.ts"
import { onSyncStop, signalSyncStop, SYNC_STOP_KEY } from "./stop-signal.ts"

/**
 * One tab's `window`. Writes through its localStorage stand for another tab's writes: each is
 * queued as the storage event this tab would get, and deliver() dispatches them in write order,
 * as browsers do.
 */
function installFakeWindow() {
  const data = new Map<string, string>()
  const queued: { key: string; newValue: string | null }[] = []
  let failWrites = false
  const localStorage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem(key: string, value: string) {
      if (failWrites) throw new Error("QuotaExceededError")
      if (data.get(key) === value) return // an unchanged value fires no event
      data.set(key, value)
      queued.push({ key, newValue: value })
    },
    removeItem(key: string) {
      if (!data.has(key)) return
      data.delete(key)
      queued.push({ key, newValue: null })
    },
  }
  const target = Object.assign(new EventTarget(), { localStorage })
  Object.defineProperty(globalThis, "window", { value: target, configurable: true, writable: true })
  return {
    queued,
    failWrites: (fail: boolean) => (failWrites = fail),
    deliver() {
      for (const { key, newValue } of queued.splice(0)) {
        target.dispatchEvent(Object.assign(new Event("storage"), { key, newValue }))
      }
    },
  }
}

const parseList = (raw: unknown) => (Array.isArray(raw) ? (raw as string[]) : [])

describe("sync stop signal", () => {
  let tab: ReturnType<typeof installFakeWindow>
  beforeEach(() => {
    tab = installFakeWindow()
  })

  it("calls back for a stop signal only, until unsubscribed", () => {
    let stops = 0
    const unsubscribe = onSyncStop(() => stops++)
    signalSyncStop()
    tab.deliver()
    assert.equal(stops, 1)
    window.localStorage.setItem("sprout-chats", "[]")
    tab.deliver()
    assert.equal(stops, 1)
    unsubscribe()
    signalSyncStop()
    tab.deliver()
    assert.equal(stops, 1)
  })

  it("writes a new value each time, so every signal fires an event", () => {
    signalSyncStop()
    signalSyncStop()
    assert.equal(tab.queued.length, 2)
    assert.ok(tab.queued.every((event) => event.key === SYNC_STOP_KEY && event.newValue !== null))
    assert.notEqual(tab.queued[0].newValue, tab.queued[1].newValue)
  })

  it("removes the key when storage is full, which still reaches the other tabs", () => {
    let stops = 0
    onSyncStop(() => stops++)
    signalSyncStop()
    tab.failWrites(true)
    signalSyncStop()
    tab.deliver()
    assert.equal(stops, 2)
  })

  it("stops another tab's sync before it sees the clearing that follows (two store instances)", () => {
    // Tab 2's sync uploads whatever reaches its subscription, including changes made in tab 1.
    const tab1Chats = createStoredValue<string[]>("sprout-chats", parseList, [])
    const tab2Chats = createStoredValue<string[]>("sprout-chats", parseList, [])
    const uploads: string[][] = []
    const unsubscribeChats = tab2Chats.subscribe(() => uploads.push(tab2Chats.get()))
    const unsubscribeStop = onSyncStop(() => {
      unsubscribeChats()
      unsubscribeStop()
    })

    tab1Chats.set(["keep-me"])
    tab.deliver()
    assert.deepEqual(uploads, [["keep-me"]], "ordinary edits in another tab still sync")

    // Sign-out in tab 1: signal first, then clear.
    signalSyncStop()
    tab1Chats.set([])
    tab.deliver()
    assert.deepEqual(uploads, [["keep-me"]], "the cleared list never reached tab 2's sync")
  })

  it("without the signal, the clearing would reach the other tab's sync", () => {
    const tab1Chats = createStoredValue<string[]>("sprout-chats", parseList, [])
    const tab2Chats = createStoredValue<string[]>("sprout-chats", parseList, [])
    const uploads: string[][] = []
    tab2Chats.subscribe(() => uploads.push(tab2Chats.get()))
    tab1Chats.set(["keep-me"])
    tab.deliver()
    tab1Chats.set([])
    tab.deliver()
    assert.deepEqual(uploads, [["keep-me"], []], "tab 2 would upload the empty list, deleting every chat")
  })
})
