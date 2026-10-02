import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const server = createServer((req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.end(
    '<!doctype html><html><head><style>body{margin:0;min-height:100vh;background:white;color:black}main{min-height:100vh}span{background:red!important;color-scheme:dark!important}</style></head><body><main><h1>Browser darkening</h1><p>Ordinary light content</p><input aria-label="Draft"></main></body></html>',
  );
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
try {
  for (const force of [false, true]) {
    const profile = await mkdtemp(resolve(tmpdir(), "afterglow-browser-dark-"));
    let context;
    try {
      const extension = resolve("dist");
      context = await chromium.launchPersistentContext(profile, {
        channel: "chromium",
        headless: true,
        colorScheme: "light",
        args: [
          `--disable-extensions-except=${extension}`,
          `--load-extension=${extension}`,
          ...(force ? ["--blink-settings=forceDarkModeEnabled=true"] : []),
        ],
      });
      const page = await context.newPage();
      const url = `http://127.0.0.1:${server.address().port}/`;
      await page.goto(url);
      const worker =
        context.serviceWorkers()[0] ??
        (await context.waitForEvent("serviceworker"));
      const tab = await worker.evaluate(
        async (url) =>
          (await chrome.tabs.query({})).find((t) => t.url === url).id,
        url,
      );
      const expectStatus = async (expected) => {
        let actual;
        for (let i = 0; i < 50; i++) {
          actual = await worker.evaluate(async (tab) => {
            try {
              return (
                await chrome.tabs.sendMessage(
                  tab,
                  { type: "status" },
                  { frameId: 0 },
                )
              ).status;
            } catch {
              return "loading";
            }
          }, tab);
          if (actual === expected) break;
          await new Promise((r) => setTimeout(r, 100));
        }
        assert.equal(actual, expected);
      };
      await expectStatus(force ? "Browser dark theme" : "Afterglow active");
      await page.getByLabel("Draft").fill("Keep draft");
      assert.equal(
        await page.locator(".afterglow-owned:not(style)").count(),
        0,
        "probe removed",
      );
      if (force) {
        assert.equal(await page.locator("style.darkreader").count(), 0);
        const popup = await context.newPage();
        await popup.addInitScript(
          ({ tab, url }) => {
            chrome.tabs.query = async () => [{ id: tab, url }];
          },
          { tab, url },
        );
        await popup.goto(
          `chrome-extension://${new URL(worker.url()).host}/popup.html`,
        );
        assert.match(await popup.locator("#status").innerText(), /Chrome/);
        await popup.close();
      }
      await page.evaluate(
        () => (document.documentElement.style.colorScheme = "only light"),
      );
      await expectStatus("Afterglow active");
      await page.evaluate(
        () => (document.documentElement.style.colorScheme = "normal"),
      );
      await expectStatus(force ? "Browser dark theme" : "Afterglow active");
      if (force)
        assert.equal(await page.locator("style.darkreader").count(), 0);
      await page.evaluate(() => {
        document.body.style.background = "#141413";
        document.body.style.color = "#87867f";
        document.documentElement.style.colorScheme = "dark";
      });
      await expectStatus("Native dark theme");
      assert.equal(await page.locator("style.darkreader").count(), 0);
      assert.equal(await page.getByLabel("Draft").inputValue(), "Keep draft");
      console.log(
        `PASS: browser darkening ${force ? "on" : "off"}, opt-out transitions, native dark, popup and draft preservation`,
      );
    } finally {
      await context?.close();
      await rm(profile, { recursive: true, force: true });
    }
  }
} finally {
  await new Promise((r) => server.close(r));
}
