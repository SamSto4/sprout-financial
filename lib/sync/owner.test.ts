import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { localCopyAction, sameOwnerMarker, syncOwner } from "./owner.ts"

describe("localCopyAction", () => {
  it("merges a copy that was never synced: the visitor's own data from before signing in", () => {
    assert.equal(localCopyAction(null, "b@x.com"), "merge")
    assert.equal(localCopyAction(undefined, "b@x.com"), "merge")
  })

  it("merges the account's own copy, whatever the case of the address", () => {
    assert.equal(localCopyAction(syncOwner("a@x.com", "t1"), "a@x.com"), "merge")
    assert.equal(localCopyAction(syncOwner("A@X.com", "t1"), "a@x.COM"), "merge")
  })

  it("discards a copy left by another account", () => {
    assert.equal(localCopyAction(syncOwner("a@x.com", "t1"), "b@x.com"), "discard")
  })

  it("discards a marker that isn't one, rather than guessing whose it is", () => {
    for (const stored of ["a@x.com", 3, true, {}, { email: 3 }, []]) {
      assert.equal(localCopyAction(stored, "a@x.com"), "discard", JSON.stringify(stored))
    }
  })
})

describe("syncOwner and sameOwnerMarker", () => {
  it("stores the address in lower case", () => {
    assert.deepEqual(syncOwner("Ann@Example.COM", "t"), { email: "ann@example.com", token: "t" })
  })

  it("is the same marker only when nothing has started a sync since", () => {
    const before = syncOwner("a@x.com", "t1")
    assert.equal(sameOwnerMarker(before, { ...before }), true)
    assert.equal(sameOwnerMarker(before, syncOwner("a@x.com", "t2")), false, "a sync started again")
    assert.equal(sameOwnerMarker(before, syncOwner("b@x.com", "t1")), false)
    assert.equal(sameOwnerMarker(before, null), false, "already cleared")
    assert.equal(sameOwnerMarker(null, null), false, "no marker: nothing to clear")
  })
})
