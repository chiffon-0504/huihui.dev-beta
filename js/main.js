const HUIHUI_API_ENDPOINTS = Object.freeze({
  production: "https://api.huihui.dev",
  beta: "https://huihui-api-beta.huihuigames01.workers.dev",
});

const ROOT_OVERLAY_SCROLLBAR_SCRIPT =
  "/vendor/overlayscrollbars/overlayscrollbars.browser.es6.min.js";

function preserveNativeScrollRestoration() {
  if (
    typeof performance === "undefined" ||
    typeof window.addEventListener !== "function" ||
    !document.documentElement?.style
  ) {
    return;
  }

  const root = document.documentElement;
  const [navigation] = performance.getEntriesByType("navigation");
  let inlineScrollBehavior = root.style.scrollBehavior;
  let restorationPending = ["back_forward", "reload"].includes(
    navigation?.type,
  );

  const useInstantRestoration = () => {
    inlineScrollBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    restorationPending = true;
  };

  // Chromium applies persisted offsets after parsing starts. Keep that native
  // restoration instant so OverlayScrollbars cannot interrupt a smooth scroll.
  if (restorationPending) root.style.scrollBehavior = "auto";

  // A cached document must also be instant before a Back/Forward traversal.
  window.addEventListener("pagehide", useInstantRestoration);
  window.addEventListener("pageshow", () => {
    if (!restorationPending) return;

    requestAnimationFrame(() => {
      root.style.scrollBehavior = inlineScrollBehavior;
      restorationPending = false;
    });
  });
}

preserveNativeScrollRestoration();

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

    const reducedMotionMedia =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;

    OverlayScrollbars.plugin(ClickScrollPlugin);
    const instance = OverlayScrollbars(document.body, {
      scrollbars: {
        autoHide: "never",
        clickScroll: !reducedMotionMedia?.matches,
        dragScroll: true,
        theme: "os-theme-huihui",
        visibility: "auto",
      },
    });

    if (!instance) return;

    rootOverlayScrollbarInitialized = true;

    if (reducedMotionMedia) {
      const syncClickScroll = () => {
        instance.options({
          scrollbars: {
            clickScroll: !reducedMotionMedia.matches,
          },
        });
      };

      reducedMotionMedia.addEventListener("change", syncClickScroll);
      instance.on("destroyed", () => {
        reducedMotionMedia.removeEventListener("change", syncClickScroll);
      });
    }
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
