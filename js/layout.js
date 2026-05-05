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
    posts: "貼文",
    contact: "聯絡",
    tools: "工具",
    english: "English",
    japanese: "日本語"
  },
  en: {
    home: "Home",
    about: "About",
    works: "Works",
    posts: "Posts",
    contact: "Contact",
    tools: "Tools",
    english: "English",
    japanese: "日本語"
  },
  ja: {
    home: "ホーム",
    about: "自己紹介",
    works: "作品",
    posts: "投稿",
    contact: "連絡",
    tools: "ツール",
    english: "English",
    japanese: "日本語"
  }
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
          ${renderNavLink(getLocalizedPath(lang, "about"), "⌾", t.about)}
          ${renderNavLink(getLocalizedPath(lang, "works"), "▣", t.works)}
          ${renderNavLink(getLocalizedPath(lang, "posts"), "☰", t.posts)}
          ${renderNavLink(getLocalizedPath(lang, "contact"), "✉", t.contact)}
        <a href="${getToolsPath(lang)}" class="nav-link tools-link" data-nav="tools">
          <span class="nav-icon">⌘</span>
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
