function getCurrentLocale() {
  const path = window.location.pathname;

  if (path.startsWith("/en/")) return "en";
  if (path.startsWith("/ja/")) return "ja";

  return "zh";
}

function getLocaleValue(source, keyPath) {
  return keyPath
    .split(".")
    .reduce((current, key) => (current ? current[key] : undefined), source);
}

function applyI18nText(messages) {
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const value = getLocaleValue(messages, element.dataset.i18n);

    if (typeof value === "string") {
      element.textContent = value;
    }
  });
}

function getDatasetKeyForI18nAttribute(attributeName) {
  return `i18n${attributeName
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("")}`;
}

function applyI18nAttributes(messages) {
  const supportedAttributes = ["alt", "title", "aria-label"];

  supportedAttributes.forEach((attributeName) => {
    const datasetKey = getDatasetKeyForI18nAttribute(attributeName);

    document.querySelectorAll(`[data-i18n-${attributeName}]`).forEach((element) => {
      const key = element.dataset[datasetKey];
      const value = getLocaleValue(messages, key);

      if (typeof value === "string") {
        element.setAttribute(attributeName, value);
      }
    });
  });
}

function applyI18n() {
  const locale = getCurrentLocale();
  const messages = window.HUIHUI_I18N && window.HUIHUI_I18N[locale];

  if (!messages) return;

  document.documentElement.lang = locale === "zh" ? "zh-Hant" : locale;
  applyI18nText(messages);
  applyI18nAttributes(messages);
}

document.addEventListener("DOMContentLoaded", applyI18n);