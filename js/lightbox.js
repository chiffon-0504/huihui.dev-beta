document.addEventListener("DOMContentLoaded", () => {
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightboxImg");
  const lightboxClose = document.getElementById("lightboxClose");

  if (
    !(lightbox instanceof HTMLDialogElement) ||
    !(lightboxImg instanceof HTMLImageElement) ||
    !(lightboxClose instanceof HTMLButtonElement)
  ) {
    return;
  }

  let activeTrigger = null;

  function isLightboxTrigger(element) {
    return (
      element instanceof HTMLImageElement &&
      element.matches("img.zoomable:not(.no-lightbox)") &&
      !element.closest("a")
    );
  }

  function prepareTrigger(image) {
    if (!isLightboxTrigger(image)) return;

    if (!image.hasAttribute("tabindex")) {
      image.tabIndex = 0;
    }

    if (!image.hasAttribute("role")) {
      image.setAttribute("role", "button");
    }

    image.setAttribute("aria-haspopup", "dialog");
  }

  function prepareTriggers(root) {
    if (root instanceof HTMLImageElement) {
      prepareTrigger(root);
    }

    if (root instanceof Element) {
      root
        .querySelectorAll("img.zoomable:not(.no-lightbox)")
        .forEach(prepareTrigger);
    }
  }

  function openLightbox(trigger) {
    if (!isLightboxTrigger(trigger)) return;

    activeTrigger = trigger;
    lightboxImg.src =
      trigger.dataset.fullSrc || trigger.currentSrc || trigger.src;
    lightboxImg.alt = trigger.alt || "";

    if (!lightbox.open) {
      lightbox.showModal();
    }

    requestAnimationFrame(() => {
      if (lightbox.open) {
        lightbox.classList.add("show");
      }
    });

    lightboxClose.focus();
  }

  function closeLightbox() {
    if (!lightbox.open) return;

    const trigger = activeTrigger;

    lightbox.classList.remove("show");
    lightbox.close();
    lightboxImg.src = "";
    activeTrigger = null;

    if (trigger?.isConnected) {
      trigger.focus();
    }
  }

  prepareTriggers(document.body);

  const triggerObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => prepareTriggers(node));
    });
  });

  triggerObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;

    const image = event.target.closest("img.zoomable:not(.no-lightbox)");

    if (isLightboxTrigger(image)) {
      openLightbox(image);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (!isLightboxTrigger(event.target)) return;

    event.preventDefault();
    openLightbox(event.target);
  });

  lightboxClose.addEventListener("click", closeLightbox);

  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) {
      closeLightbox();
    }
  });

  lightbox.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeLightbox();
  });
});
