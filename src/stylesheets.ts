import { hostname } from "./settings";
const maxBytes = 3_000_000;
export async function fetchStylesheet(url: unknown): Promise<string> {
  if (typeof url !== "string" || !hostname(url))
    throw Error("Unsupported stylesheet URL");
  const response = await fetch(url, {
    credentials: "omit",
    signal: AbortSignal.timeout(10_000),
  });
  const type = response.headers
    .get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (!response.ok || type !== "text/css") {
    await response.body?.cancel();
    throw Error("Stylesheet response must be successful CSS");
  }
  if (Number(response.headers.get("content-length")) > maxBytes) {
    await response.body?.cancel();
    throw Error("Stylesheet too large");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parts: string[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw Error("Stylesheet too large");
      parts.push(decoder.decode(value, { stream: true }));
    }
    parts.push(decoder.decode());
    return parts.join("");
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}
