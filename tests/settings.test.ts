import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaults,
  effective,
  siteFor,
  fromStorage,
  supported,
  hostname,
} from "../src/settings.ts";
test("defaults and global precedence retain site overrides", () => {
  const s = defaults();
  assert.equal(effective(s, "a.test"), true);
  s.sites["a.test"] = { enabled: true, force: true };
  s.enabled = false;
  assert.equal(effective(s, "a.test"), false);
  assert.equal(siteFor(s, "a.test").force, true);
});
test("hostname isolation and reset", () => {
  const raw = { "site:a.test": { enabled: false, force: true } };
  const s = fromStorage(raw);
  assert.equal(effective(s, "a.test"), false);
  assert.equal(effective(s, "sub.a.test"), true);
  delete s.sites["a.test"];
  assert.deepEqual(siteFor(s, "a.test"), {
    enabled: true,
    force: false,
  });
  assert.equal(hostname("https://a.test/path"), "a.test");
});
test("legacy forced preferences become automatic without changing enabled state", () => {
  const s = fromStorage(
    JSON.parse(
      JSON.stringify({
        enabled: false,
        "site:a.test": { enabled: true, force: true },
      }),
    ),
  );
  assert.equal(s.enabled, false);
  assert.deepEqual(s.sites["a.test"], {
    enabled: true,
    force: false,
  });
});
test("protected and malformed URLs", () => {
  for (const u of [
    "chrome://extensions",
    "https://chromewebstore.google.com/detail/x",
    "https://chrome.google.com/webstore/x",
    "oops",
  ])
    assert.equal(supported(u), false);
  assert.equal(supported("https://example.com"), true);
});

test("removed accent preferences are ignored without changing site choices", () => {
  const s = fromStorage({
    accents: true,
    "site:a.test": { enabled: false, accents: true },
  });
  assert.equal("accents" in s, false);
  assert.equal(siteFor(s, "a.test").enabled, false);
});

test("hostname records do not inherit JavaScript object properties", () => {
  assert.equal(effective(defaults(), "constructor"), true);
  assert.equal(effective(defaults(), "toString"), true);
  const s = fromStorage({
    "site:__proto__": { enabled: false },
    "site:constructor": { enabled: false },
  });
  assert.equal(effective(s, "__proto__"), false);
  assert.equal(effective(s, "constructor"), false);
  assert.equal(effective(s, "example.com"), true);
  assert.equal(Object.getPrototypeOf(s.sites), null);
});
