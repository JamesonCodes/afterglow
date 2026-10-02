import { test } from "node:test";
import assert from "node:assert/strict";
import { darkSurface } from "../src/detection.ts";

test("native dark recognizes muted text through relative contrast", () => {
  assert.equal(darkSurface([20, 20, 19, 1], [135, 134, 127, 1]), true);
  assert.equal(darkSurface([20, 20, 19, 1], [250, 249, 245, 1]), true);
  assert.equal(darkSurface([250, 249, 245, 1], [123, 122, 114, 1]), false);
  assert.equal(darkSurface([20, 20, 19, 1], [34, 34, 34, 1]), false);
  assert.equal(darkSurface([60, 60, 60, 1], [0, 0, 0, 1]), false);
});

test("native dark measures translucent foreground over its background", () => {
  assert.equal(darkSurface([20, 20, 19, 1], [255, 255, 255, 0.6]), true);
  assert.equal(darkSurface([20, 20, 19, 1], [255, 255, 255, 0.1]), false);
  assert.equal(darkSurface([20, 20, 19, 1], [255, 255, 255, 0]), false);
});
