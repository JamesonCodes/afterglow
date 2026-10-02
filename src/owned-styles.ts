// Keep measurements in a single task: sheet.disabled does not remove nodes or
// ask the engine to regenerate styles, and restoration precedes the next paint.
export function originalColors<T>(measure: () => T): T {
  const sheets = [
    ...document.querySelectorAll<HTMLStyleElement>("style.darkreader"),
  ].flatMap((e) =>
    e.sheet ? [{ sheet: e.sheet, disabled: e.sheet.disabled }] : [],
  );
  try {
    for (const { sheet } of sheets) sheet.disabled = true;
    return measure();
  } finally {
    for (const { sheet, disabled } of sheets) sheet.disabled = disabled;
  }
}
function pageStyle(value: string | null): string {
  const el = document.createElement("span");
  el.setAttribute("style", value ?? "");
  return [...el.style]
    .filter((p) => !p.startsWith("--darkreader"))
    .map(
      (p) =>
        `${p}:${el.style.getPropertyValue(p)}:${el.style.getPropertyPriority(p)}`,
    )
    .sort()
    .join(";");
}
export function ownedMutation(r: MutationRecord): boolean {
  const e = r.target instanceof Element ? r.target : r.target.parentElement;
  if (e?.closest(".darkreader,.afterglow-owned")) return true;
  if (
    r.type === "attributes" &&
    r.attributeName === "style" &&
    e &&
    pageStyle(r.oldValue) === pageStyle(e.getAttribute("style"))
  )
    return true;
  return (
    r.type === "childList" &&
    [...r.addedNodes, ...r.removedNodes].length > 0 &&
    [...r.addedNodes, ...r.removedNodes].every(
      (n) => n instanceof Element && n.matches(".darkreader,.afterglow-owned"),
    )
  );
}
