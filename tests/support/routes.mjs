const localeMetadata = {
  zh: { lang: "zh-Hant" },
  en: { lang: "en" },
  ja: { lang: "ja" },
};

export const primaryRouteGroups = [
  {
    routeKey: "home",
    navKey: null,
    paths: { zh: "/", en: "/en/", ja: "/ja/" },
  },
  {
    routeKey: "about",
    navKey: "about",
    paths: { zh: "/about/", en: "/en/about/", ja: "/ja/about/" },
  },
  {
    routeKey: "works",
    navKey: "works",
    paths: { zh: "/works/", en: "/en/works/", ja: "/ja/works/" },
  },
  {
    routeKey: "posts",
    navKey: "posts",
    paths: {
      zh: "/milestones/",
      en: "/en/milestones/",
      ja: "/ja/milestones/",
    },
  },
  {
    routeKey: "contact",
    navKey: "contact",
    paths: { zh: "/contact/", en: "/en/contact/", ja: "/ja/contact/" },
  },
  {
    routeKey: "tools",
    navKey: "tools",
    paths: {
      zh: "/tools/tier-maker/",
      en: "/en/tools/tier-maker/",
      ja: "/ja/tools/tier-maker/",
    },
  },
];

export const primaryRoutes = Object.entries(localeMetadata).flatMap(
  ([locale, { lang }]) =>
    primaryRouteGroups.map(({ routeKey, navKey, paths }) => {
      const url = paths[locale];

      return {
        url,
        file: url === "/" ? "index.html" : `${url.slice(1)}index.html`,
        lang,
        locale,
        routeKey,
        navKey,
      };
    }),
);

export const standaloneDocuments = [
  { url: "/114514/", file: "114514/index.html", lang: "zh-Hant" },
  { url: null, file: "404.html", lang: "zh-Hant" },
];

export const htmlDocuments = [...primaryRoutes, ...standaloneDocuments];
