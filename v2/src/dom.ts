export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function link(text: string, href: string, className = ""): HTMLAnchorElement {
  const node = element("a", className, text);
  node.href = href;
  return node;
}
