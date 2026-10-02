type Color = [number, number, number, number];
export type NativeTheme = "dark" | "light" | "unknown";
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
function background(element: Element): Color | null {
  let result: Color = [0, 0, 0, 0];
  for (let e: Element | null = element; e; e = e.parentElement) {
    const style = getComputedStyle(e);
    if (e.matches(media) || style.backgroundImage !== "none") continue;
    const color = rgb(style.backgroundColor);
    if (!color) continue;
    const contribution = (1 - result[3]) * color[3];
    for (let i = 0; i < 3; i++) result[i] += color[i] * contribution;
    result[3] += contribution;
    if (result[3] >= 0.999) break;
  }
  // The browser's default canvas is white, but only use it once styles exist.
  if (result[3] === 0) return null;
  for (let i = 0; i < 3; i++) result[i] += 255 * (1 - result[3]);
  result[3] = 1;
  return result;
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
  let dark = 0,
    total = 0;
  for (const x of [0.2, 0.5, 0.8])
    for (const y of [0.2, 0.5, 0.8]) {
      const px = innerWidth * x,
        py = innerHeight * y;
      const hit = document.elementFromPoint(px, py);
      const e = hit && surface(hit);
      if (!e) continue;
      const bg =
        background(e) ?? (texts.length ? ([255, 255, 255, 1] as Color) : null);
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
      if (light(bg) < 0.32 && light(fg) > 0.55) dark++;
    }
  return total ? (dark / total >= 0.6 ? "dark" : "light") : "unknown";
}
