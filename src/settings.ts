export type Site = { enabled: boolean; force: boolean };
export type Settings = { enabled: boolean; sites: Record<string, Site> };
export const defaults = (): Settings => ({ enabled: true, sites: {} });
export const siteFor = (s: Settings, host: string): Site =>
  s.sites[host] ?? { enabled: true, force: false };
export const effective = (s: Settings, host: string) =>
  s.enabled && siteFor(s, host).enabled;
export function hostname(url: string): string {
  try {
    const u = new URL(url);
    return /^(https?:)$/.test(u.protocol) ? u.hostname : "";
  } catch {
    return "";
  }
}
export function supported(url: string): boolean {
  const h = hostname(url);
  return (
    !!h &&
    h !== "chromewebstore.google.com" &&
    !(
      h === "chrome.google.com" && new URL(url).pathname.startsWith("/webstore")
    )
  );
}
export const keyFor = (host: string) => `site:${host}`;
export function fromStorage(raw: Record<string, unknown>): Settings {
  const s = defaults();
  s.enabled = raw.enabled !== false;
  for (const [key, value] of Object.entries(raw))
    if (key.startsWith("site:") && value && typeof value === "object") {
      const v = value as Partial<Site>;
      s.sites[key.slice(5)] = {
        enabled: v.enabled !== false,
        force: v.force === true,
      };
    }
  return s;
}
