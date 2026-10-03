// Cache authored markup, never browser-serialized innerHTML. Patch keyed nodes
// in place so focus, scroll and the Sudoku cell buttons survive HUD updates.
const rendered = new WeakMap();
function key(node) {
  if (node.nodeType !== 1) return null;
  for (const name of [
    "id",
    "data-ui-key",
    "data-cell",
    "data-digit",
    "data-page",
    "data-praise",
    "data-item",
    "data-buy",
    "data-action",
    "data-use",
    "data-skill",
  ]) {
    if (node.hasAttribute(name)) return name + ":" + node.getAttribute(name);
  }
  return null;
}
function compatible(a, b) {
  return (
    a &&
    a.nodeType === b.nodeType &&
    a.nodeName === b.nodeName &&
    key(a) === key(b)
  );
}
function patch(current, next) {
  if (current.nodeType !== 1) {
    if (current.nodeValue !== next.nodeValue)
      current.nodeValue = next.nodeValue;
    return;
  }
  for (const attr of [...current.attributes])
    if (!next.hasAttribute(attr.name)) current.removeAttribute(attr.name);
  for (const attr of [...next.attributes])
    if (current.getAttribute(attr.name) !== attr.value)
      current.setAttribute(attr.name, attr.value);
  patchChildren(current, next);
}
function patchChildren(parent, next) {
  const keyed = new Map(
    [...parent.childNodes].filter((n) => key(n)).map((n) => [key(n), n]),
  );
  let cursor = parent.firstChild;
  for (const desired of [...next.childNodes]) {
    const desiredKey = key(desired);
    let current = desiredKey ? keyed.get(desiredKey) : cursor;
    if (!compatible(current, desired)) current = desired.cloneNode(true);
    if (current !== cursor) parent.insertBefore(current, cursor);
    patch(current, desired);
    cursor = current.nextSibling;
  }
  while (cursor) {
    const next = cursor.nextSibling;
    cursor.remove();
    cursor = next;
  }
}
export function renderMarkup(element, html) {
  if (rendered.get(element) === html) return false;
  const template = element.ownerDocument.createElement("template");
  template.innerHTML = html;
  patchChildren(element, template.content);
  rendered.set(element, html);
  return true;
}
export function animateHints(root, time) {
  for (const el of root.querySelectorAll("[data-appear-at]"))
    el.style.opacity = String(
      Math.max(0, Math.min(1, (time - Number(el.dataset.appearAt)) / 1)),
    );
  for (const el of root.querySelectorAll("[data-fade-until]")) {
    const start = Number(el.dataset.fadeAt),
      end = Number(el.dataset.fadeUntil);
    el.style.opacity = String(Math.max(0, (end - time) / (end - start)));
  }
}
