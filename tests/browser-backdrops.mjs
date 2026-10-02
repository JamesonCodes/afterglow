import { chromium } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const profile = await mkdtemp(resolve(tmpdir(), "afterglow-backdrops-"));
const extension = resolve(process.env.AFTERGLOW_EXTENSION_PATH ?? "dist");
const context = await chromium.launchPersistentContext(profile, {
  channel: "chromium",
  headless: true,
  colorScheme: "dark",
  args: [
    `--disable-extensions-except=${extension}`,
    `--load-extension=${extension}`,
  ],
});
try {
  await context.route("https://fixture.example/**", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><style>body{margin:0;color:#aaa}#backdrop{position:fixed;inset:0;background:#0d0a0f;z-index:-10;pointer-events:none}main{min-height:100vh;display:grid;grid-template-columns:repeat(3,1fr)}p{padding:40px}input{position:fixed;bottom:0}</style></head><body><span id="backdrop"></span><main>${"<p>Visible documentation text</p>".repeat(9)}</main><input aria-label="Draft"></body></html>`,
    }),
  );
  const page = await context.newPage();
  await page.goto("https://fixture.example/");
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  const tab = await worker.evaluate(
    async () =>
      (await chrome.tabs.query({})).find(
        (t) => t.url === "https://fixture.example/",
      ).id,
  );
  const status = async (expected) => {
    let actual;
    for (let i = 0; i < 50; i++) {
      actual = await worker.evaluate(async (id) => {
        try {
          return (await chrome.tabs.sendMessage(id, { type: "status" })).status;
        } catch {
          return "loading";
        }
      }, tab);
      if (actual === expected) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.equal(actual, expected);
  };
  await status("Native dark theme");
  assert.equal(await page.locator("style.darkreader").count(), 0);
  await page.getByLabel("Draft").fill("Keep layered draft");
  await page.evaluate(() => {
    document.querySelector("#backdrop").style.background = "white";
    document.body.style.color = "#222";
  });
  await status("Afterglow active");
  await page.evaluate(() => {
    document.querySelector("#backdrop").style.background = "#0d0a0f";
    document.body.style.color = "#aaa";
  });
  await status("Native dark theme");
  // A hidden or small dark decoration cannot represent a light page.
  await page.evaluate(() => {
    document.querySelector("#backdrop").style.display = "none";
    document.body.style.color = "#222";
  });
  await status("Afterglow active");
  await page.evaluate(() => {
    document.querySelector("#backdrop").style.cssText = "height:60px";
  });
  await status("Afterglow active");
  // Explicit page surfaces win over a dark layer behind them.
  await page.evaluate(() => {
    document.querySelector("#backdrop").style.cssText = "";
    document.querySelector("main").style.background = "white";
  });
  await status("Afterglow active");
  // Native Canvas is dark with color-scheme:dark, even with no painted layer.
  await page.evaluate(() => {
    document.querySelector("#backdrop").style.display = "none";
    document.querySelector("main").style.background = "transparent";
    document.documentElement.style.colorScheme = "dark";
    document.body.style.color = "#aaa";
  });
  await status("Native dark theme");
  await page.evaluate(() => {
    document.documentElement.style.colorScheme = "light";
    document.body.style.color = "#222";
  });
  await status("Afterglow active");
  // Translucent containers composite over the dark background, not white.
  await page.evaluate(() => {
    document.querySelector("#backdrop").style.display = "block";
    document.querySelector("main").style.background = "rgba(255,255,255,.05)";
    document.body.style.color = "#aaa";
  });
  await status("Native dark theme");
  assert.equal(await page.locator("style.darkreader").count(), 0);
  assert.equal(
    await page.getByLabel("Draft").inputValue(),
    "Keep layered draft",
  );
  assert.equal(await page.locator(".afterglow-owned:not(style)").count(), 0);
  console.log(
    "PASS: sibling background, light/dark switching, hidden/small/covered backdrops, native canvas, translucency, probe cleanup and drafts",
  );
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}
