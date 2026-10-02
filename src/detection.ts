import { luminance } from "./colors";
type Color = [number, number, number, number];
export type NativeTheme = "dark" | "browser-dark" | "light" | "unknown";
function rgb(color: string): Color | null {
  const match = color.match(/^rgba?\(([^)]+)\)/);
  if (!match) return null;
  const parts = match[1].split(/[ ,/]+/).map(Number);
  if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) return null;
  return [parts[0], parts[1], parts[2], parts[3] ?? 1];
}
function light(c: Color): number {
  return (c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722) / 255;
}
// Muted text can be clearly readable without being bright in absolute terms.
export function darkSurface(bg: Color, fg: Color): boolean {
  if (light(bg) >= 0.32) return false;
  const rendered = fg
    .slice(0, 3)
    .map((v, i) => v * fg[3] + bg[i] * (1 - fg[3])) as [number, number, number];
  const backdrop = luminance([bg[0], bg[1], bg[2]]);
  const foreground = luminance(rendered);
  return foreground > backdrop && (foreground + 0.05) / (backdrop + 0.05) >= 3;
}
const media = "img,video,canvas,picture,svg,iframe,object,embed";
function surface(element: Element): Element | null {
  let e: Element | null = element;
  while (
    e &&
    (e.matches(media) || getComputedStyle(e).backgroundImage !== "none")
  )
    e = e.parentElement;
  return e;
}
// Decorative full-viewport backdrops can be siblings, invisible to hit testing
// because they use pointer-events:none. Only consider simple solid backdrops.
function pageBackdrops(): Color[] {
  const layers: { color: Color; z: number }[] = [];
  for (const e of [
    ...document.querySelectorAll("body div:empty,body span:empty"),
  ].slice(0, 512)) {
    if (e.closest(".darkreader,.afterglow-owned")) continue;
    const style = getComputedStyle(e),
      rect = e.getBoundingClientRect();
    if (
      !["fixed", "absolute"].includes(style.position) ||
      style.pointerEvents !== "none" ||
      !Number.isFinite(Number(style.zIndex)) ||
      Number(style.zIndex) >= 0 ||
      style.backgroundImage !== "none" ||
      style.visibility !== "visible" ||
      rect.left > 0 ||
      rect.top > 0 ||
      rect.right < innerWidth ||
      rect.bottom < innerHeight
    )
      continue;
    let visible = true;
    for (let n: Element | null = e; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (
        Number(s.opacity) !== 1 ||
        s.filter !== "none" ||
        s.mixBlendMode !== "normal"
      ) {
        visible = false;
        break;
      }
    }
    const color = rgb(style.backgroundColor);
    if (visible && color && color[3] > 0)
      layers.push({ color, z: Number(style.zIndex) });
  }
  return layers.sort((a, b) => b.z - a.z).map((layer) => layer.color);
}
function background(
  element: Element,
  canvas: Color,
  backdrops: () => Color[],
  hasText: boolean,
): Color | null {
  const result: Color = [0, 0, 0, 0];
  function add(color: Color) {
    const contribution = (1 - result[3]) * color[3];
    for (let i = 0; i < 3; i++) result[i] += color[i] * contribution;
    result[3] += contribution;
  }
  for (let e: Element | null = element; e; e = e.parentElement) {
    const style = getComputedStyle(e);
    if (e.matches(media) || style.backgroundImage !== "none") continue;
    const color = rgb(style.backgroundColor);
    if (color) add(color);
    if (result[3] >= 0.999) break;
  }
  if (result[3] < 0.999) for (const color of backdrops()) add(color);
  if (result[3] === 0 && !hasText) return null;
  add(canvas);
  return result;
}
function canvasColor(scheme: string): Color | null {
  const probe = document.createElement("span");
  probe.className = "afterglow-owned";
  probe.style.setProperty("all", "initial", "important");
  for (const [property, value] of Object.entries({
    display: "none",
    "background-color": "canvas",
    "color-scheme": scheme,
  }))
    probe.style.setProperty(property, value, "important");
  try {
    document.documentElement.append(probe);
    return rgb(getComputedStyle(probe).backgroundColor);
  } finally {
    probe.remove();
  }
}
// Chrome resolves Canvas to a dark color under automatic renderer darkening.
// Force a light scheme on this isolated probe so native dark schemes do not
// produce a false positive. Never leave probe nodes in the page.
function browserDarkening(): boolean {
  if (matchMedia("(forced-colors: active)").matches) return false;
  const color = canvasColor("light");
  return !!color && color[3] === 1 && light(color) < 0.32;
}
export function nativeDark(): NativeTheme {
  if (!document.body || innerWidth <= 0 || innerHeight <= 0) return "unknown";
  // Sample actual visible text rather than a container's unused inherited color.
  const texts: { color: Color; x: number; y: number }[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (
    let node = walker.nextNode(), count = 0;
    node && count < 240;
    node = walker.nextNode(), count++
  ) {
    const e = node.parentElement;
    if (
      !e ||
      !node.textContent?.trim() ||
      e.closest(`${media},style,script,.darkreader`)
    )
      continue;
    const style = getComputedStyle(e),
      rect = e.getBoundingClientRect();
    if (
      style.visibility !== "visible" ||
      style.display === "none" ||
      Number(style.opacity) === 0 ||
      !rect.width ||
      !rect.height ||
      rect.bottom <= 0 ||
      rect.top >= innerHeight ||
      rect.right <= 0 ||
      rect.left >= innerWidth
    )
      continue;
    const color = rgb(style.color);
    if (color && color[3] > 0.5)
      texts.push({
        color,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
  }
  const autoDark = browserDarkening();
  const canvas =
    canvasColor(getComputedStyle(document.documentElement).colorScheme) ??
    ([255, 255, 255, 1] as Color);
  let layers: Color[] | undefined;
  const backdrops = () => (layers ??= pageBackdrops());
  let browserDark = 0;
  let dark = 0,
    total = 0;
  for (const x of [0.2, 0.5, 0.8])
    for (const y of [0.2, 0.5, 0.8]) {
      const px = innerWidth * x,
        py = innerHeight * y;
      const hit = document.elementFromPoint(px, py);
      const e = hit && surface(hit);
      if (!e) continue;
      const bg = background(e, canvas, backdrops, texts.length > 0);
      const nearest = texts.reduce<(typeof texts)[number] | undefined>(
        (best, t) =>
          !best ||
          Math.hypot(t.x - px, t.y - py) < Math.hypot(best.x - px, best.y - py)
            ? t
            : best,
        undefined,
      );
      const fg = nearest?.color ?? rgb(getComputedStyle(e).color);
      if (!bg || !fg) continue;
      total++;
      if (darkSurface(bg, fg)) dark++;
      // Chromium skips surfaces declaring dark support or an explicit opt-out.
      const scheme = getComputedStyle(e).colorScheme.split(/\s+/);
      if (autoDark && !scheme.includes("only") && !scheme.includes("dark"))
        browserDark++;
    }
  if (!total) return "unknown";
  if (dark / total >= 0.6) return "dark";
  return browserDark / total >= 0.6 ? "browser-dark" : "light";
}
