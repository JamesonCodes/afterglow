import { test } from "node:test";
import assert from "node:assert/strict";
import { siteCSS } from "../src/site-fixes.ts";
test("Amazon compatibility rules are scoped to Amazon.com and its subdomains", () => {
  assert.ok(siteCSS("amazon.com").includes("mix-blend-mode: normal"));
  assert.equal(siteCSS("www.amazon.com"), siteCSS("amazon.com"));
  for (const host of [
    "example.com",
    "notamazon.com",
    "amazon.com.example.com",
    "amazon.co.uk",
    "",
  ])
    assert.equal(siteCSS(host), "");
});
