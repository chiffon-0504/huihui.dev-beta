const MOBILE_DRAWER_MEDIA = "(max-width: 900px)";
const DRAWER_FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable='true']",
  "[tabindex]",
].join(",");

function initMobileDrawer() {
  const sidebar = document.querySelector(".sidebar");
  if (!sidebar || document.getElementById("menuToggle")) return;

  const lang = typeof getCurrentLang === "function" ? getCurrentLang() : "zh";
  const layoutText =
    typeof getLayoutText === "function" ? getLayoutText(lang) : null;
  const drawerText = layoutText?.drawer || {
    open: "Open navigation",
    close: "Close navigation",
  };
  const mobileMedia = window.matchMedia(MOBILE_DRAWER_MEDIA);
  const fallbackInertStates = new WeakMap();
  let isOpen = false;
  let backgroundElements = [];

  if (!sidebar.id) {
    sidebar.id = "site-sidebar";
  }

  const toggle = document.createElement("button");
  toggle.id = "menuToggle";
  toggle.type = "button";
  toggle.setAttribute("aria-label", drawerText.open);
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", sidebar.id);
  toggle.textContent = "☰";

  const overlay = document.createElement("div");
  overlay.className = "sidebar-overlay";
  overlay.setAttribute("aria-hidden", "true");

  document.body.prepend(overlay);
  document.body.prepend(toggle);

  const skipLink = document.querySelector(".skip-link");
  if (skipLink) document.body.prepend(skipLink);

  function getFocusableElements(root) {
    return Array.from(root.querySelectorAll(DRAWER_FOCUSABLE_SELECTOR)).filter(
      (element) =>
        element.tabIndex >= 0 &&
        !element.hasAttribute("disabled") &&
        element.getAttribute("aria-hidden") !== "true",
    );
  }

  function disableFallbackFocusable(state, root) {
    if (!(root instanceof Element)) return;

    const focusableElements = [
      ...(root.matches(DRAWER_FOCUSABLE_SELECTOR) ? [root] : []),
      ...root.querySelectorAll(DRAWER_FOCUSABLE_SELECTOR),
    ];

    focusableElements.forEach((focusable) => {
      if (state.focusableElements.some(({ element }) => element === focusable)) {
        return;
      }

      state.focusableElements.push({
        element: focusable,
        tabindex: focusable.getAttribute("tabindex"),
      });
      focusable.setAttribute("tabindex", "-1");
    });
  }

  function setFallbackInert(element, inert) {
    if (inert) {
      let state = fallbackInertStates.get(element);
      if (!state) {
        state = {
          ariaHidden: element.getAttribute("aria-hidden"),
          focusableElements: [],
          observer: null,
        };
        fallbackInertStates.set(element, state);

        state.observer = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
              disableFallbackFocusable(state, node);
            });
          });
        });
        state.observer.observe(element, { childList: true, subtree: true });
      }

      element.setAttribute("aria-hidden", "true");
      disableFallbackFocusable(state, element);
      return;
    }

    const state = fallbackInertStates.get(element);
    if (!state) return;

    state.observer.disconnect();

    if (state.ariaHidden === null) {
      element.removeAttribute("aria-hidden");
    } else {
      element.setAttribute("aria-hidden", state.ariaHidden);
    }

    state.focusableElements.forEach(({ element: focusable, tabindex }) => {
      if (tabindex === null) {
        focusable.removeAttribute("tabindex");
      } else {
        focusable.setAttribute("tabindex", tabindex);
      }
    });
    fallbackInertStates.delete(element);
  }

  function setInert(element, inert) {
    if ("inert" in element) {
      element.inert = inert;
      return;
    }

    setFallbackInert(element, inert);
  }

  function setBackgroundInert(inert) {
    if (inert) {
      backgroundElements = Array.from(document.body.children).filter(
        (element) =>
          element !== sidebar &&
          element !== toggle &&
          element !== overlay &&
          element.tagName !== "SCRIPT" &&
          element.tagName !== "STYLE",
      );
      backgroundElements.forEach((element) => setInert(element, true));
      return;
    }

    backgroundElements.forEach((element) => setInert(element, false));
    backgroundElements = [];
  }

  function focusFirstDrawerItem() {
    const firstFocusable = getFocusableElements(sidebar)[0];

    if (firstFocusable) {
      firstFocusable.focus();
    }
  }

  function setOpen(open, { restoreFocus = true } = {}) {
    const wasOpen = isOpen;
    isOpen = Boolean(open) && mobileMedia.matches;

    sidebar.classList.toggle("open", isOpen);
    overlay.classList.toggle("active", isOpen);
    toggle.setAttribute("aria-expanded", String(isOpen));
    toggle.setAttribute("aria-label", isOpen ? drawerText.close : drawerText.open);

    if (mobileMedia.matches) {
      setInert(sidebar, !isOpen);
      if (isOpen) {
        sidebar.removeAttribute("aria-hidden");
      } else {
        sidebar.setAttribute("aria-hidden", "true");
      }
    } else {
      setInert(sidebar, false);
      sidebar.removeAttribute("aria-hidden");
    }

    setBackgroundInert(isOpen);

    if (isOpen) {
      focusFirstDrawerItem();
      requestAnimationFrame(() => {
        if (isOpen && !sidebar.contains(document.activeElement)) {
          focusFirstDrawerItem();
        }
      });
    } else if (wasOpen && restoreFocus && mobileMedia.matches) {
      toggle.focus();
    }
  }

  function trapFocus(event) {
    if (!isOpen || event.key !== "Tab") return;

    const focusableElements = getFocusableElements(sidebar);
    if (focusableElements.length === 0) {
      event.preventDefault();
      return;
    }

    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    if (
      event.shiftKey &&
      (document.activeElement === firstFocusable ||
        !sidebar.contains(document.activeElement))
    ) {
      event.preventDefault();
      lastFocusable.focus();
    } else if (
      !event.shiftKey &&
      (document.activeElement === lastFocusable ||
        !sidebar.contains(document.activeElement))
    ) {
      event.preventDefault();
      firstFocusable.focus();
    }
  }

  toggle.addEventListener("click", () => setOpen(!isOpen));
  overlay.addEventListener("click", () => setOpen(false));
  sidebar.querySelectorAll("nav a").forEach((link) => {
    link.addEventListener("click", () => setOpen(false));
  });
  document.addEventListener("keydown", (event) => {
    if (!isOpen) return;

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }

    trapFocus(event);
  });
  document.addEventListener("focusin", (event) => {
    if (
      isOpen &&
      event.target !== toggle &&
      !sidebar.contains(event.target)
    ) {
      focusFirstDrawerItem();
    }
  });

  const handleViewportChange = () => setOpen(false, { restoreFocus: false });
  if (typeof mobileMedia.addEventListener === "function") {
    mobileMedia.addEventListener("change", handleViewportChange);
  } else {
    mobileMedia.addListener(handleViewportChange);
  }

  setOpen(false, { restoreFocus: false });
}
