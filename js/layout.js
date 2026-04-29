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
        <a href="${getLocalizedPath(lang, "about")}">${t.about}</a>
        <a href="${getLocalizedPath(lang, "works")}">${t.works}</a>
        <a href="${getLocalizedPath(lang, "posts")}">${t.posts}</a>
        <a href="${getLocalizedPath(lang, "contact")}">${t.contact}</a>
        <a href="/tools/tier-maker/" class="tools-link">
          ${t.tools}
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

document.addEventListener("DOMContentLoaded", renderSidebar);
