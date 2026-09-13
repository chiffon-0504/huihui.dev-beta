// Local Tabler outline sprite; source and MIT license are retained in the asset.
import sprite from "./icons.svg?no-inline";

export function createIcon(name: "sun" | "moon" | "github" | "check"): SVGSVGElement {
  const namespace = "http://www.w3.org/2000/svg";
  const icon = document.createElementNS(namespace, "svg");
  const attributes = {
    class: "icon",
    "data-icon": name,
    viewBox: "0 0 24 24",
    width: "24",
    height: "24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
    focusable: "false",
  };
  for (const [key, value] of Object.entries(attributes)) icon.setAttribute(key, value);
  const use = document.createElementNS(namespace, "use");
  use.setAttribute("href", `${sprite}#${name}`);
  icon.append(use);
  return icon;
}
