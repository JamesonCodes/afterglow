import { fromStorage, hostname, supported, keyFor, siteFor } from "./settings";
let writes = Promise.resolve();
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  const run = async () => {
    if (message.type === "fetch-css" && sender.tab) {
      if (typeof message.url !== "string" || !hostname(message.url))
        throw Error("Unsupported stylesheet URL");
      const response = await fetch(message.url, {
        credentials: "omit",
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw Error("Stylesheet could not be fetched");
      const text = await response.text();
      if (text.length > 3000000) throw Error("Stylesheet too large");
      return { text };
    }
    if (message.type === "context") {
      const url = sender.tab?.url ?? "";
      return {
        host: hostname(url),
        supported: supported(url),
        settings: fromStorage(await chrome.storage.local.get(null)),
      };
    }
    // Only the extension popup may change preferences.
    if (!sender.url?.startsWith(chrome.runtime.getURL("")))
      throw new Error("Unauthorized");
    if (message.type === "recover" && Number.isInteger(message.tabId)) {
      await ensureTab(message.tabId);
      return { ok: true };
    }
    if (message.type === "update") {
      writes = writes
        .catch(() => {})
        .then(async () => {
          if (message.scope === "global")
            await chrome.storage.local.set({
              enabled: message.enabled === true,
            });
          else if (
            message.scope === "site" &&
            typeof message.host === "string" &&
            message.host &&
            hostname(`https://${message.host}`) === message.host
          ) {
            const current = siteFor(
              fromStorage(await chrome.storage.local.get(null)),
              message.host,
            );
            const updated = {
              ...current,
              enabled: message.reset ? true : message.enabled === true,
              force: false,
            };
            await chrome.storage.local.set({ [keyFor(message.host)]: updated });
          }
        });
      await writes;
      return { ok: true };
    }
    return { ok: false };
  };
  void run().then(respond, (e) => respond({ error: String(e) }));
  return true;
});

// Reconnect the extension to existing documents without navigating them.
const recovering = new Map<number, Promise<void>>();
async function ensureTab(tabId: number): Promise<void> {
  if (recovering.has(tabId)) return recovering.get(tabId)!;
  const task = (async () => {
    const tab = await chrome.tabs.get(tabId);
    if (tab.discarded || !supported(tab.url ?? "")) return;
    try {
      const status = await chrome.tabs.sendMessage(
        tabId,
        { type: "status" },
        { frameId: 0 },
      );
      if (status?.version === chrome.runtime.getManifest().version) return;
    } catch {
      /* The old document connection is gone. */
    }
    // Older builds have no disposal listener. A harmless mutation lets their
    // invalid-context guard run before the replacement engine is installed.
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: async () => {
        document.dispatchEvent(new Event("afterglow:dispose"));
        const marker = document.createElement("span");
        (document.body ?? document.documentElement)?.append(marker);
        marker.remove();
        await new Promise((resolve) => setTimeout(resolve, 0));
      },
    });
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ["content.js"],
    });
  })();
  recovering.set(tabId, task);
  try {
    await task;
  } catch {
    /* Protected frames or tabs closed during recovery. */
  } finally {
    recovering.delete(tabId);
  }
}
async function reconnectOpenTabs() {
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(
    tabs.filter((t) => t.id !== undefined).map((t) => ensureTab(t.id!)),
  );
}
chrome.runtime.onInstalled.addListener(() => void reconnectOpenTabs());
chrome.runtime.onStartup.addListener(() => void reconnectOpenTabs());
chrome.tabs.onActivated.addListener(({ tabId }) => void ensureTab(tabId));
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === "complete") void ensureTab(tabId);
});
// Also covers development reloads and worker restarts; healthy documents are skipped.
void reconnectOpenTabs();
