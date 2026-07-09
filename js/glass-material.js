let glassMaterialReady = false;
let glassMaterialTicking = false;

function updateGlassMaterial() {
  const root = document.documentElement;

  root.style.setProperty("--glass-tint-opacity", "0.58");
  root.style.setProperty("--glass-tint-hover-opacity", "0.64");
}

function requestGlassMaterialUpdate() {
  if (glassMaterialTicking) return;

  glassMaterialTicking = true;
  requestAnimationFrame(() => {
    updateGlassMaterial();
    glassMaterialTicking = false;
  });
}

function initGlassMaterial() {
  if (glassMaterialReady) return;

  glassMaterialReady = true;
  updateGlassMaterial();
  window.addEventListener("scroll", requestGlassMaterialUpdate, { passive: true });
  window.addEventListener("resize", requestGlassMaterialUpdate);
}
