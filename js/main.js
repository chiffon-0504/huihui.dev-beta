const HUIHUI_API_ENDPOINTS = Object.freeze({
  production: "https://api.huihui.dev",
  beta: "https://huihui-api-beta.huihuigames01.workers.dev",
});

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
