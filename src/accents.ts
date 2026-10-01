const hoverSelector =
  'button, input[type="button"], input[type="submit"], input[type="reset"], [role="button"]';
const focusSelector =
  'a[href], button, input, select, textarea, [contenteditable]:not([contenteditable="false"]), [role="button"]';
const attribute = "data-afterglow-accent";
const glow =
  "0 0 0 1px rgba(185, 174, 245, 0.25), 0 0 8px rgba(185, 174, 245, 0.18)";
function eligible(e: Element | null): e is HTMLElement {
  return (
    e instanceof HTMLElement &&
    e.getRootNode() === document &&
    e.isConnected &&
    !e.matches(':disabled, [aria-disabled="true"]') &&
    !e.closest('[inert], [aria-disabled="true"]')
  );
}
export class Accents {
  private active = false;
  private style: HTMLStyleElement | null = null;
  private hovered: HTMLElement | null = null;
  private focused: HTMLElement | null = null;
  private nextId = 0;
  private keyboard = false;
  private pointerDown = () => {
    this.keyboard = false;
    this.focused = null;
    this.render();
  };
  private keyDown = (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    this.keyboard = true;
    this.focusChanged();
  };
  private targets = new Map<HTMLElement, { id: string; shadow: string }>();
  private disabledObserver = new MutationObserver(() => this.render());
  private pointerOver = (event: PointerEvent) => {
    if (event.pointerType === "touch") return;
    const target =
      event.target instanceof Element
        ? event.target.closest(hoverSelector)
        : null;
    this.hovered = eligible(target) ? target : null;
    this.render();
  };
  private pointerOut = (event: PointerEvent) => {
    const next =
      event.relatedTarget instanceof Element
        ? event.relatedTarget.closest(hoverSelector)
        : null;
    this.hovered = eligible(next) ? next : null;
    this.render();
  };
  private focusChanged = () => {
    const e = document.activeElement;
    this.focused =
      this.keyboard &&
      eligible(e) &&
      e.matches(focusSelector) &&
      e.matches(":focus-visible")
        ? e
        : null;
    this.render();
  };
  setActive(enabled: boolean) {
    if (enabled === this.active) return;
    if (!enabled) {
      this.stop();
      return;
    }
    this.active = true;
    this.style = document.createElement("style");
    this.style.className = "darkreader afterglow-accents";
    this.style.dataset.afterglowOwned = "accents";
    (document.head ?? document.documentElement).append(this.style);
    document.addEventListener("pointerdown", this.pointerDown, true);
    document.addEventListener("keydown", this.keyDown, true);
    document.addEventListener("pointerover", this.pointerOver, true);
    document.addEventListener("pointerout", this.pointerOut, true);
    document.addEventListener("focusin", this.focusChanged, true);
    document.addEventListener("focusout", this.focusChanged, true);
    this.focusChanged();
  }
  private render() {
    if (!this.active || !this.style) return;
    const desired = new Set(
      [this.hovered, this.focused].filter(
        (e): e is HTMLElement =>
          eligible(e) &&
          ((e === this.hovered && e.matches(":hover")) ||
            (e === this.focused && e.matches(":focus-visible"))),
      ),
    );
    for (const e of this.targets.keys())
      if (!desired.has(e)) {
        e.removeAttribute(attribute);
        this.targets.delete(e);
      }
    for (const e of desired)
      if (!this.targets.has(e)) {
        const shadow = getComputedStyle(e).boxShadow;
        const id = String(++this.nextId);
        this.targets.set(e, {
          id,
          shadow: shadow === "none" ? "" : shadow + ", ",
        });
        e.setAttribute(attribute, id);
      }
    this.disabledObserver.disconnect();
    for (const e of this.targets.keys())
      this.disabledObserver.observe(e, {
        attributes: true,
        attributeFilter: ["disabled", "aria-disabled"],
      });
    const css = [...this.targets.values()]
      .map(
        ({ id, shadow }) =>
          `[${attribute}="${id}"]:not(:disabled):not([aria-disabled="true"]):not([aria-disabled="true"] *):not([inert] *) { box-shadow: ${shadow}${glow} !important; }`,
      )
      .join("\n");
    if (this.style.textContent !== css) this.style.textContent = css;
  }
  stop() {
    this.active = false;
    document.removeEventListener("pointerdown", this.pointerDown, true);
    document.removeEventListener("keydown", this.keyDown, true);
    document.removeEventListener("pointerover", this.pointerOver, true);
    document.removeEventListener("pointerout", this.pointerOut, true);
    document.removeEventListener("focusin", this.focusChanged, true);
    document.removeEventListener("focusout", this.focusChanged, true);
    this.disabledObserver.disconnect();
    for (const e of this.targets.keys()) e.removeAttribute(attribute);
    this.targets.clear();
    this.style?.remove();
    this.style = null;
    this.focused = null;
    // Keep the last pointer target only to restore a still-hovered button after a theme update.
  }
}
