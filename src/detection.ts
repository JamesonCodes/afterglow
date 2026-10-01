function rgb(color: string): number[] | null {
  const m = color.match(/^rgba?\(([^)]+)\)/);
  if (!m) return null;
  const n = m[1].split(/[ ,/]+/).map(Number);
  return n.length >= 3 && (n.length < 4 || n[3] > 0.5) ? n.slice(0, 3) : null;
}
function light(c: number[]): number {
  return c.reduce((v, n, i) => v + n * [0.2126, 0.7152, 0.0722][i], 0) / 255;
}
export function nativeDark(): boolean {
  if (!document.body) return false;
  const nodes = new Set<Element>([document.documentElement, document.body]);
  for (const x of [0.2, 0.5, 0.8])
    for (const y of [0.2, 0.5, 0.8]) {
      let e = document.elementFromPoint(innerWidth * x, innerHeight * y);
      for (let i = 0; e && i < 4; i++, e = e.parentElement) nodes.add(e);
    }
  let dark = 0,
    total = 0;
  for (const e of nodes) {
    const s = getComputedStyle(e),
      bg = rgb(s.backgroundColor),
      fg = rgb(s.color);
    if (!bg || !fg) continue;
    total++;
    if (light(bg) < 0.32 && light(fg) > 0.55) dark++;
  }
  return total > 0 && dark / total >= 0.6;
}
