import { test } from "node:test";
import assert from "node:assert/strict";
import { contrast } from "../src/logos.ts";
test("logo contrast uses linearized luminance and a symmetric ratio", () => {
  assert.equal(contrast([0, 0, 0], [255, 255, 255]), 21);
  assert.equal(contrast([24, 26, 31], [24, 26, 31]), 1);
  assert.ok(contrast([34, 34, 34], [24, 26, 31]) < 3);
  assert.ok(contrast([230, 232, 237], [24, 26, 31]) > 3);
  assert.equal(
    contrast([150, 30, 90], [24, 26, 31]),
    contrast([24, 26, 31], [150, 30, 90]),
  );
});
