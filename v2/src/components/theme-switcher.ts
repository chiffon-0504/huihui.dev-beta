import { content, type Locale } from "../content";
import { element } from "../dom";
import type { ThemeController, ThemePreference, ThemeState } from "../theme/controller";

export function createThemeSwitcher(locale: Locale, theme: ThemeController): HTMLDivElement {
  const copy = content[locale];
  const dropdown = element("div", "theme-switcher");
  const trigger = element("button", "theme-trigger");
  trigger.type = "button";
  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-expanded", "false");
  const icon = element("span", "theme-icon");
  icon.setAttribute("aria-hidden", "true");
  trigger.append(icon);
  const menu = element("ul", "theme-options");
  menu.hidden = true;
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", copy.theme);
  const modes: readonly ThemePreference[] = ["auto", "light", "dark"];
  const labels = { auto: copy.themeAuto, light: copy.themeLight, dark: copy.themeDark };
  const options = modes.map((mode) => {
    const item = element("li", "");
    item.setAttribute("role", "none");
    const option = element("button", "theme-option", labels[mode]);
    option.type = "button";
    option.tabIndex = -1;
    option.setAttribute("role", "menuitemradio");
    const selected = element("span", "theme-selected");
    selected.setAttribute("aria-hidden", "true");
    option.prepend(selected);
    option.addEventListener("click", () => {
      theme.setPreference(mode);
      close(true);
    });
    item.append(option);
    menu.append(item);
    return { option, selected, mode };
  });
  dropdown.append(trigger, menu);

  function close(restoreFocus = false): void {
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    if (restoreFocus) trigger.focus();
  }

  function open(index = modes.indexOf(theme.getState().preference)): void {
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    options[index]!.option.focus();
  }

  trigger.addEventListener("click", () => {
    if (menu.hidden) open();
    else close();
  });
  dropdown.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.hidden) {
      event.preventDefault();
      close(true);
    } else if (event.key === "Tab" && !menu.hidden) {
      // Let native Tab navigation continue from the menu button.
      close(true);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      if (menu.hidden || event.target === trigger) {
        open(direction === 1 ? 0 : options.length - 1);
      } else {
        const index = options.findIndex(({ option }) => option === document.activeElement);
        options[(index + direction + options.length) % options.length]!.option.focus();
      }
    } else if (!menu.hidden && (event.key === "Home" || event.key === "End")) {
      event.preventDefault();
      options[event.key === "Home" ? 0 : options.length - 1]!.option.focus();
    }
  });
  dropdown.addEventListener("focusout", (event) => {
    if (!(event.relatedTarget instanceof Node) || !dropdown.contains(event.relatedTarget)) close();
  });
  document.addEventListener("click", (event) => {
    if (event.target instanceof Node && !dropdown.contains(event.target)) close();
  });

  const render = (state: ThemeState): void => {
    icon.textContent = state.effective === "light" ? "☀︎" : "☾";
    trigger.setAttribute("aria-label", `${copy.theme}: ${labels[state.effective]}`);
    for (const { option, selected, mode } of options) {
      const checked = mode === state.preference;
      option.setAttribute("aria-checked", String(checked));
      selected.textContent = checked ? "✓" : "";
    }
  };
  theme.subscribe(render);
  return dropdown;
}
