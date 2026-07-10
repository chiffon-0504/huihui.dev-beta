export const primaryRoutes = [
  { url: "/", file: "index.html", lang: "zh-Hant" },
  { url: "/about/", file: "about/index.html", lang: "zh-Hant" },
  { url: "/works/", file: "works/index.html", lang: "zh-Hant" },
  { url: "/milestones/", file: "milestones/index.html", lang: "zh-Hant" },
  { url: "/contact/", file: "contact/index.html", lang: "zh-Hant" },
  {
    url: "/tools/tier-maker/",
    file: "tools/tier-maker/index.html",
    lang: "zh-Hant",
  },
  { url: "/en/", file: "en/index.html", lang: "en" },
  { url: "/en/about/", file: "en/about/index.html", lang: "en" },
  { url: "/en/works/", file: "en/works/index.html", lang: "en" },
  {
    url: "/en/milestones/",
    file: "en/milestones/index.html",
    lang: "en",
  },
  { url: "/en/contact/", file: "en/contact/index.html", lang: "en" },
  {
    url: "/en/tools/tier-maker/",
    file: "en/tools/tier-maker/index.html",
    lang: "en",
  },
  { url: "/ja/", file: "ja/index.html", lang: "ja" },
  { url: "/ja/about/", file: "ja/about/index.html", lang: "ja" },
  { url: "/ja/works/", file: "ja/works/index.html", lang: "ja" },
  {
    url: "/ja/milestones/",
    file: "ja/milestones/index.html",
    lang: "ja",
  },
  { url: "/ja/contact/", file: "ja/contact/index.html", lang: "ja" },
  {
    url: "/ja/tools/tier-maker/",
    file: "ja/tools/tier-maker/index.html",
    lang: "ja",
  },
];

export const standaloneDocuments = [
  { url: "/114514/", file: "114514/index.html", lang: "zh-Hant" },
  { url: null, file: "404.html", lang: "zh-Hant" },
];

export const htmlDocuments = [...primaryRoutes, ...standaloneDocuments];
