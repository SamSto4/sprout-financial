import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { DATA_KEYS, isDataKey } from "./data-keys.ts"

describe("isDataKey", () => {
  it("accepts every synced data name", () => {
    for (const key of DATA_KEYS) assert.equal(isDataKey(key), true)
  })

  it("rejects names inherited from Object.prototype, which used to skip validation", () => {
    for (const key of ["constructor", "toString", "valueOf", "__proto__", "hasOwnProperty", "__defineGetter__"]) {
      assert.equal(isDataKey(key), false, key)
    }
  })

  it("rejects unknown names, other cases and non-strings", () => {
    for (const key of ["chats", "Finances", "finances ", "", undefined, null, 1, ["finances"]]) {
      assert.equal(isDataKey(key), false, String(key))
    }
  })
})
