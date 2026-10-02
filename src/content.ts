import { enable, disable, setFetchMethod } from "darkreader";
import { effective, type Settings } from "./settings";
import { nativeDark, type NativeTheme } from "./detection";
import { LogoCorrections } from "./logos";
import { ownedMutation, originalColors } from "./owned-styles";
const logos = new LogoCorrections();
let detected: NativeTheme = "unknown",
  pending: NativeTheme = "unknown";
let confirmation: ReturnType<typeof setTimeout> | undefined;
let fallback: HTMLStyleElement | undefined;
function removeFallback() {
  fallback?.remove();
  fallback = undefined;
}
let stopped = false;
const colorScheme = matchMedia("(prefers-color-scheme: dark)");
function contextAlive(): boolean {
  try {
    return !stopped && !!chrome.runtime.id;
  } catch {
    return false;
  }
}
function invalidated(error: unknown): boolean {
  return (
    !contextAlive() || /Extension context invalidated/i.test(String(error))
  );
}
function stop() {
  if (stopped) return;
  stopped = true;
  clearTimeout(timer);
  clearTimeout(confirmation);
  logos.stop();
  removeFallback();
  observer.disconnect();
  document.removeEventListener("DOMContentLoaded", schedule);
  document.removeEventListener("load", schedule, true);
  colorScheme.removeEventListener("change", schedule);
  document.removeEventListener("afterglow:dispose", stop);
  try {
    chrome.storage.onChanged.removeListener(storageChanged);
  } catch {}
  try {
    disable();
  } catch {}
  active = false;
  status = "Unavailable on this page";
}
// The Dark Reader API wraps sendMessage without forwarding its Promise result.
// Use Chrome's callback interface for reliable communication.
function send(message: unknown): Promise<any> {
  if (!contextAlive()) {
    stop();
    return Promise.reject(Error("Extension context invalidated"));
  }
  return new Promise((resolve, reject) =>
    chrome.runtime.sendMessage(message, (value) => {
      if (chrome.runtime.lastError)
        reject(Error(chrome.runtime.lastError.message));
      else if (value?.error) reject(Error(value.error));
      else resolve(value);
    }),
  );
}
setFetchMethod(async (url) => {
  if (!contextAlive()) {
    stop();
    return new Response("");
  }
  try {
    const result = await send({ type: "fetch-css", url: String(url) });
    return new Response(result.text, {
      headers: { "Content-Type": "text/css" },
    });
  } catch (error) {
    if (invalidated(error)) {
      stop();
      return new Response("");
    }
    throw error;
  }
});
let settings: Settings,
  host = "",
  available = false,
  active = false,
  status = "Disabled",
  timer: ReturnType<typeof setTimeout> | undefined,
  busy = false;
