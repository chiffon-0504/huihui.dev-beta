function getCurrentLang() {
  const path = window.location.pathname;

  if (path.startsWith("/en/")) return "en";
  if (path.startsWith("/ja/")) return "ja";
  return "zh";
}

const localizedRouteSegments = Object.freeze({
  home: "",
  about: "about",
  works: "works",
  posts: "milestones",
  contact: "contact",
  status: "status",
  tools: "tools/tier-maker"
});

const routeKeysByPath = Object.freeze({
  "": "home",
  about: "about",
  works: "works",
  milestones: "posts",
  posts: "posts",
  contact: "contact",
  status: "status",
  "tools/tier-maker": "tools"
});

const navIcons = {
  about: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/></svg>`,
  works: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="3"/><path d="m7 16 3.2-3.2 2.6 2.6 2.2-2.2L17.5 16"/><circle cx="9" cy="9" r="1.2"/></svg>`,
  posts: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h7l3 3v13H7z"/><path d="M14 4v4h4"/><path d="M9.5 12h5"/><path d="M9.5 15.5h5"/></svg>`,
  contact: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="6" width="16" height="12" rx="2.5"/><path d="m5 8 7 5 7-5"/></svg>`,
  tools: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.8 5.2a4.2 4.2 0 0 0-5 5L5 15v4h4l4.8-4.8a4.2 4.2 0 0 0 5-5l-3 3-3-3z"/></svg>`
};

function getLocalizedPath(lang, page) {
  const prefix = lang === "zh" ? "/" : `/${lang}/`;
  const pathSegment = localizedRouteSegments[page];

  if (!pathSegment) return prefix;
  return `${prefix}${pathSegment}/`;
}

function getRouteKey(path) {
  const segments = path.replace(/^\/+|\/+$/g, "").split("/");

  if (segments[0] === "en" || segments[0] === "ja") {
    segments.shift();
  }

  return routeKeysByPath[segments.join("/")] || "home";
}

function getLocalizedRoute(lang, path) {
  return getLocalizedPath(lang, getRouteKey(path));
}

function getLayoutText(lang) {
  return (
    window.HUIHUI_I18N?.[lang]?.layout ||
    window.HUIHUI_I18N?.zh?.layout
  );
}

function initKeyboardNavigationModality() {
  if (!document.querySelector(".skip-link")) return;

  const root = document.documentElement;
  const attribute = "data-keyboard-navigation";
  const disableKeyboardNavigation = () => root.removeAttribute(attribute);

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Tab") {
        root.setAttribute(attribute, "true");
      }
    },
    true,
  );
  document.addEventListener("pointerdown", disableKeyboardNavigation, {
    capture: true,
    passive: true,
  });
  document.addEventListener("touchstart", disableKeyboardNavigation, {
    capture: true,
    passive: true,
  });
  window.addEventListener("pageshow", disableKeyboardNavigation);
  disableKeyboardNavigation();
}

function renderSkipLink() {
  const lang = getCurrentLang();
  const t = getLayoutText(lang);
  const main = document.querySelector("main.main");

  if (!main || !t?.skipLink || document.querySelector(".skip-link")) return;

  const existingTarget = document.getElementById("main-content");
  if (existingTarget && existingTarget !== main) return;

  main.id = "main-content";
  main.tabIndex = -1;

  const skipLink = document.createElement("a");
  skipLink.className = "skip-link";
  skipLink.href = "#main-content";
  skipLink.textContent = t.skipLink;
  document.body.prepend(skipLink);
}

function renderScrollControls() {
  const lang = getCurrentLang();
  const t = getLayoutText(lang);
  const main = document.querySelector("main.main");

  if (
    !main ||
    !t?.scrollControls?.top ||
    !t?.scrollControls?.bottom ||
    document.querySelector(".scroll-controls")
  ) {
    return;
  }

  const controls = document.createElement("div");
  controls.className = "scroll-controls";

  const createButton = (className, label, symbol) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `scroll-controls__button ${className}`;
    button.setAttribute("aria-label", label);
    button.textContent = symbol;
    return button;
  };

  const topButton = createButton(
    "scroll-controls__button--top",
    t.scrollControls.top,
    "↑",
  );
  const bottomButton = createButton(
    "scroll-controls__button--bottom",
    t.scrollControls.bottom,
    "↓",
  );
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  );
  const activePointers = new Set();
  const inactivityDelay = 3000;
  let hideDeadline = 0;
  let hideTimerId = null;

  controls.append(topButton, bottomButton);
  document.body.append(controls);

  const clearHideTimer = () => {
    if (hideTimerId === null) return;

    clearTimeout(hideTimerId);
    hideTimerId = null;
  };

  const shouldStayVisible = () =>
    controls.contains(document.activeElement) || activePointers.size > 0;

  const hideWhenInactive = () => {
    hideTimerId = null;

    if (shouldStayVisible()) return;

    const remainingDelay = hideDeadline - Date.now();
    if (remainingDelay > 0) {
      hideTimerId = setTimeout(hideWhenInactive, remainingDelay);
      return;
    }

    controls.classList.remove("is-visible");
  };

  const scheduleHide = () => {
    hideDeadline = Date.now() + inactivityDelay;

    if (shouldStayVisible()) {
      clearHideTimer();
      return;
    }

    if (hideTimerId === null) {
      hideTimerId = setTimeout(hideWhenInactive, inactivityDelay);
    }
  };

  const showTemporarily = () => {
    controls.classList.add("is-visible");
    scheduleHide();
  };

  const scrollTo = (position) => {
    const scrollOwner = document.scrollingElement;
    if (!scrollOwner) return;

    const top =
      position === "top"
        ? 0
        : Math.max(0, scrollOwner.scrollHeight - scrollOwner.clientHeight);

    window.scrollTo({
      top,
      behavior: reducedMotion.matches ? "auto" : "smooth",
    });
  };

  window.addEventListener("scroll", showTemporarily, { passive: true });
  controls.addEventListener("focusin", () => {
    controls.classList.add("is-visible");
    clearHideTimer();
  });
  controls.addEventListener("focusout", scheduleHide);
  controls.addEventListener("pointerdown", (event) => {
    activePointers.add(event.pointerId);
    controls.classList.add("is-visible");
    clearHideTimer();
  });

  const endPointerInteraction = (event) => {
    if (!activePointers.delete(event.pointerId)) return;
    scheduleHide();
  };

  window.addEventListener("pointerup", endPointerInteraction);
  window.addEventListener("pointercancel", endPointerInteraction);
  topButton.addEventListener("click", () => scrollTo("top"));
  bottomButton.addEventListener("click", () => scrollTo("bottom"));
}

