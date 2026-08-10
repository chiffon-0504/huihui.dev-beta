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
  tools: "tools/tier-maker"
});

const routeKeysByPath = Object.freeze({
  "": "home",
  about: "about",
  works: "works",
  milestones: "posts",
  posts: "posts",
  contact: "contact",
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
  renderSidebar();
  setActiveSidebarLink();
});
