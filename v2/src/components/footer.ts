import { element } from "../dom";

export function createFooter(): HTMLElement {
  const footer = element("footer", "site-footer");
  const inner = element("div", "footer-inner container");
  const copyright = element("p", "copyright", `© ${new Date().getFullYear()} huihui.dev`);
  inner.append(copyright);
  footer.append(inner);
  return footer;
}