function renderNavLink({
  href,
  icon,
  label,
  extraClass = "",
  navKey = ""
}) {
  const navAttribute = navKey ? ` data-nav="${navKey}"` : "";

  return `
    <a href="${href}" class="nav-link ${extraClass}"${navAttribute}>
      <span class="nav-icon">${icon}</span>
      <span class="nav-label">${label}</span>
    </a>
  `;
}

function getActiveNavKey(path) {
  const segments = path.replace(/^\/+|\/+$/g, "").split("/");
  const pageSegment = segments[0] === "en" || segments[0] === "ja" ? segments[1] : segments[0];

  if (pageSegment === "milestones" || pageSegment === "posts") return "posts";
  return pageSegment || "home";
}

function renderSidebar() {
  const lang = getCurrentLang();
  const t = getLayoutText(lang);
  const sidebar = document.querySelector("#site-sidebar");

  if (!sidebar || !t) return;

  sidebar.innerHTML = `
    <div class="sidebar-top">
      <h1><a href="${getLocalizedPath(lang, "home")}">huihui.dev</a></h1>

      <div class="lang-switch" aria-label="${t.languageSwitch.label}">
        <a href="${getLocalizedRoute("zh", window.location.pathname)}" lang="zh-Hant" class="${lang === "zh" ? "active" : ""}">${t.languageSwitch.zh}</a>
        <span>|</span>
        <a href="${getLocalizedRoute("en", window.location.pathname)}" lang="en" class="${lang === "en" ? "active" : ""}">${t.languageSwitch.en}</a>
        <span>|</span>
        <a href="${getLocalizedRoute("ja", window.location.pathname)}" lang="ja" class="${lang === "ja" ? "active" : ""}">${t.languageSwitch.ja}</a>
      </div>

      <nav>
        ${renderNavLink({
          href: getLocalizedPath(lang, "about"),
          icon: navIcons.about,
          label: t.nav.about,
          navKey: "about"
        })}
        ${renderNavLink({
          href: getLocalizedPath(lang, "works"),
          icon: navIcons.works,
          label: t.nav.works,
          navKey: "works"
        })}
        ${renderNavLink({
          href: getLocalizedPath(lang, "posts"),
          icon: navIcons.posts,
          label: t.nav.posts,
          navKey: "posts"
        })}
        ${renderNavLink({
          href: getLocalizedPath(lang, "contact"),
          icon: navIcons.contact,
          label: t.nav.contact,
          navKey: "contact"
        })}
        <a href="${getLocalizedPath(lang, "tools")}" class="nav-link tools-link" data-nav="tools">
          <span class="nav-icon">${navIcons.tools}</span>
          <span class="nav-label">${t.nav.tools}</span>
          <span class="beta-badge" aria-label="${t.beta}">${t.beta}</span>
        </a>
      </nav>
    </div>

    <div class="sidebar-bottom">
      © 2026 huihui.dev<br />
      ${t.rights}
    </div>
  `;
}

function setActiveSidebarLink() {
  const currentPath = window.location.pathname.replace(/\/$/, "");
  const activeNavKey = getActiveNavKey(window.location.pathname);

  document.querySelectorAll(".sidebar-top nav a").forEach((link) => {
    const href = link.getAttribute("href");
    if (!href) return;

    const normalizedHref = href.replace(/\/$/, "");
    const isActive =
      link.dataset.nav === activeNavKey ||
      currentPath === normalizedHref ||
      currentPath.startsWith(`${normalizedHref}/`) ||
      (
        link.dataset.nav === "tools" &&
        (
          currentPath.includes("/tools/") ||
          currentPath.includes("/en/tools/") ||
          currentPath.includes("/ja/tools/")
        )
      );

    link.classList.toggle("active", isActive);

    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  renderSkipLink();
  initKeyboardNavigationModality();
  renderScrollControls();
  renderSidebar();
  setActiveSidebarLink();
});
