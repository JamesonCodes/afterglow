import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const image =
  'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="red"/></svg>';
const server = createServer((req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  const dark = req.url === "/dark";
  const previews = {
    "/article": `<nav>FIELD NOTES</nav><article><h1>A quieter way to explore</h1><p>Ideas, observations, and thoughtful reading after sunset.</p><hr><p>Good design gives the important things space. Afterglow adds a gentle light only when you interact.</p><button>Save article</button></article>`,
    "/shopping": `<nav>NORTH STUDIO</nav><h1>Everyday essentials</h1><div class="products"><section><div class="swatch"></div><h2>Desk lamp</h2><p>A warm companion for late nights.</p><button>Add to bag</button></section><section><div class="swatch alt"></div><h2>Notebook</h2><p>Room for your next idea.</p><button>View details</button></section></div>`,
    "/app": `<nav>WORKSPACE / PROJECTS</nav><h1>Today’s work</h1><div class="workspace"><aside>Overview<br><br>Projects<br><br>Library</aside><section><h2>Design review</h2><p>Collect ideas and keep the next steps clear.</p><label>Project name <input value="Afterglow"></label><p><button>Create task</button></p></section></div>`,
  };
  if (previews[req.url]) {
    res.end(
      `<!doctype html><html><head><style>body{font:16px system-ui;margin:0;padding:40px;background:white;color:#222}nav{font-size:12px;color:#666;letter-spacing:2px}h1{font-size:32px}article{max-width:580px;margin:50px auto;line-height:1.7}button,input{font:inherit;padding:12px 20px;background:#eee;color:#222;border:1px solid #999;border-radius:8px}button{cursor:pointer}.products,.workspace{display:flex;gap:30px;margin-top:40px}.products section,.workspace section{padding:24px;border:1px solid #ddd;border-radius:16px;flex:1}.swatch{height:100px;background:#eee;border-radius:10px}.alt{background:#ddd}aside{width:140px;padding-top:20px}</style></head><body>${previews[req.url]}</body></html>`,
    );
    return;
  }

  res.end(
    `<!doctype html><html><head><style>body{margin:0;padding:30px;background:${dark ? "#181818" : "#ffffff"};color:${dark ? "#eeeeee" : "#111111"};min-height:100vh}body.dark{background:#181818;color:#eeeeee}input,button{background:white;color:black}.card{padding:20px;border:1px solid #999}a{color:blue}.photo{width:40px;height:40px;background-image:url('${image}')}</style></head><body><h1>Fixture</h1><p>Readable article and product details.</p><a href="#">Product link</a><div class="card"><input aria-label="Name"><button onclick="this.textContent='Clicked'">Buy</button></div><img alt="Red image" src='${image}'><div class="photo"></div><video></video><canvas width="20" height="20"></canvas>${req.url === "/frame" ? "" : `<iframe src="http://127.0.0.1:${server.address().port}/frame"></iframe>`}<script>const c=document.querySelector('canvas').getContext('2d');c.fillStyle='red';c.fillRect(0,0,20,20);</script></body></html>`,
  );
});
await new Promise((r) => server.listen(0, "0.0.0.0", r));
const base = `http://localhost:${server.address().port}`;
const profile = await mkdtemp(resolve(tmpdir(), "afterglow-test-"));
let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    args: [
      "--enable-unsafe-extension-debugging",
      `--disable-extensions-except=${resolve("dist")}`,
      `--load-extension=${resolve("dist")}`,
    ],
  });
  let worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  const id = new URL(worker.url()).host;
  const page = await context.newPage();
  const errors = [];
  const invalidationErrors = [];
  page.on("console", (m) => {
    if (
      m.type() === "error" &&
      m.text().includes("Extension context invalidated")
    )
      invalidationErrors.push(m.text());
  });
  page.on("console", (m) => {
    if (m.type() === "error") console.log(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/light`);
  const tab = await worker.evaluate(
    async (url) => (await chrome.tabs.query({})).find((t) => t.url === url).id,
    `${base}/light`,
  );
  const status = () =>
    worker.evaluate(
      async (id) =>
        await chrome.tabs.sendMessage(id, { type: "status" }, { frameId: 0 }),
      tab,
    );
  async function expectStatus(value) {
    for (let i = 0; i < 40; i++) {
      if ((await status()).status === value) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.equal((await status()).status, value);
  }
  await expectStatus("Afterglow active");
  assert.notEqual(
    await page
      .locator("body")
      .evaluate((e) => getComputedStyle(e).backgroundColor),
    "rgb(255, 255, 255)",
  );
  const media = await page
    .locator("img, video, canvas, .photo")
    .evaluateAll((es) => es.map((e) => getComputedStyle(e).filter));
  assert.ok(media.every((v) => v === "none"));
  assert.deepEqual(
    await page
      .locator("canvas")
      .evaluate((e) =>
        Array.from(e.getContext("2d").getImageData(0, 0, 1, 1).data),
      ),
    [255, 0, 0, 255],
  );
  await page.locator("input").fill("Jameson");
  await page.locator("button").click();
  assert.equal(await page.locator("button").textContent(), "Clicked");
  await page.evaluate(() => {
    const p = document.createElement("p");
    p.textContent = "New content";
    p.style.background = "white";
    document.body.append(p);
  });
  await page.waitForTimeout(600);
  assert.notEqual(
    await page
      .locator("p")
      .last()
      .evaluate((e) => getComputedStyle(e).backgroundColor),
    "rgb(255, 255, 255)",
  );
  const frame = page.frames().find((f) => f.url().includes("127.0.0.1"));
  assert.ok(frame);
  assert.notEqual(
    await frame
      .locator("body")
      .evaluate((e) => getComputedStyle(e).backgroundColor),
    "rgb(255, 255, 255)",
  );
  const second = await context.newPage();
  await second.goto(`${base}/light`);
  await second.waitForTimeout(600);
  const popup = await context.newPage();
  await popup.addInitScript(
    ({ tab, url }) => {
      chrome.tabs.query = async () => [{ id: tab, url }];
    },
    { tab, url: `${base}/light` },
  );
  await popup.goto(`chrome-extension://${id}/popup.html`);
  assert.equal(await popup.locator("#accents").isChecked(), false);
  const button = page.locator(".card button");
  await button.hover();
  assert.equal(await button.getAttribute("data-afterglow-accent"), null);
  await page.evaluate(() => {
    const style = document.createElement("style");
    style.textContent =
      ".card button {box-shadow: 0 3px 4px rgb(40,40,40);outline:2px solid blue;}";
    document.head.append(style);
  });
  await page.waitForTimeout(500);
  await popup.locator("#accents").check();
  await page.waitForTimeout(350);
  await page.mouse.move(0, 0);
  const original = await button.evaluate((e) => ({
    shadow: getComputedStyle(e).boxShadow,
    outline: getComputedStyle(e).outline,
    rect: JSON.stringify(e.getBoundingClientRect()),
  }));
  await button.hover();
  await page.waitForFunction(() =>
    document
      .querySelector(".card button")
      .hasAttribute("data-afterglow-accent"),
  );
  const glowed = await button.evaluate((e) => ({
    shadow: getComputedStyle(e).boxShadow,
    outline: getComputedStyle(e).outline,
    rect: JSON.stringify(e.getBoundingClientRect()),
  }));
  assert.ok(glowed.shadow.startsWith(original.shadow));
  assert.ok(glowed.shadow.includes("185, 174, 245"));
  assert.equal(glowed.outline, original.outline);
  assert.equal(glowed.rect, original.rect);
  await page.screenshot({ path: "accent-preview.png" });
  await page.mouse.move(0, 0);
  assert.equal(await button.getAttribute("data-afterglow-accent"), null);
  assert.equal(
    await button.evaluate((e) => getComputedStyle(e).boxShadow),
    original.shadow,
  );
  await page.locator("input").click();
  assert.equal(
    await page.locator("input").getAttribute("data-afterglow-accent"),
    null,
  );
  await page.keyboard.press("Tab");
  assert.equal(await button.evaluate((e) => e.matches(":focus-visible")), true);
  assert.ok(await button.getAttribute("data-afterglow-accent"));
  await page.keyboard.press("Tab");
  assert.equal(await button.getAttribute("data-afterglow-accent"), null);
  // Mouse focus alone does not glow; hovering an ordinary text input does not glow either.
  await button.click();
  await page.mouse.move(0, 0);
  assert.equal(await button.getAttribute("data-afterglow-accent"), null);
  await page.evaluate(() => {
    const b = document.createElement("button");
    b.id = "dynamic-button";
    b.textContent = "Dynamic";
    document.body.append(b);
  });
  await page.locator("#dynamic-button").hover();
  await page.waitForTimeout(350);
  assert.ok(
    await page.locator("#dynamic-button").getAttribute("data-afterglow-accent"),
  );
  await page.locator("#dynamic-button").evaluate((e) => (e.disabled = true));
  await page.waitForTimeout(100);
  assert.equal(
    await page.locator("#dynamic-button").getAttribute("data-afterglow-accent"),
    null,
  );
  await popup.locator("#accents").uncheck();
  await page.waitForTimeout(350);
  assert.equal(await page.locator("[data-afterglow-accent]").count(), 0);
  assert.equal(await page.locator(".afterglow-accents").count(), 0);
  await popup.locator("#accents").check();
  await page.waitForTimeout(350);
  await second.locator(".card button").hover();
  await second.waitForTimeout(100);
  assert.ok(
    await second.locator(".card button").getAttribute("data-afterglow-accent"),
  );
  await page.evaluate(() => document.querySelector("#dynamic-button").remove());
  await frame.locator(".card button").hover();
  await frame.waitForTimeout(100);
  assert.ok(
    await frame.locator(".card button").getAttribute("data-afterglow-accent"),
  );
  console.log(
    "PASS: opt-in hover/focus glow, original shadows and outlines, no layout shift, dynamic and disabled controls, cross-tab accents",
  );

  await popup.locator("#original").focus();
  await popup.keyboard.press("Space");
  await expectStatus("Disabled");
  assert.equal(await popup.locator("#accents").isChecked(), true);
  assert.equal(await page.locator(".afterglow-accents").count(), 0);
  await second.waitForTimeout(600);
  assert.equal(
    await frame
      .locator("body")
      .evaluate((e) => getComputedStyle(e).backgroundColor),
    "rgb(255, 255, 255)",
  );
  assert.equal(
    await second
      .locator("body")
      .evaluate((e) => getComputedStyle(e).backgroundColor),
    "rgb(255, 255, 255)",
  );
  await popup.locator("#auto").check();
  await expectStatus("Afterglow active");
  await page.goto(`${base}/dark`);
  await expectStatus("Native dark theme");
  assert.equal(await page.locator(".afterglow-accents").count(), 0);
  await popup.reload();
  assert.equal(await popup.locator('input[name="mode"]').count(), 2);
  // Saved Always dark choices from earlier versions use Automatic.
  await worker.evaluate(() =>
    chrome.storage.local.set({
      "site:localhost": { enabled: true, force: true, accents: true },
    }),
  );
  await expectStatus("Native dark theme");
  await popup.waitForTimeout(300);
  assert.equal(await popup.locator("#auto").isChecked(), true);
  assert.equal(await popup.locator("#accents").isChecked(), true);
  assert.equal(await popup.locator("#accents").isDisabled(), false);
  assert.equal(await page.locator(".afterglow-accents").count(), 0);
  assert.equal(await popup.locator("#hint").textContent(), "");
  await popup.locator("#global").uncheck();
  await expectStatus("Disabled");
  assert.equal(await popup.locator("#auto").isChecked(), true);
  assert.equal(
    await popup.locator("#status").textContent(),
    "Afterglow is paused",
  );
  await popup.locator("#global").check();
  await expectStatus("Native dark theme");
  await page.goto(`${base}/light`);
  await expectStatus("Afterglow active");
  await page.evaluate(() => {
    window.afterglowActivity = setInterval(() => {
      document.querySelector("p").textContent = String(Date.now());
    }, 25);
    document.body.classList.add("dark");
  });
  await expectStatus("Native dark theme");
  await page.evaluate(() => document.body.classList.remove("dark"));
  await expectStatus("Afterglow active");
  await page.evaluate(() => clearInterval(window.afterglowActivity));
  await popup.reload();
  await popup.locator("body").screenshot({ path: "popup-preview.png" });
  await page.screenshot({ path: "theme-preview.png" });
  assert.deepEqual(errors, []);
  if (process.env.AFTERGLOW_LIVE_TEST === "1") {
    for (const url of [
      "https://en.wikipedia.org/wiki/Moon",
      "https://books.toscrape.com",
      "https://excalidraw.com",
    ]) {
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
        await page.waitForTimeout(2000);
        const liveTab = await worker.evaluate(
          async (url) =>
            (await chrome.tabs.query({})).find((t) => t.url === url)?.id,
          page.url(),
        );
        const liveStatus = await worker.evaluate(
          (id) =>
            chrome.tabs.sendMessage(id, { type: "status" }, { frameId: 0 }),
          liveTab,
        );
        assert.ok(
          ["Afterglow active", "Native dark theme"].includes(liveStatus.status),
        );
        console.log("LIVE", url, liveStatus.status, await page.title());
      } catch (e) {
        console.log("LIVE LIMITED", url, e.message);
      }
    }
  }
  console.log(
    "PASS: native detection, theme switching, dynamic content, media, forms, popup appearance choices, global precedence and cross-tab updates",
  );
  await worker.evaluate(() =>
    chrome.storage.local.set({
      "site:persist.test": { enabled: false, force: true, accents: true },
    }),
  );
  const recoveryTabs = [];
  await worker.evaluate(() =>
    chrome.storage.local.set({
      "site:127.0.0.1": { enabled: false, force: false },
    }),
  );
  for (let i = 0; i < 10; i++) {
    const p = await context.newPage();
    const target =
      i % 3 === 2
        ? base.replace("localhost", "127.0.0.1") + "/light"
        : base + (i % 3 === 1 ? "/dark" : "/light");
    await p.goto(target);
    await p.locator("input").fill(`Unsaved draft ${i}`);
    let navigations = 0;
    p.on("framenavigated", (f) => {
      if (f === p.mainFrame()) navigations++;
    });
    const tabId = await worker.evaluate(
      async (url) =>
        (await chrome.tabs.query({})).find((t) => t.url === url && t.active)
          ?.id ??
        (await chrome.tabs.query({})).filter((t) => t.url === url).at(-1)?.id,
      target,
    );
    recoveryTabs.push({
      page: p,
      tabId,
      expected:
        i % 3 === 2
          ? "Disabled"
          : i % 3 === 1
            ? "Native dark theme"
            : "Afterglow active",
      value: `Unsaved draft ${i}`,
      navigations: () => navigations,
    });
  }
  await page.evaluate(() => {
    window.afterglowDocumentIdentity = "unchanged";
  });
  const previewPage = await context.newPage({
    viewport: { width: 900, height: 600 },
  });
  for (const kind of ["article", "shopping", "app"]) {
    await previewPage.goto(`${base}/${kind}`);
    await previewPage.waitForTimeout(500);
    await previewPage.locator("button").first().hover();
    await previewPage.screenshot({ path: `accent-${kind}-preview.png` });
  }
  await previewPage.close();
  // Reload the extension while the document and old content script stay alive.
  try {
    await worker.evaluate(() => chrome.runtime.reload());
  } catch (error) {
    if (!/closed|destroyed/i.test(String(error))) throw error;
  }
  await page.waitForTimeout(300);
  // Flag-loaded unpacked extensions are unloaded by runtime.reload in Chromium.
  // Re-register the same bundle to complete the reload in this disposable profile.
  const replacement = context.waitForEvent("serviceworker", {
    predicate: (w) => w !== worker,
    timeout: 15000,
  });
  replacement.catch(() => {});
  const session = await context.browser().newBrowserCDPSession();
  await session.send("Extensions.loadUnpacked", { path: resolve("dist") });
  const reloadedPopup = await context.newPage();
  await reloadedPopup.goto(`chrome-extension://${id}/popup.html`);
  await reloadedPopup.evaluate(() =>
    chrome.runtime.sendMessage({ type: "context" }),
  );
  worker = await replacement;
  await expectStatus("Afterglow active");
  await button.hover();
  await page.waitForTimeout(150);
  assert.ok(await button.getAttribute("data-afterglow-accent"));
  assert.equal(
    await page.evaluate(() => window.afterglowDocumentIdentity),
    "unchanged",
  );
  for (const item of recoveryTabs) {
    for (let i = 0; i < 40; i++) {
      try {
        if (
          (
            await worker.evaluate(
              (id) =>
                chrome.tabs.sendMessage(id, { type: "status" }, { frameId: 0 }),
              item.tabId,
            )
          ).status === item.expected
        )
          break;
      } catch {}
      await page.waitForTimeout(100);
    }
    assert.equal(
      (
        await worker.evaluate(
          (id) =>
            chrome.tabs.sendMessage(id, { type: "status" }, { frameId: 0 }),
          item.tabId,
        )
      ).status,
      item.expected,
    );
    assert.equal(await item.page.locator("input").inputValue(), item.value);
    assert.equal(item.navigations(), 0);
  }
  // Repeated recovery requests must not duplicate content scripts or styles.
  const count = await page.locator("style.darkreader").count();
  for (let i = 0; i < 3; i++)
    await worker.evaluate(
      (id) =>
        chrome.scripting.executeScript({
          target: { tabId: id, allFrames: true },
          files: ["content.js"],
        }),
      tab,
    );
  await page.waitForTimeout(500);
  assert.equal(await page.locator("style.darkreader").count(), count);
  assert.deepEqual(invalidationErrors, []);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: 10 open tabs reconnect automatically, keep drafts and never navigate; duplicate injection is safe",
  );
  await context.close();
  context = undefined;
  // Reopen the profile to confirm preferences persist across browser restarts.
  context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    args: [
      "--enable-unsafe-extension-debugging",
      `--disable-extensions-except=${resolve("dist")}`,
      `--load-extension=${resolve("dist")}`,
    ],
  });
  const restartSession = await context.browser().newBrowserCDPSession();
  await restartSession.send("Extensions.loadUnpacked", {
    path: resolve("dist"),
  });
  const restartedPage = await context.newPage();
  await restartedPage.goto(`${base}/light`);
  const w =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  assert.equal(
    (await w.evaluate(() => chrome.storage.local.get(null))).enabled,
    true,
  );
  assert.deepEqual(
    (await w.evaluate(() => chrome.storage.local.get(null)))[
      "site:persist.test"
    ],
    { enabled: false, force: true, accents: true },
  );
  console.log("PASS: browser restart persistence");
} finally {
  await context?.close();
  server.close();
  await rm(profile, { recursive: true, force: true });
}
