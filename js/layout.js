function getCurrentLang() {
  const path = window.location.pathname;

  if (path.startsWith("/en/")) return "en";
  if (path.startsWith("/ja/")) return "ja";
  return "zh";
}

const layoutText = {
  zh: {
    home: "首頁",
    about: "關於我",
    works: "作品",
    posts: "里程碑",
    contact: "聯絡",
    tools: "工具",
    english: "English",
    japanese: "日本語"
  },
  en: {
    home: "Home",
    about: "About",
    works: "Works",
    posts: "Milestones",
    contact: "Contact",
    tools: "Tools",
    english: "English",
    japanese: "日本語"
  },
  ja: {
    home: "ホーム",
    about: "自己紹介",
    works: "作品",
    posts: "マイルストーン",
    contact: "連絡",
    tools: "ツール",
    english: "English",
    japanese: "日本語"
  }
};

const navIcons = {
  about: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/></svg>`,
  works: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="3"/><path d="m7 16 3.2-3.2 2.6 2.6 2.2-2.2L17.5 16"/><circle cx="9" cy="9" r="1.2"/></svg>`,
  posts: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h7l3 3v13H7z"/><path d="M14 4v4h4"/><path d="M9.5 12h5"/><path d="M9.5 15.5h5"/></svg>`,
  contact: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="6" width="16" height="12" rx="2.5"/><path d="m5 8 7 5 7-5"/></svg>`,
  tools: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.8 5.2a4.2 4.2 0 0 0-5 5L5 15v4h4l4.8-4.8a4.2 4.2 0 0 0 5-5l-3 3-3-3z"/></svg>`
};

function getLocalizedPath(lang, page) {
  const prefix = lang === "zh" ? "/" : `/${lang}/`;

  if (page === "home") return prefix;
  return `${prefix}${page}/`;
}

function getToolsPath(lang) {
  if (lang === "en") return "/en/tools/tier-maker/";
  if (lang === "ja") return "/ja/tools/tier-maker/";
  return "/tools/tier-maker/";
}

function renderNavLink(href, icon, label, extraClass = "") {
  return `
    <a href="${href}" class="nav-link ${extraClass}">
      <span class="nav-icon">${icon}</span>
      <span class="nav-label">${label}</span>
    </a>
  `;
}

function renderSidebar() {
  const lang = getCurrentLang();
  const t = layoutText[lang] || layoutText.zh;
  const sidebar = document.querySelector("#site-sidebar");

  if (!sidebar) return;

  sidebar.innerHTML = `
    <div class="sidebar-top">
      <h1><a href="${getLocalizedPath(lang, "home")}">huihui.dev</a></h1>

      <div class="lang-switch" aria-label="Language switch">
        <a href="/" class="${lang === "zh" ? "active" : ""}">中</a>
        <span>|</span>
        <a href="/en/" class="${lang === "en" ? "active" : ""}">${t.english}</a>
        <span>|</span>
        <a href="/ja/" class="${lang === "ja" ? "active" : ""}">${t.japanese}</a>
      </div>

      <nav>
        ${renderNavLink(getLocalizedPath(lang, "about"), navIcons.about, t.about)}
        ${renderNavLink(getLocalizedPath(lang, "works"), navIcons.works, t.works)}
        ${renderNavLink(getLocalizedPath(lang, "posts"), navIcons.posts, t.posts)}
        ${renderNavLink(getLocalizedPath(lang, "contact"), navIcons.contact, t.contact)}
        <a href="${getToolsPath(lang)}" class="nav-link tools-link" data-nav="tools">
          <span class="nav-icon">${navIcons.tools}</span>
          <span class="nav-label">${t.tools}</span>
          <span class="beta-badge" aria-label="Beta">Beta</span>
        </a>
      </nav>
    </div>

    <div class="sidebar-bottom">
      © 2026 huihui.dev<br />
      All rights reserved.
    </div>
  `;
}

function setActiveSidebarLink() {
  const currentPath = window.location.pathname.replace(/\/$/, "");

  document.querySelectorAll(".sidebar-top nav a").forEach((link) => {
    const href = link.getAttribute("href");
    if (!href) return;

    const normalizedHref = href.replace(/\/$/, "");
    link.classList.remove("active");

    if (
      currentPath === normalizedHref ||
      currentPath.startsWith(`${normalizedHref}/`)
    ) {
      link.classList.add("active");
    }

    if (
      link.dataset.nav === "tools" &&
      (
        currentPath.includes("/tools/") ||
        currentPath.includes("/en/tools/") ||
        currentPath.includes("/ja/tools/")
      )
    ) {
      link.classList.add("active");
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  renderSidebar();
  setActiveSidebarLink();
});
