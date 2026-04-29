function getCurrentLang() {
  const path = window.location.pathname;

  if (path.startsWith("/en/")) return "en";
  if (path.startsWith("/ja/")) return "ja";
  return "zh";
}

const layoutText = {
  zh: {
    home: "首頁",
    about: "關於",
    works: "作品",
    posts: "文章",
    contact: "聯絡",
    tools: "工具"
  },
  en: {
    home: "Home",
    about: "About",
    works: "Works",
    posts: "Posts",
    contact: "Contact",
    tools: "Tools"
  },
  ja: {
    home: "ホーム",
    about: "自己紹介",
    works: "作品",
    posts: "記事",
    contact: "連絡",
    tools: "ツール"
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
    <a class="brand" href="${getLocalizedPath(lang, "home")}">huihui</a>

    <nav class="side-nav">
      <a href="${getLocalizedPath(lang, "home")}">${t.home}</a>
      <a href="${getLocalizedPath(lang, "about")}">${t.about}</a>
      <a href="${getLocalizedPath(lang, "works")}">${t.works}</a>
      <a href="${getLocalizedPath(lang, "posts")}">${t.posts}</a>
      <a href="${getLocalizedPath(lang, "contact")}">${t.contact}</a>
      <a href="/tools/tier-maker/">${t.tools}</a>
    </nav>

    <div class="lang-switch">
      <a href="/">中</a>
      <span>|</span>
      <a href="/en/">En</a>
      <span>|</span>
      <a href="/ja/">Jp</a>
    </div>
  `;
}

document.addEventListener("DOMContentLoaded", renderSidebar);
