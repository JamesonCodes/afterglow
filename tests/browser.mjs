import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const image =
  'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="red"/></svg>';
const extensionPath = resolve(process.env.AFTERGLOW_EXTENSION_PATH ?? "dist");
const server = createServer((req, res) => {
  if (req.url === "/broker.css") {
    res.setHeader("Content-Type", "text/css; charset=utf-8");
    res.end("body { color: red; }");
    return;
  }
  if (req.url === "/not-css") {
    res.setHeader("Content-Type", "application/json");
    res.end('{"private":"not a stylesheet"}');
    return;
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  if (req.url === "/default-canvas") {
    res.end(
      "<!doctype html><html><body><p>Ordinary unstyled content</p></body></html>",
    );
    return;
  }
  if (req.url === "/cross-logo.svg") {
    res.setHeader("Content-Type", "image/svg+xml");
    res.end(
      '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="32"><rect x="8" y="6" width="100" height="20" fill="#222"/></svg>',
    );
    return;
  }
  if (req.url === "/muted-theme") {
    res.end(`<!doctype html><html><head><style>
      :root{--bg:#141413;--ink:#87867f}body{margin:0;background:var(--bg);color:var(--ink)}
      @media(prefers-color-scheme:light){:root{--bg:#faf9f5;--ink:#7b7a72}}
      html[data-scheme=dark]{--bg:#141413;--ink:#87867f}
      html[data-scheme=light]{--bg:#faf9f5;--ink:#7b7a72}
      main{display:grid;grid-template-columns:repeat(3,1fr);height:100vh}section{display:grid;place-items:center}
      input{position:fixed;bottom:0;left:0;background:var(--bg);color:var(--ink)}
      </style></head><body><main>${Array.from({length:9},()=>'<section><p>Muted native text</p></section>').join('')}</main><input aria-label="Native draft"></body></html>`);
    return;
  }
  if (req.url === "/logos") {
    const mono = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="32"><rect x="8" y="6" width="100" height="20" fill="#222"/></svg>')}`;
    const multi = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="32"><rect x="8" y="6" width="50" height="20" fill="#222"/><rect x="58" y="6" width="50" height="20" fill="#d32f2f"/></svg>')}`;
    res.end(
      `<!doctype html><html><head><style>body{background:white;color:#222;margin:0;min-height:100vh}header{padding:20px;display:flex;gap:20px}header a{display:inline-block}header img{width:120px;height:32px}header .background-logo{width:120px;height:32px;background-image:url('${mono}')}header svg{width:120px;height:32px}.logo path{fill:#222}main{padding:40px}input{background:white;color:black}</style></head><body><header><a href="/"><img id="mono-logo" alt="Monochrome logo" src="${mono}"></a><a href="/"><img id="multi-logo" alt="Multicolor logo" src="${multi}"></a><a href="/"><svg class="logo" aria-label="Airbnb logo" viewBox="0 0 120 32"><g fill="#222"><path d="M8 6H108V26H8Z"/></g></svg></a><a href="/"><img id="cross-logo" alt="Cross-origin logo" src="http://127.0.0.1:${server.address().port}/cross-logo.svg"></a><a href="/"><svg id="filtered-logo" aria-label="Filtered brand logo" style="filter:invert(1) hue-rotate(180deg)" viewBox="0 0 120 32"><path fill="#eee" d="M8 6H108V26H8Z"/></svg></a><span class="wordmark">Gmail</span><div class="background-logo"></div><img class="avatar" alt="Profile avatar" src="${mono}"></header><main><h1>Logo fixtures</h1><p>Readable page with changing content.</p><input aria-label="Draft"><img id="photo" alt="Product photo" src="${multi}"><div id="updates"></div></main></body></html>`,
    );
    return;
  }
  const dark = req.url === "/dark";
  if (req.url.startsWith("/layered")) {
    const dark = req.url !== "/layered-light";
    res.end(`<!doctype html><html ${dark ? "dark" : ""}><head><style>
      html{background:white}html[dark]{background:#0f0f0f}
      body{margin:0;color:#222}html[dark] main{color:#eee}
      main{min-height:100vh}section{min-height:100vh;background:rgba(120,120,120,.05)}
      header{height:50px;background:#111;color:white}p{padding:30px;margin:0}
      video{width:45%;height:180px;background:black}img{width:45%;height:180px}
      .muted{color:#aaa}button{margin:20px}
      </style></head><body><main><section><div><div><div><div><div>
      <header>Navigation</header><p>Native page content</p><p class="muted">Muted secondary text</p>
      <video></video><img src='${image}'><button>Action</button><input aria-label="Draft">
      </div></div></div></div></div></section></main></body></html>`);
    return;
  }

  const previews = {
    "/article": `<nav>FIELD NOTES</nav><article><h1>A quieter way to explore</h1><p>Ideas, observations, and thoughtful reading after sunset.</p><hr><p>Good design gives the important things space. Afterglow preserves the colors and details that make each website its own.</p><button>Save article</button></article>`,
    "/shopping": `<nav>NORTH STUDIO</nav><h1>Everyday essentials</h1><div class="products"><section><div class="swatch"></div><h2>Desk lamp</h2><p>A warm companion for late nights.</p><button>Add to bag</button></section><section><div class="swatch alt"></div><h2>Notebook</h2><p>Room for your next idea.</p><button>View details</button></section></div>`,
    "/app": `<nav>WORKSPACE / PROJECTS</nav><h1>Today’s work</h1><div class="workspace"><aside>Overview<br><br>Projects<br><br>Library</aside><section><h2>Design review</h2><p>Collect ideas and keep the next steps clear.</p><label>Project name <input value="Afterglow"></label><p><button>Create task</button></p></section></div>`,
  };
  if (previews[req.url]) {
    const details = `<p class="muted">Updated today · Secondary information</p><p><a class="brand-link" href="#details">Read details</a> · <a class="alternate-link" href="#guide">View guide</a></p><a class="brand-button" href="#continue">Continue</a><button disabled>Unavailable</button><p class="success">Saved successfully</p><p class="error">Please check the required field</p><label>Notes <input placeholder="Add a note"></label><div class="menu"><span aria-current="page">Overview</span> · Activity</div>`;
    res.end(
      `<!doctype html><html><head><style>body{font:16px system-ui;margin:0;padding:40px;background:white;color:#222}nav{font-size:12px;color:#666;letter-spacing:2px}h1{font-size:32px}article{max-width:580px;margin:50px auto;line-height:1.7}button,input{font:inherit;padding:12px 20px;background:#eee;color:#222;border:1px solid #999;border-radius:8px}button{cursor:pointer}.products,.workspace{display:flex;gap:30px;margin-top:40px}.products section,.workspace section{padding:24px;border:1px solid #ddd;border-radius:16px;flex:1}.swatch{height:100px;background:#eee;border-radius:10px}.alt{background:#ddd}aside{width:140px;padding-top:20px}.muted{color:#707070}.brand-link{color:#0066cc}.alternate-link{color:#16804b}.brand-button{display:inline-block;background:#0066cc;color:white;padding:12px 20px;border-radius:8px;text-decoration:none}button:disabled{color:#888;background:#ddd}.success{color:#16804b}.error{color:#b42318}.menu{margin-top:20px;padding:16px;background:#eee;border:1px solid #ccc}[aria-current]{font-weight:bold}input::placeholder{color:#777}a:focus-visible{outline:2px solid currentColor}a:hover{text-decoration:underline}</style></head><body>${previews[req.url]}${details}</body></html>`,
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
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });
  const page = await context.newPage();
  await page.goto(`${base}/light`);
  let worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  const id = new URL(worker.url()).host;
  const errors = [];
  let checkingLive = false;
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
  page.on("pageerror", (e) => {
    if (checkingLive) console.log("LIVE PAGE ERROR", e.message);
    else errors.push(e.message);
  });
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

  const contentRequest = async (message) => {
    const [result] = await worker.evaluate(
      async ({ tab, message }) =>
        chrome.scripting.executeScript({
          target: { tabId: tab },
          func: (m) =>
            new Promise((resolve) => chrome.runtime.sendMessage(m, resolve)),
          args: [message],
        }),
      { tab, message },
    );
    return result.result;
  };
  assert.match(
    (await contentRequest({ type: "update", scope: "global", enabled: false }))
      .error,
    /Unauthorized/,
  );
  assert.match(
    (await contentRequest({ type: "recover", tabId: tab })).error,
    /Unauthorized/,
  );
  assert.equal(
    (await contentRequest({ type: "fetch-css", url: base + "/broker.css" }))
      .text,
    "body { color: red; }",
  );
  assert.match(
    (await contentRequest({ type: "fetch-css", url: base + "/not-css" })).error,
    /successful CSS/,
  );
  assert.match(
    (await contentRequest({ type: "fetch-css", url: "file:///etc/passwd" }))
      .error,
    /Unsupported/,
  );
  assert.equal(
    (await worker.evaluate(() => chrome.storage.local.get("enabled"))).enabled,
    undefined,
  );
  console.log(
    "PASS: website content scripts cannot write preferences or request recovery; stylesheet broker accepts CSS and rejects invalid protocols/non-CSS",
  );
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
  assert.equal(await popup.locator("#accents,#saved,footer").count(), 0);
  assert.ok((await popup.getByRole("switch").getAttribute("id")) === "global");
  await popup.locator("#global").focus();
  assert.equal(
    await popup.locator("#global").evaluate((e) => e.matches(":focus")),
    true,
  );
  const unavailable = await context.newPage();
  await unavailable.addInitScript(() => {
    chrome.tabs.query = async () => [{ id: 999, url: "chrome://extensions" }];
  });
  await unavailable.goto(`chrome-extension://${id}/popup.html`);
  await unavailable.waitForFunction(
    () =>
      document.getElementById("status").textContent ===
      "Unavailable on this page",
  );
  assert.equal(await unavailable.locator("#auto").isDisabled(), true);
  assert.match(
    await unavailable.locator("#hint").textContent(),
    /Chrome protects/,
  );
  await unavailable.close();

  await worker.evaluate(() => chrome.storage.local.set({ accents: true }));
  await page.locator(".card button").hover();
  assert.equal(
    await page.locator("[data-afterglow-accent],.afterglow-accents").count(),
    0,
  );
  await popup.locator("#original").focus();
  await popup.keyboard.press("Space");
  await expectStatus("Disabled");
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

  await page.emulateMedia({colorScheme:'dark'});
  await page.goto(base+'/muted-theme');
  await expectStatus('Native dark theme');
  assert.equal(await page.locator('style.darkreader').count(),0);
  assert.equal(await page.locator('body').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(20, 20, 19)');
  await page.getByLabel('Native draft').fill('Preserve native draft');
  await page.evaluate(()=>document.documentElement.setAttribute('data-scheme','light'));
  await expectStatus('Afterglow active');
  await page.evaluate(()=>document.documentElement.setAttribute('data-scheme','dark'));
  await expectStatus('Native dark theme');
  assert.equal(await page.getByLabel('Native draft').inputValue(),'Preserve native draft');
  assert.equal(await page.locator('style.darkreader').count(),0);
  await page.evaluate(()=>document.documentElement.removeAttribute('data-scheme'));
  await page.emulateMedia({colorScheme:'light'});
  await expectStatus('Afterglow active');
  await page.emulateMedia({colorScheme:'dark'});
  await expectStatus('Native dark theme');
  await page.emulateMedia({colorScheme:'light'});
  console.log('PASS: muted native-dark palette, data-scheme changes and system theme switching');
  await page.goto(base + "/default-canvas");
  await expectStatus("Afterglow active");
  for (const route of ["/layered-youtube", "/layered-linkedin"]) {
    await page.goto(base + route);
    await expectStatus("Native dark theme");
    assert.equal(await page.locator("style.darkreader").count(), 0);
    assert.equal(await page.locator(".afterglow-accents").count(), 0);
    assert.equal(
      await page
        .locator("html")
        .evaluate((e) => getComputedStyle(e).backgroundColor),
      "rgb(15, 15, 15)",
    );
    await page.evaluate(() => document.documentElement.removeAttribute("dark"));
    await expectStatus("Afterglow active");
    await page.locator("input").fill("Keep this draft");
    await page.evaluate(() => {
      history.pushState({}, "", "#route-change");
      document.documentElement.setAttribute("dark", "");
    });
    await expectStatus("Native dark theme");
    assert.equal(await page.locator("input").inputValue(), "Keep this draft");
  }
  await page.goto(base + "/layered-light");
  await expectStatus("Afterglow active");
  await page.evaluate(() => {
    const style = document.createElement("style");
    style.textContent =
      "html{background:#121212!important}main{color:#eee!important}";
    document.head.append(style);
  });
  await expectStatus("Native dark theme");
  await page.goto(base + "/light");
  await expectStatus("Afterglow active");
  console.log(
    "PASS: layered backgrounds, visible text, media exclusion, dark attribute switching, delayed stylesheet theme and SPA draft preservation",
  );
  await popup.reload();
  await popup.locator("body").screenshot({ path: "popup-preview.png" });
  await page.screenshot({ path: "theme-preview.png" });
  await page.goto(`${base}/logos`);
  await expectStatus("Afterglow active");
  await page.waitForTimeout(500);
  const logoBox = await page.locator("#mono-logo").boundingBox();
  assert.equal(
    await page
      .locator("#filtered-logo")
      .evaluate((e) => getComputedStyle(e).filter),
    "invert(1) hue-rotate(180deg)",
  );
  assert.ok(
    await page.locator("#filtered-logo path").evaluate((e) =>
      getComputedStyle(e)
        .fill.match(/\d+/g)
        .slice(0, 3)
        .map(Number)
        .every((v) => v < 70),
    ),
  );
  assert.notEqual(
    await page
      .locator("#mono-logo")
      .evaluate((e) => getComputedStyle(e).filter),
    "none",
  );
  assert.equal(
    await page
      .locator("#cross-logo")
      .evaluate((e) => getComputedStyle(e).filter),
    "none",
  );
  assert.equal(
    await page.locator("#cross-logo").getAttribute("data-afterglow-logo"),
    null,
  );
  assert.equal(
    await page.locator("#photo").evaluate((e) => getComputedStyle(e).filter),
    "none",
  );
  assert.equal(
    await page.locator(".avatar").evaluate((e) => getComputedStyle(e).filter),
    "none",
  );
  assert.equal(await page.locator(".afterglow-logo-backdrop").count(), 1);
  assert.equal(
    await page
      .locator(".afterglow-logo-backdrop")
      .evaluate((e) => getComputedStyle(e).backgroundColor),
    "rgb(246, 247, 250)",
  );
  assert.equal(
    await page
      .locator("#multi-logo")
      .evaluate((e) => getComputedStyle(e).filter),
    "none",
  );
  await mkdir("logo-previews", { recursive: true });
  await page.evaluate(
    () => (document.querySelector(".afterglow-logos").sheet.disabled = true),
  );
  await page.screenshot({ path: "logo-previews/before-dark.png" });
  await page.evaluate(
    () => (document.querySelector(".afterglow-logos").sheet.disabled = false),
  );
  await page.screenshot({ path: "logo-previews/after.png" });
  // Capture a stable engine node and observe every rendered frame while unrelated
  // content and local styles change. Repeated measurements must never expose white.
  await page.evaluate(() => {
    window.stableTheme = document.querySelector(".darkreader--user-agent");
    window.lightFrames = 0;
    window.totalFrames = 0;
    window.watchFrames = true;
    const frame = () => {
      if (!window.watchFrames) return;
      window.totalFrames++;
      const c = getComputedStyle(document.body)
        .backgroundColor.match(/\d+/g)
        .map(Number);
      if (c.slice(0, 3).every((v) => v > 200)) window.lightFrames++;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    window.updateTimer = setInterval(() => {
      document.querySelector("#updates").textContent = String(Date.now());
      document.querySelector("input").classList.toggle("editing");
    }, 30);
  });
  await page.getByLabel("Draft").fill("Retained draft");
  await page.waitForTimeout(1500);
  const stable = await page.evaluate(() => {
    clearInterval(window.updateTimer);
    window.watchFrames = false;
    return {
      same:
        window.stableTheme ===
        document.querySelector(".darkreader--user-agent"),
      light: window.lightFrames,
      frames: window.totalFrames,
    };
  });
  assert.equal(stable.same, true);
  assert.equal(stable.light, 0);
  assert.ok(stable.frames > 10);
  console.log("STABILITY", stable);
  await page.evaluate(() => {
    document.body.style.background = "#181818";
    document.body.style.color = "#eee";
  });
  await page.waitForTimeout(50);
  await page.evaluate(() => {
    document.body.style.background = "white";
    document.body.style.color = "#222";
  });
  await page.waitForTimeout(400);
  await expectStatus("Afterglow active");
  assert.equal(
    await page.evaluate(
      () =>
        window.stableTheme ===
        document.querySelector(".darkreader--user-agent"),
    ),
    true,
  );
  await page.evaluate(() => {
    window.savedBody = document.body;
    document.body.remove();
  });
  await page.waitForTimeout(400);
  await expectStatus("Afterglow active");
  await page.evaluate(() => document.documentElement.append(window.savedBody));
  await page.waitForTimeout(350);
  assert.equal(
    await page.evaluate(
      () =>
        window.stableTheme ===
        document.querySelector(".darkreader--user-agent"),
    ),
    true,
  );
  assert.equal(await page.getByLabel("Draft").inputValue(), "Retained draft");
  await page.evaluate(() => {
    const logo = document.querySelector("#mono-logo");
    logo.src =
      "data:image/svg+xml," +
      encodeURIComponent(
        decodeURIComponent(logo.src.split(",")[1]).replace("#222", "#111"),
      );
  });
  await page.waitForTimeout(350);
  assert.deepEqual(await page.locator("#mono-logo").boundingBox(), logoBox);
  await popup.evaluate(async () =>
    chrome.runtime.sendMessage({
      type: "update",
      scope: "site",
      host: "localhost",
      enabled: false,
    }),
  );
  await expectStatus("Disabled");
  assert.equal(await page.locator(".afterglow-logo-backdrop").count(), 0);
  assert.equal(await page.locator("[data-afterglow-logo]").count(), 0);
  assert.equal(
    await page
      .locator("#mono-logo")
      .evaluate((e) => getComputedStyle(e).filter),
    "none",
  );
  await page.screenshot({ path: "logo-previews/before.png" });
  await popup.evaluate(async () =>
    chrome.runtime.sendMessage({
      type: "update",
      scope: "site",
      host: "localhost",
      enabled: true,
    }),
  );
  await expectStatus("Afterglow active");
  await popup.locator("#global").uncheck();
  await expectStatus("Disabled");
  assert.equal(
    await page
      .locator(
        ".afterglow-logos,.afterglow-logo-backdrop,[data-afterglow-logo]",
      )
      .count(),
    0,
  );
  await popup.locator("#global").check();
  await expectStatus("Afterglow active");
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    document.body.style.background = "#181818";
    document.body.style.color = "#eee";
  });
  await expectStatus("Native dark theme");
  assert.equal(
    await page
      .locator(
        ".afterglow-logos,.afterglow-logo-backdrop,[data-afterglow-logo]",
      )
      .count(),
    0,
  );
  await page.evaluate(() => {
    document.body.style.background = "white";
    document.body.style.color = "#222";
  });
  await expectStatus("Afterglow active");
  console.log(
    "PASS: monochrome/multicolor/background logos, photo/avatar preservation, layout, cleanup, drafts and rendered-frame stability",
  );
  await page.goto(`${base}/light`);
  await expectStatus("Afterglow active");

  assert.deepEqual(errors, []);
  if (process.env.AFTERGLOW_LIVE_TEST === "1") {
    checkingLive = true;
    for (const url of [
      "https://airbnb.tech/ai-ml/beyond-the-model-engineering-ai-infra-with-scientific-judgement/",
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
        if (url.includes("airbnb.tech")) {
          // Its initial hero is natively dark. Re-enable on the light article
          // viewport to exercise the generated theme and the actual brand SVG.
          await worker.evaluate(() =>
            chrome.storage.local.set({
              "site:airbnb.tech": { enabled: false, force: false },
            }),
          );
          await page.waitForTimeout(250);
          await page.mouse.wheel(0, 700);
          await page.waitForTimeout(300);
          await page.screenshot({ path: "logo-previews/airbnb-original.png" });
          await worker.evaluate(() =>
            chrome.storage.local.remove("site:airbnb.tech"),
          );
          await page.waitForTimeout(1000);
          const result = await worker.evaluate(
            (id) =>
              chrome.tabs.sendMessage(id, { type: "status" }, { frameId: 0 }),
            liveTab,
          );
          console.log("AIRBNB ARTICLE", result.status);
          const logo = page.locator(".logo svg");
          console.log(
            "AIRBNB LOGO",
            await logo.evaluate((e) => ({
              color: getComputedStyle(e.querySelector("g path")).fill,
              corrections: e.querySelectorAll("[data-afterglow-logo]").length,
            })),
          );
          await page.screenshot({ path: "logo-previews/airbnb-after.png" });
          if (result.status === "Afterglow active") {
            await page.evaluate(
              () =>
                (document.querySelector(".afterglow-logos").sheet.disabled =
                  true),
            );
            await page.screenshot({
              path: "logo-previews/airbnb-before-dark.png",
            });
            await page.evaluate(
              () =>
                (document.querySelector(".afterglow-logos").sheet.disabled =
                  false),
            );
          }
        }
      } catch (e) {
        console.log("LIVE LIMITED", url, e.message);
      }
    }
  }
  checkingLive = false;
  await page.goto(`${base}/light`);
  await expectStatus("Afterglow active");
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
        : base + (i === 0 ? "/logos" : i % 3 === 1 ? "/dark" : "/light");
    await p.goto(target);
    await p.locator("input").fill(`Unsaved draft ${i}`);
    p.on("console", (m) => {
      if (
        m.type() === "error" &&
        m.text().includes("Extension context invalidated")
      )
        invalidationErrors.push(m.text());
    });
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
  await mkdir("design-previews", { recursive: true });
  for (const kind of ["article", "shopping", "app"]) {
    await previewPage.goto(`${base}/${kind}`);
    await previewPage.waitForTimeout(500);
    await previewPage.locator("button").first().hover();
    if (process.env.AFTERGLOW_DESIGN_BASELINE !== "1") {
      const colors = await previewPage
        .locator(".brand-link,.alternate-link,.brand-button,.success,.error")
        .evaluateAll((es) => es.map((e) => getComputedStyle(e).color));
      assert.notEqual(
        colors[0],
        colors[1],
        "Distinct link hues survive conversion",
      );
      assert.notEqual(
        colors[2],
        colors[0],
        "Button-link text retains its own contrast",
      );
      assert.notEqual(
        colors[3],
        colors[4],
        "Success and error remain distinct",
      );
      assert.equal(
        await previewPage.locator("button[disabled]").isDisabled(),
        true,
      );
    }
    await previewPage.screenshot({
      path: `design-previews/${process.env.AFTERGLOW_DESIGN_BASELINE === "1" ? "before" : "after"}-${kind}.png`,
      fullPage: true,
    });
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
    predicate: (w) =>
      w !== worker && w.url().startsWith(`chrome-extension://${id}/`),
    timeout: 15000,
  });
  replacement.catch(() => {});
  const session = await context.browser().newBrowserCDPSession();
  await session.send("Extensions.loadUnpacked", { path: extensionPath });
  const reloadedPopup = await context.newPage();
  await reloadedPopup.goto(`chrome-extension://${id}/popup.html`);
  await reloadedPopup.evaluate(() =>
    chrome.runtime.sendMessage({ type: "context" }),
  );
  worker = await replacement;
  await expectStatus("Afterglow active");
  assert.equal(
    await page.locator("[data-afterglow-accent],.afterglow-accents").count(),
    0,
  );
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
    if (item.page.url().endsWith("/logos")) {
      await item.page.waitForTimeout(350);
      assert.equal(await item.page.locator(".afterglow-logos").count(), 1);
      assert.equal(
        await item.page.locator(".afterglow-logo-backdrop").count(),
        1,
      );
    }
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
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });
  const restartSession = await context.browser().newBrowserCDPSession();
  await restartSession.send("Extensions.loadUnpacked", {
    path: extensionPath,
  });
  const restartedPage = await context.newPage();
  await restartedPage.goto(`${base}/light`);
  const w =
    context
      .serviceWorkers()
      .find((w) => w.url().startsWith(`chrome-extension://${id}/`)) ??
    (await context.waitForEvent("serviceworker", {
      predicate: (w) => w.url().startsWith(`chrome-extension://${id}/`),
    }));
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
  assert.equal(
    (await w.evaluate(() => chrome.storage.local.get(null))).accents,
    true,
  );
  console.log(
    "PASS: browser restart persistence; retired accent settings remain inert",
  );
} finally {
  await context?.close();
  server.close();
  await rm(profile, { recursive: true, force: true });
}
