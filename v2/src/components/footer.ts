import { element, link } from "../dom";
import { getContent, type Locale } from "../locales";

export function createFooter(locale: Locale): HTMLElement {
  const copy = getContent(locale).contact;
  const footer = element("footer", "site-footer");
  const inner = element("div", "footer-inner container");
  const copyright = element("p", "copyright", `© ${new Date().getFullYear()} huihui.dev`);
  const contact = element("p", "footer-contact");
  contact.append(element("span", "", copy.label), link(copy.email, `mailto:${copy.email}`));
  inner.append(copyright, contact);
  footer.append(inner);
  return footer;
}
