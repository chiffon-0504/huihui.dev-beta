let glassMaterialReady = false;

function updateGlassMaterial() {
  const root = document.documentElement;

  root.style.setProperty("--glass-tint-opacity", "0.58");
  root.style.setProperty("--glass-tint-hover-opacity", "0.64");
}

function initGlassMaterial() {
  if (glassMaterialReady) return;

  glassMaterialReady = true;
  updateGlassMaterial();
}
