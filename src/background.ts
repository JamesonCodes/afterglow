import { fromStorage, hostname, supported, keyFor } from "./settings";
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
    if (message.type === "update") {
      writes = writes
        .catch(() => {})
        .then(async () => {
          if (message.scope === "global")
            await chrome.storage.local.set({
              enabled: message.enabled === true,
            });
          else if (
            typeof message.host === "string" &&
            message.host &&
            hostname(`https://${message.host}`) === message.host
          ) {
            if (message.reset)
              await chrome.storage.local.remove(keyFor(message.host));
            else
              await chrome.storage.local.set({
                [keyFor(message.host)]: {
                  enabled: message.enabled === true,
                  force: message.force === true,
                },
              });
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
