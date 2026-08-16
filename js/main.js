const HUIHUI_API_ENDPOINTS = Object.freeze({
  production: "https://api.huihui.dev",
  beta: "https://huihui-api-beta.huihuigames01.workers.dev",
});

const ROOT_OVERLAY_SCROLLBAR_SCRIPT =
  "/vendor/overlayscrollbars/overlayscrollbars.browser.es6.min.js";

function initRootOverlayScrollbar() {
  if (typeof document.createElement !== "function") return;

  function initialize() {
    const { ClickScrollPlugin, OverlayScrollbars } =
      window.OverlayScrollbarsGlobal || {};

    if (typeof OverlayScrollbars !== "function") return;

    OverlayScrollbars.plugin(ClickScrollPlugin);
    OverlayScrollbars(document.body, {
      scrollbars: {
        autoHide: "never",
        clickScroll: true,
        dragScroll: true,
        theme: "os-theme-huihui",
        visibility: "auto",
      },
    });
  }

  if (window.OverlayScrollbarsGlobal) {
    initialize();
    return;
  }

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
