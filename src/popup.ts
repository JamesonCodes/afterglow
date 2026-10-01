import { fromStorage, siteFor, supported, hostname } from "./settings";
const global = document.getElementById("global") as HTMLInputElement;
const accents = document.getElementById("accents") as HTMLInputElement;
const modes = document.getElementById("modes") as HTMLFieldSetElement;
const radios = [
  ...document.querySelectorAll<HTMLInputElement>('input[name="mode"]'),
];
const text = (id: string, value: string) => {
  document.getElementById(id)!.textContent = value;
};
let host = "",
  tabId: number | undefined,
  url = "",
  pending = false,
  revision = 0;
function lock() {
  global.disabled = pending;
  modes.disabled = pending || !supported(url);
  accents.disabled = pending;
}
async function readStatus() {
  try {
    return await chrome.tabs.sendMessage(
      tabId!,
      { type: "status" },
      { frameId: 0 },
    );
  } catch {
    const result = await chrome.runtime.sendMessage({ type: "recover", tabId });
    if (result?.error) throw Error(result.error);
    await new Promise((resolve) => setTimeout(resolve, 350));
    return await chrome.tabs.sendMessage(
      tabId!,
      { type: "status" },
      { frameId: 0 },
    );
  }
}
async function render() {
  const current = ++revision;
  const s = fromStorage(await chrome.storage.local.get(null));
  if (current !== revision || pending) return;
  const p = siteFor(s, host),
    ok = supported(url),
    mode = !p.enabled ? "original" : "auto";
  global.checked = s.enabled;
  accents.checked = s.accents;
  text(
    "accents-detail",
    !s.enabled
      ? "Saved while paused. Applies across Afterglow-themed websites."
      : "Applies across Afterglow-themed websites; native dark sites stay unchanged.",
  );
  radios.forEach((r) => (r.checked = r.value === mode));
  lock();
  text("host", host || "This page");
  text(
    "global-detail",
    s.enabled
      ? "Automatic dark mode is on"
      : "Paused everywhere · site choices are saved",
  );
  text(
    "saved",
    ok
      ? "Saved for this website. Changes apply automatically."
      : "Site preferences are unavailable on this page.",
  );
  if (!ok) {
    text("status", "Unavailable on this page");
    text(
      "hint",
      "Chrome protects this page from extensions. Open a regular website to use Afterglow.",
    );
    return;
  }
  if (!s.enabled) {
    text("status", "Afterglow is paused");
    text(
      "hint",
      "Turn on Afterglow across the web to apply your saved site choice.",
    );
    return;
  }
  try {
    const result = await readStatus();
    if (current !== revision || pending) return;
    const labels: Record<string, string> = {
      "Afterglow active": "Afterglow’s dark theme is active",
      "Native dark theme": "Keeping this site’s own dark theme",
      Disabled: "Using the website’s original appearance",
    };
    text("status", labels[result.status] ?? result.status);
    text(
      "hint",
      result.status === "Unavailable on this page"
        ? "Afterglow couldn’t apply the theme here. Try Original site, then Automatic."
        : "",
    );
  } catch {
    if (current !== revision || pending) return;
    text("status", "This page is unavailable");
    text(
      "hint",
      "Your choice is saved. Afterglow will retry when you return to this tab. Chrome’s built-in PDF viewer is unsupported.",
    );
  }
}
async function update(scope: "global" | "site" | "accents", mode?: string) {
  if (pending) return;
  const enabled = global.checked;
  const accentsEnabled = accents.checked;
  pending = true;
  ++revision;
  lock();
  text("hint", "Saving…");
  try {
    const result = await chrome.runtime.sendMessage({
      type: "update",
      scope,
      host,
      enabled: scope === "global" ? enabled : mode !== "original",
      force: false,
      accents: accentsEnabled,
      reset: scope === "site" && mode === "auto",
    });
    if (result.error) throw Error(result.error);
    pending = false;
    await render();
    setTimeout(() => void render(), 450);
  } catch {
    pending = false;
    await render();
    text("hint", "Could not save this choice. Please try again.");
  } finally {
    lock();
  }
}
accents.addEventListener("change", () => void update("accents"));
global.addEventListener("change", () => void update("global"));
radios.forEach((r) =>
  r.addEventListener("change", () => {
    if (r.checked) void update("site", r.value);
  }),
);
chrome.storage.onChanged.addListener(() => {
  if (!pending) void render();
});
void (async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id;
  url = tab?.url ?? "";
  host = hostname(url);
  await render();
})();
