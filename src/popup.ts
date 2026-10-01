import { fromStorage, siteFor, supported, hostname } from "./settings";
const input = (id: string) => document.getElementById(id) as HTMLInputElement;
const global = input("global"),
  site = input("site"),
  force = input("force"),
  reset = document.getElementById("reset") as HTMLButtonElement;
const text = (id: string, value: string) => {
  document.getElementById(id)!.textContent = value;
};
let host = "",
  tabId: number | undefined,
  url = "",
  pending = false;
async function render() {
  const s = fromStorage(await chrome.storage.local.get(null)),
    p = siteFor(s, host),
    ok = supported(url);
  global.checked = s.enabled;
  site.checked = p.enabled;
  force.checked = p.force;
  global.disabled = pending;
  site.disabled = pending || !ok;
  force.disabled = pending || !ok;
  reset.disabled = pending || !ok;
  text("host", host || "This page");
  if (!ok) {
    text("status", "Unavailable on this page");
    text(
      "hint",
      "Chrome protects this page from extensions. Open a regular website to use Afterglow.",
    );
    return;
  }
  try {
    const result = await chrome.tabs.sendMessage(
      tabId!,
      { type: "status" },
      { frameId: 0 },
    );
    text("status", result.status);
    text(
      "hint",
      result.status === "Unavailable on this page"
        ? "Refresh this page to try again."
        : "",
    );
  } catch {
    text("status", "Unavailable on this page");
    text(
      "hint",
      "Refresh this page to activate Afterglow. Chrome’s built-in PDF viewer is unsupported.",
    );
  }
}
async function update(scope: string, clear = false) {
  pending = true;
  try {
    const result = await chrome.runtime.sendMessage({
      type: "update",
      scope,
      host,
      enabled: scope === "global" ? global.checked : site.checked,
      force: force.checked,
      reset: clear,
    });
    if (result.error) throw Error(result.error);
    await render();
    setTimeout(() => void render(), 450);
  } catch {
    text("hint", "Could not save this setting. Please try again.");
  } finally {
    pending = false;
    global.disabled = false;
    site.disabled = !supported(url);
    force.disabled = !supported(url);
    reset.disabled = !supported(url);
  }
}
global.addEventListener("change", () => void update("global"));
site.addEventListener("change", () => void update("site"));
force.addEventListener("change", () => void update("site"));
reset.addEventListener("click", () => void update("site", true));
chrome.storage.onChanged.addListener(() => void render());
void (async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id;
  url = tab?.url ?? "";
  host = hostname(url);
  await render();
})();
