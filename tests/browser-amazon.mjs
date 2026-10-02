import { chromium } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const profile = await mkdtemp(resolve(tmpdir(), "afterglow-amazon-test-"));
const extension = resolve("dist");
const context = await chromium.launchPersistentContext(profile, {
  channel: "chromium",
  headless: true,
  args: [
    `--disable-extensions-except=${extension}`,
    `--load-extension=${extension}`,
  ],
});
try {
  const art =
    "data:image/svg+xml," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="100"><rect width="120" height="100" fill="white"/><rect x="20" y="20" width="80" height="60" fill="red"/></svg>',
    );
  const html = `<!doctype html><style>body{background:white;color:#111}article{width:240px;height:180px;background:#eedca9}.dark-art{background:#124}._single-creative-card_style_themingTextColor__1oQsI{color:#0f1111}._single-creative-card_style_themingTextColorWhite__1zryO{color:white}img{width:120px;height:100px}.asin-image-fixture,.asin-metadata-fixture{mix-blend-mode:multiply}a{color:inherit}</style><body><h1>Storefront</h1><article><div class="_single-creative-card_style_themingTextColor__1oQsI"><h2><span>Dark promo text</span></h2><a href="#offer">Shop</a></div></article><article class="dark-art"><div class="_single-creative-card_style_themingTextColorWhite__1zryO"><h2><span>White promo text</span></h2></div></article><img class="a-amazon-image asin-image-fixture" alt="Product" src="${art}"><div class="asin-metadata-fixture">Product details</div><input aria-label="Draft"></body>`;
  await context.route("https://www.amazon.com/**", (r) =>
    r.fulfill({ contentType: "text/html", body: html }),
  );
  const page = await context.newPage();
  await page.goto("https://www.amazon.com/");
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  const tab = await worker.evaluate(
    async () =>
      (await chrome.tabs.query({})).find(
        (t) => t.url === "https://www.amazon.com/",
      ).id,
  );
  const status = async (expected) => {
    let value;
    for (let i = 0; i < 50; i++) {
      value = await worker.evaluate(async (id) => {
        try {
          return (await chrome.tabs.sendMessage(id, { type: "status" })).status;
        } catch {
          return "loading";
        }
      }, tab);
      if (value === expected) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.equal(value, expected);
  };
  const styles = () =>
    page.evaluate(() => ({
      blend: getComputedStyle(document.querySelector("img")).mixBlendMode,
      filter: getComputedStyle(document.querySelector("img")).filter,
      dark: getComputedStyle(document.querySelector("article span")).color,
      white: getComputedStyle(document.querySelector(".dark-art span")).color,
      src: document.querySelector("img").currentSrc,
      rects: [...document.querySelectorAll("article,img")].map((e) => {
        const r = e.getBoundingClientRect();
        return [r.x, r.y, r.width, r.height];
      }),
    }));
  await status("Afterglow active");
  await page.getByLabel("Draft").fill("Keep this draft");
  const active = await styles();
  assert.equal(active.blend, "normal");
  assert.equal(active.filter, "none");
  assert.equal(active.dark, "rgb(15, 17, 17)");
  assert.equal(active.white, "rgb(255, 255, 255)");
  const popup = await context.newPage();
  await popup.addInitScript((tab) => {
    chrome.tabs.query = async () => [
      { id: tab, url: "https://www.amazon.com/" },
    ];
  }, tab);
  await popup.goto(
    `chrome-extension://${new URL(worker.url()).host}/popup.html`,
  );
  await popup.locator("#original").check();
  await status("Disabled");
  const original = await styles();
  assert.equal(original.blend, "multiply");
  assert.deepEqual(original.rects, active.rects);
  assert.equal(original.src, active.src);
  assert.equal(await page.locator("style.darkreader").count(), 0);
  await popup.locator("#auto").check();
  await status("Afterglow active");
  await page.evaluate(() =>
    document.body.append(document.querySelector("img").cloneNode(true)),
  );
  assert.equal(
    await page
      .locator("img")
      .last()
      .evaluate((e) => getComputedStyle(e).mixBlendMode),
    "normal",
  );
  await popup.locator("#global").uncheck();
  await status("Disabled");
  assert.equal((await styles()).blend, "multiply");
  await popup.locator("#global").check();
  await status("Afterglow active");
  await page.evaluate(() => {
    document.body.style.background = "#141413";
    document.body.style.color = "#eee";
  });
  await status("Native dark theme");
  assert.equal((await styles()).blend, "multiply");
  assert.equal(await page.locator("style.darkreader").count(), 0);
  assert.equal(await page.getByLabel("Draft").inputValue(), "Keep this draft");
  console.log(
    "PASS: Amazon product blending, promo text, image source/filter, layout, dynamic cards, Original/pause/native cleanup and drafts",
  );
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}
