const HUIHUI_API_ENDPOINTS = Object.freeze({
  production: "https://api.huihui.dev",
  beta: "https://huihui-api-beta.huihuigames01.workers.dev",
});

const ROOT_OVERLAY_SCROLLBAR_SCRIPT =
  "/vendor/overlayscrollbars/overlayscrollbars.browser.es6.min.js";

let rootOverlayScrollbarInitialized = false;
let rootOverlayScrollbarRequested = false;

function initRootOverlayScrollbar() {
  if (
    typeof document.createElement !== "function" ||
    rootOverlayScrollbarInitialized
  ) {
    return;
  }

  function initialize() {
    if (rootOverlayScrollbarInitialized) return;

    const { ClickScrollPlugin, OverlayScrollbars } =
      window.OverlayScrollbarsGlobal || {};

    if (typeof OverlayScrollbars !== "function") return;

    const prefersReducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    OverlayScrollbars.plugin(ClickScrollPlugin);
    const instance = OverlayScrollbars(document.body, {
      scrollbars: {
        autoHide: "never",
        clickScroll: !prefersReducedMotion,
        dragScroll: true,
        theme: "os-theme-huihui",
        visibility: "auto",
      },
    });

    if (instance) rootOverlayScrollbarInitialized = true;
  }

  if (typeof window.OverlayScrollbarsGlobal?.OverlayScrollbars === "function") {
    initialize();
    return;
  }

  if (rootOverlayScrollbarRequested) return;

  rootOverlayScrollbarRequested = true;
  const script = document.createElement("script");
  script.src = ROOT_OVERLAY_SCROLLBAR_SCRIPT;
  script.async = true;
  script.dataset.rootOverlayScrollbar = "true";
  script.addEventListener("load", initialize, { once: true });
  document.head.append(script);
}

function isBetaSiteHostname(hostname) {
  const normalizedHostname = String(hostname).toLowerCase();

  return (
    normalizedHostname === "beta.huihui.dev" ||
    normalizedHostname === "huihuidev-beta.pages.dev" ||
    normalizedHostname.endsWith(".huihuidev-beta.pages.dev")
  );
}

function getHuihuiApiBase(hostname = window.location.hostname) {
  return isBetaSiteHostname(hostname)
    ? HUIHUI_API_ENDPOINTS.beta
    : HUIHUI_API_ENDPOINTS.production;
}

function configureContactFormApi() {
  const contactForm = document.getElementById("contact-form");

  if (contactForm) {
    contactForm.action = `${getHuihuiApiBase()}/api/contact`;
  }
}

function initHuihuiSite() {
  configureContactFormApi();
  initRootOverlayScrollbar();

  if (typeof initCodeBlocks === "function") {
    initCodeBlocks();
  }

  if (typeof initHomeCards === "function") {
    initHomeCards();
  }

  if (typeof initGlassMaterial === "function") {
    initGlassMaterial();
  }

  if (typeof initMobileDrawer === "function") {
    initMobileDrawer();
  }
}

document.addEventListener("DOMContentLoaded", initHuihuiSite);
