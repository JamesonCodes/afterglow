import { contrast, luminance } from "./colors";
import { ownedMutation } from "./owned-styles";
type Color = [number, number, number];
function color(value: string): Color | null {
  const m = value.match(/^rgba?\(([^)]+)\)/);
  if (!m) return null;
  const a = m[1].split(/[ ,/]+/).map(Number);
  return a.length >= 3 && a.every(Number.isFinite) && (a[3] ?? 1) >= 0.9
    ? (a.slice(0, 3) as Color)
    : null;
}
// Preserve supported site/engine filters while measuring the rendered foreground.
// Unknown filter pipelines are left untouched rather than guessed.
function filtered(c: Color, element: Element, reverse = false): Color | null {
  const operations: string[] = [];
  for (let e: Element | null = element; e; e = e.parentElement) {
    const value = getComputedStyle(e).filter;
    if (value === "none") continue;
    const parts = value.match(/(?:invert\((?:1|100%)\)|hue-rotate\(180deg\))/g);
    if (!parts || parts.join(" ") !== value) return null;
    operations.push(...parts);
  }
  let result = c;
  for (const op of reverse ? operations.reverse() : operations) {
    if (op.startsWith("invert")) result = result.map((v) => 255 - v) as Color;
    else {
      const [r, g, b] = result;
      result = [
        -0.574 * r + 1.43 * g + 0.144 * b,
        0.426 * r + 0.43 * g + 0.144 * b,
        0.426 * r + 1.43 * g - 0.856 * b,
      ].map((v) => Math.max(0, Math.min(255, v))) as Color;
    }
  }
  return result;
}
function surface(e: Element): Color | null {
  let rgb = [0, 0, 0],
    opacity = 0;
  for (let p: Element | null = e.parentElement; p; p = p.parentElement) {
    const s = getComputedStyle(p);
    if (s.backgroundImage !== "none") return null;
    const m = s.backgroundColor.match(/^rgba?\(([^)]+)\)/);
    if (!m) continue;
    const a = m[1].split(/[ ,/]+/).map(Number);
    const contribution = (1 - opacity) * (a[3] ?? 1);
    rgb = rgb.map((v, i) => v + a[i] * contribution);
    opacity += contribution;
    if (opacity >= 0.999) return filtered(rgb as Color, p);
  }
  return null;
}
const regions = ":is(header,nav,[role=banner],[role=navigation])";
const graphics = "img,svg,[role=img]";
const explicit = /(?:^|[\s_\-])(?:logo|wordmark|brand)(?:$|[\s_\-])/i;
function metadata(e: Element): string {
  return [
    e.id,
    e.getAttribute("class"),
    e.getAttribute("alt"),
    e.getAttribute("aria-label"),
    e.getAttribute("title"),
  ]
    .filter(Boolean)
    .join(" ");
}
function eligible(e: Element): boolean {
  if (
    !e.closest(regions) ||
    e.closest(".darkreader,.afterglow-owned,article,video,canvas,picture") ||
    /avatar|profile|product|photo|thumbnail/i.test(metadata(e))
  )
    return false;
  const rect = e.getBoundingClientRect(),
    style = getComputedStyle(e);
  if (
    !rect.width ||
    !rect.height ||
    rect.width > 400 ||
    rect.height > 160 ||
    style.visibility !== "visible" ||
    Number(style.opacity) === 0
  )
    return false;
  if (
    explicit.test(metadata(e)) ||
    explicit.test(metadata(e.parentElement ?? e))
  )
    return true;
  const a = e.closest("a[href]");
  if (!a || (!e.matches(graphics) && !a.querySelector(graphics))) return false;
  try {
    const url = new URL(a.getAttribute("href")!, location.href);
    return (
      url.origin === location.origin &&
      !url.search &&
      (url.pathname === "/" ||
        (url.pathname === location.pathname &&
          ["#inbox", "#home"].includes(url.hash)))
    );
  } catch {
    return false;
  }
}
type Analysis = {
  colors: Color[];
  monochrome: boolean;
  foregrounds?: { e: Element; prop: string }[];
};
function pixels(img: HTMLImageElement): Analysis | null {
  if (!img.complete || !img.naturalWidth) return null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = Math.min(96, img.naturalWidth);
    canvas.height = Math.min(48, img.naturalHeight);
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const colors: Color[] = [];
    let transparent = 0,
      opaque = 0,
      neutral = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 32) {
        transparent++;
        continue;
      }
      if (data[i + 3] < 230) continue;
      opaque++;
      const c: Color = [data[i], data[i + 1], data[i + 2]];
      if (Math.max(...c) - Math.min(...c) < 20) neutral++;
      if (!colors.some((v) => v.every((n, j) => Math.abs(n - c[j]) < 25)))
        colors.push(c);
    }
    // Without transparency, a pixel sample cannot distinguish artwork from its
    // own background safely. Preserve that image rather than guessing.
    if (!opaque || (transparent / data.length) * 4 < 0.05 || !colors.length)
      return null;
    return {
      colors,
      monochrome:
        neutral / opaque > 0.97 &&
        colors.every(
          (c) => Math.abs(luminance(c) - luminance(colors[0])) < 0.15,
        ),
    };
  } catch {
    return null;
  } // Tainted canvas: no refetch or added network access.
}
function analyze(e: Element): Analysis | null {
  if (e instanceof HTMLImageElement) {
    const a = pixels(e);
    if (!a) return null;
    const colors = a.colors.map((c) => filtered(c, e));
    return colors.every((c) => c !== null)
      ? { ...a, colors: colors as Color[] }
      : null;
  }
  if (e instanceof SVGElement) {
    const colors: Color[] = [],
      foregrounds: { e: Element; prop: string }[] = [];
    const nodes = e.querySelectorAll(
      "path,rect,circle,ellipse,polygon,polyline,line,text,use",
    );
    if (nodes.length > 128) return null;
    for (const node of nodes) {
      if (node.closest("defs,clipPath,mask")) continue;
      const s = getComputedStyle(node);
      if (Number(s.opacity) < 0.9 || s.visibility !== "visible") continue;
      for (const prop of ["fill", "stroke"]) {
        const value = s.getPropertyValue(prop);
        if (value === "none") continue;
        const raw = color(value);
        const c = raw && filtered(raw, node);
        if (!c) return null;
        if (!colors.some((v) => v.every((n, i) => Math.abs(n - c[i]) < 20)))
          colors.push(c);
        foregrounds.push({ e: node, prop });
      }
    }
    return colors.length
      ? { colors, monochrome: colors.length === 1, foregrounds }
      : null;
  }
  const s = getComputedStyle(e);
  if (s.backgroundImage !== "none") {
    const m = s.backgroundImage.match(/^url\(["']?(.*?)["']?\)$/);
    if (!m || e.children.length || e.textContent?.trim()) return null;
    const src = new URL(m[1], location.href).href;
    const existing = [...document.images].find((img) => img.currentSrc === src);
    const a = existing ? pixels(existing) : null;
    if (!a) return null;
    const colors = a.colors.map((c) => filtered(c, e));
    return colors.every((c) => c !== null)
      ? { ...a, colors: colors as Color[] }
      : null;
  }
  if (
    [...e.childNodes].some(
      (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim(),
    ) &&
    !e.querySelector(graphics)
  ) {
    const raw = color(s.color),
      c = raw && filtered(raw, e);
    return c
      ? { colors: [c], monochrome: true, foregrounds: [{ e, prop: "color" }] }
      : null;
  }
  return null;
}
type Correction = {
  attrs: Map<Element, string | null>;
  rules: string[];
  overlay?: HTMLElement;
  parent?: Element;
  parentValue?: string | null;
};
export class LogoCorrections {
  private running = false;
  private sheet?: HTMLStyleElement;
  private id = 0;
  private corrections = new Map<Element, Correction>();
  private queue = new Set<Element>();
  private candidates = new Set<Element>();
  private timer?: ReturnType<typeof setTimeout>;
  private observer = new MutationObserver((records) => {
    for (const r of records) {
      const owner = (
        r.target instanceof Element ? r.target : r.target.parentElement
      )?.closest("style.darkreader:not(.afterglow-owned)");
      if (
        owner ||
        (r.type === "childList" &&
          [...r.addedNodes].some(
            (n) =>
              n instanceof Element &&
              n.matches("style.darkreader:not(.afterglow-owned)"),
          ))
      ) {
        for (const candidate of this.candidates) this.queue.add(candidate);
        continue;
      }
      if (ownedMutation(r)) continue;
      const e = r.target instanceof Element ? r.target : r.target.parentElement;
      if (!e) continue;
      if (r.type === "childList") {
        for (const n of r.addedNodes)
          if (n instanceof Element) this.discover(n);
        for (const candidate of this.candidates)
          if (!candidate.isConnected) this.queue.add(candidate);
      }
      if (e.closest(regions)) {
        const brand = e.closest("svg") ?? e.closest("[data-afterglow-logo]");
        if (brand) this.queue.add(brand);
        this.discover(e);
      }
      // Theme or regional stylesheet changes may affect existing logos.
      if (e.matches("html,body,style,link") || e.matches(regions))
        this.discover(document);
    }
    this.schedule();
  });
  private load = (event: Event) => {
    if (event.target instanceof Element) {
      this.discover(event.target);
      this.schedule();
    }
  };
  private reposition = () => {
    for (const [e, c] of this.corrections) if (c.overlay) this.position(e, c);
  };
  start() {
    if (this.running) return;
    this.running = true;
    this.sheet = document.createElement("style");
    this.sheet.className = "darkreader afterglow-owned afterglow-logos";
    (document.head ?? document.documentElement).append(this.sheet);
    this.discover(document);
    this.schedule();
    this.observe();
    document.addEventListener("load", this.load, true);
    window.addEventListener("resize", this.reposition);
  }
  private observe() {
    this.observer.observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: [
        "class",
        "style",
        "src",
        "srcset",
        "fill",
        "stroke",
        "data-darkreader-inline-invert",
        "alt",
        "aria-label",
        "title",
        "href",
        "dark",
        "data-theme",
        "data-color-scheme",
      ],
    });
  }
  private discover(root: Document | Element) {
    if (
      root instanceof Element &&
      !root.closest(regions) &&
      !root.querySelector(regions)
    )
      return;
    const candidates =
      root instanceof Element
        ? [root, ...root.querySelectorAll(`${graphics},[class],[id],span,a`)]
        : [
            ...root.querySelectorAll(
              `${regions} img,${regions} svg,${regions} [class],${regions} [id],${regions} span`,
            ),
          ];
    for (const e of candidates)
      if (eligible(e)) {
        if (e instanceof SVGElement && !(e instanceof SVGSVGElement)) continue;
        this.candidates.add(e);
        this.queue.add(e);
      }
  }
  private schedule() {
    if (this.running && this.timer === undefined && this.queue.size)
      this.timer = setTimeout(() => {
        this.timer = undefined;
        this.flush();
      }, 100);
  }
  private selector(e: Element, c: Correction): string {
    if (!c.attrs.has(e)) {
      c.attrs.set(e, e.getAttribute("data-afterglow-logo"));
      e.setAttribute("data-afterglow-logo", String(++this.id));
    }
    return `[data-afterglow-logo="${e.getAttribute("data-afterglow-logo")}"]`;
  }
  private restore(e: Element) {
    const c = this.corrections.get(e);
    if (!c) return;
    for (const [node, value] of c.attrs)
      value === null
        ? node.removeAttribute("data-afterglow-logo")
        : node.setAttribute("data-afterglow-logo", value);
    c.overlay?.remove();
    if (c.parent)
      c.parentValue === null
        ? c.parent.removeAttribute("data-afterglow-logo-parent")
        : c.parent.setAttribute("data-afterglow-logo-parent", c.parentValue!);
    this.corrections.delete(e);
  }
  private render() {
    if (this.sheet)
      this.sheet.textContent = [...this.corrections.values()]
        .flatMap((c) => c.rules)
        .join("\n");
  }
  private position(e: Element, c: Correction) {
    if (!c.overlay || !c.parent) return;
    const r = e.getBoundingClientRect(),
      p = c.parent.getBoundingClientRect();
    c.overlay.style.cssText = `position:absolute;pointer-events:none;z-index:-1;left:${r.left - p.left + (c.parent as HTMLElement).scrollLeft - (c.parent as HTMLElement).clientLeft}px;top:${r.top - p.top + (c.parent as HTMLElement).scrollTop - (c.parent as HTMLElement).clientTop}px;width:${r.width}px;height:${r.height}px;border-radius:3px;`;
  }
  private flush() {
    if (!this.running) return;
    this.observer.disconnect();
    try {
      for (const e of this.corrections.keys())
        if (!e.isConnected) this.restore(e);
      for (const e of this.candidates)
        if (!e.isConnected) this.candidates.delete(e);
      const queue = [...this.queue];
      this.queue.clear();
      for (const e of queue) {
        this.restore(e);
        this.render();
        if (!e.isConnected || !eligible(e)) continue;
        const bg = surface(e),
          a = analyze(e);
        if (!bg || !a || a.colors.every((c) => contrast(c, bg) >= 3)) continue;
        const c: Correction = { attrs: new Map(), rules: [] };
        const fg =
          contrast([230, 232, 237], bg) >= contrast([24, 26, 31], bg)
            ? "#E6E8ED"
            : "#181A1F";
        if (a.monochrome && a.foregrounds) {
          for (const node of a.foregrounds) {
            const target = filtered(
              fg === "#E6E8ED" ? [230, 232, 237] : [24, 26, 31],
              node.e,
              true,
            );
            if (target)
              c.rules.push(
                `${this.selector(node.e, c)}{${node.prop}:rgb(${target.map(Math.round).join(",")})!important;}`,
              );
          }
        } else if (
          a.monochrome &&
          getComputedStyle(e).filter === "none" &&
          getComputedStyle(e).boxShadow === "none"
        ) {
          // Only neutral monochrome pixels are recolored, not colored brands.
          const target = filtered(
            fg === "#E6E8ED" ? [230, 232, 237] : [24, 26, 31],
            e,
            true,
          );
          if (!target) continue;
          c.rules.push(
            `${this.selector(e, c)}{filter:brightness(0) ${luminance(target) > 0.5 ? "invert(1)" : ""}!important;}`,
          );
        } else {
          const parent = e.parentElement;
          if (
            !parent ||
            parent.matches("body,html") ||
            this.corrections.has(parent) ||
            parent.hasAttribute("data-afterglow-logo-parent")
          )
            continue;
          const light: Color = [246, 247, 250],
            dark: Color = [24, 26, 31];
          const score = (b: Color) =>
            a.colors.reduce((sum, v) => sum + (contrast(v, b) >= 3 ? 1 : 0), 0);
          const backing = score(light) > score(dark) ? "#F6F7FA" : "#181A1F";
          if (score(backing === "#F6F7FA" ? light : dark) <= score(bg))
            continue;
          c.parent = parent;
          c.parentValue = parent.getAttribute("data-afterglow-logo-parent");
          parent.setAttribute("data-afterglow-logo-parent", String(++this.id));
          const s = getComputedStyle(parent);
          const rect = parent.getBoundingClientRect();
          let transformed = false;
          for (let node: Element | null = e; node; node = node.parentElement)
            if (getComputedStyle(node).transform !== "none") transformed = true;
          if (
            transformed ||
            s.display === "contents" ||
            rect.width > 400 ||
            rect.height > 160
          ) {
            parent.removeAttribute("data-afterglow-logo-parent");
            continue;
          }
          const sel = `[data-afterglow-logo-parent="${parent.getAttribute("data-afterglow-logo-parent")}"]`;
          c.rules.push(
            `${sel}{isolation:isolate!important;${s.position === "static" ? "position:relative!important;" : ""}}`,
          );
          // A local stacking context puts the overlay above the parent's background
          // and below its content, without altering document flow or hit testing.
          c.overlay = document.createElement("div");
          c.overlay.className =
            "darkreader afterglow-owned afterglow-logo-backdrop";
          c.overlay.setAttribute("aria-hidden", "true");
          c.overlay.setAttribute("data-afterglow-backdrop", String(this.id));
          c.rules.push(
            `[data-afterglow-backdrop="${this.id}"]{background:${backing}!important;}`,
          );
          parent.append(c.overlay);
        }
        if (!c.rules.length) continue;
        this.corrections.set(e, c);
        this.render();
        this.position(e, c);
      }
    } finally {
      if (this.running) this.observe();
    }
  }
  stop() {
    this.running = false;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.observer.disconnect();
    this.queue.clear();
    this.candidates.clear();
    document.removeEventListener("load", this.load, true);
    window.removeEventListener("resize", this.reposition);
    for (const e of this.corrections.keys()) this.restore(e);
    this.sheet?.remove();
    this.sheet = undefined;
  }
}
