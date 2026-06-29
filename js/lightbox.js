document.addEventListener("DOMContentLoaded", () => {
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightboxImg");
  const lightboxClose = document.getElementById("lightboxClose");

  if (!lightbox || !lightboxImg || !lightboxClose) {
    return;
  }

  document.addEventListener("click", (e) => {
    const img = e.target.closest("img:not(.no-lightbox)");

    if (!img) return;
    if (img.closest("a")) return;

    lightboxImg.src = img.src;
    lightboxImg.alt = img.alt || "";
    lightbox.classList.add("show");
  });

  lightboxClose.addEventListener("click", () => {
    lightbox.classList.remove("show");
    lightboxImg.src = "";
  });

  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox) {
      lightbox.classList.remove("show");
      lightboxImg.src = "";
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      lightbox.classList.remove("show");
      lightboxImg.src = "";
    }
  });
});