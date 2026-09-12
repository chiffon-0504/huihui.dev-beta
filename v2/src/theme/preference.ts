export type ThemePreference = "auto" | "light" | "dark";
export const THEME_STORAGE_KEY = "huihui-v2-theme";

export function readPreference(host: Window): ThemePreference {
  try {
    const value = host.localStorage.getItem(THEME_STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "auto";
  } catch {
    return "auto";
  }
}
