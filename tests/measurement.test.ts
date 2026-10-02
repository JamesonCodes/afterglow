import { test } from "node:test";
import assert from "node:assert/strict";
import { originalColors } from "../src/owned-styles.ts";
test("original-color measurement restores every sheet even when detection fails", () => {
  const sheets = [{ disabled: false }, { disabled: true }];
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { querySelectorAll: () => sheets.map((sheet) => ({ sheet })) },
  });
  try {
    assert.throws(
      () =>
        originalColors(() => {
          assert.ok(sheets.every((s) => s.disabled));
          throw Error("measurement failed");
        }),
      /measurement failed/,
    );
    assert.deepEqual(
      sheets.map((s) => s.disabled),
      [false, true],
    );
    assert.equal(
      originalColors(() => 42),
      42,
    );
    assert.deepEqual(
      sheets.map((s) => s.disabled),
      [false, true],
    );
  } finally {
    if (previous) Object.defineProperty(globalThis, "document", previous);
    else delete (globalThis as any).document;
  }
});
