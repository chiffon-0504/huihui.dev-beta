function initHuihuiSite() {
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