function handOffFallback() {
  if (
    fallback &&
    document.querySelector(
      "style.darkreader--fallback,style.darkreader--user-agent",
    )
  )
    removeFallback();
}
const observer = new MutationObserver((records) => {
  handOffFallback();
  if (
    records.some((r) => {
      if (ownedMutation(r)) return false;
      const e = r.target instanceof Element ? r.target : r.target.parentElement;
      if (!e) return false;
      if (r.type === "characterData") return !!e.closest("style");
      if (r.type === "attributes") return true;
      return (
        detected === "unknown" ||
        !active ||
        [...r.addedNodes, ...r.removedNodes].some(
          (n) =>
            n instanceof Element &&
            (n.matches("style,link,body,main,[role=main]") ||
              !!n.querySelector("style,link,main,[role=main]")),
        )
      );
    })
  )
    schedule();
});
function observe() {
  if (stopped) return;
  observer.observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeOldValue: true,
    characterData: true,
    attributeFilter: [
      "class",
      "style",
      "dark",
      "data-theme",
      "data-scheme",
      "data-color-scheme",
      "color-scheme",
      "data-color-mode",
      "href",
      "media",
      "content",
      "name",
    ],
  });
}
function transition() {
  const permitted = available && effective(settings, host);
  const shouldRun = permitted && detected === "light";
  if (!shouldRun) {
    logos.stop();
    removeFallback();
    if (active) {
      disable();
      active = false;
    }
    status = !available
      ? "Unavailable on this page"
      : !permitted
        ? "Disabled"
        : detected === "dark"
          ? "Native dark theme"
          : detected === "browser-dark"
            ? "Browser dark theme"
            : "Disabled";
    return;
  }
  if (!active) {
    fallback = document.createElement("style");
    fallback.className = "darkreader afterglow-owned";
    fallback.textContent =
      "html,body{background-color:#181A1F!important;color:#E6E8ED!important}";
    (document.head ?? document.documentElement).append(fallback);
    enable(
      {
        darkSchemeBackgroundColor: "#181A1F",
        darkSchemeTextColor: "#E6E8ED",
        brightness: 100,
        contrast: 100,
        sepia: 0,
      },
      {
        ignoreImageAnalysis: ["*"],
        css: "",
        invert: [],
        ignoreInlineStyle: [".afterglow-owned"],
        disableStyleSheetsProxy: true,
        ignoreCSSUrl: [],
      },
    );
    active = true;
    // The engine inserts a synchronous fallback while its sheets finish loading.
    handOffFallback();
    logos.start();
  }
  status = "Afterglow active";
}
function apply() {
  if (!contextAlive()) {
    stop();
    return;
  }
  if (busy || !settings) return;
  busy = true;
  observer.disconnect();
  try {
    if (!available || !effective(settings, host)) {
      clearTimeout(confirmation);
      confirmation = undefined;
      pending = "unknown";
      transition();
      return;
    }
    const native = originalColors(nativeDark);
    if (native === "unknown") {
      clearTimeout(confirmation);
      confirmation = undefined;
      pending = "unknown";
      return;
    }
    if (native === detected) {
      clearTimeout(confirmation);
      confirmation = undefined;
      pending = "unknown";
      transition();
      return;
    }
    if (pending !== native) {
      pending = native;
      clearTimeout(confirmation);
      confirmation = setTimeout(() => {
        confirmation = undefined;
        apply();
      }, 100);
      return;
    }
    if (confirmation !== undefined) return;
    detected = native;
    pending = "unknown";
    transition();
  } catch (error) {
    if (invalidated(error)) {
      stop();
      return;
    }
    console.error("Afterglow theme failed", error);
    logos.stop();
    removeFallback();
    try {
      disable();
    } catch {}
    active = false;
    status = "Unavailable on this page";
  } finally {
    busy = false;
    observe();
  }
}
function schedule() {
  if (!contextAlive()) {
    stop();
    return;
  }
  // Keep a bounded wait: continuously changing pages must not postpone work forever.
  if (timer !== undefined) return;
  timer = setTimeout(
    () => {
      timer = undefined;
      apply();
    },
    detected === "unknown" ? 0 : 250,
  );
}
async function refresh() {
  if (!contextAlive()) {
    stop();
    return;
  }
  try {
    const c = await send({ type: "context" });
    if (!contextAlive()) {
      stop();
      return;
    }
    if (c.error) throw Error(c.error);
    settings = c.settings;
    host = c.host;
    available = c.supported;
    clearTimeout(timer);
    timer = undefined;
    apply();
  } catch (error) {
    if (invalidated(error)) {
      stop();
      return;
    }
    status = "Unavailable on this page";
  }
}
function storageChanged(
  _changes: Record<string, chrome.storage.StorageChange>,
  area: string,
) {
  if (area === "local") void refresh();
}
chrome.storage.onChanged.addListener(storageChanged);
chrome.runtime.onMessage.addListener((m, _s, reply) => {
  if (!contextAlive()) {
    stop();
    return false;
  }
  if (m.type === "status") {
    reply({ status, host, version: chrome.runtime.getManifest().version });
  }
  return false;
});
document.addEventListener("DOMContentLoaded", schedule, { once: true });
document.addEventListener("load", schedule, true);
colorScheme.addEventListener("change", schedule);
document.addEventListener("afterglow:dispose", stop);
(
  globalThis as typeof globalThis & { __afterglowSession?: unknown }
).__afterglowSession = { isAlive: contextAlive, dispose: stop };
observe();
void refresh();
