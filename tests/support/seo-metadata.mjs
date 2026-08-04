import { primaryRouteGroups } from "./routes.mjs";

export const productionOrigin = "https://huihui.dev";
export const hreflangByLocale = {
  zh: "zh-Hant",
  en: "en",
  ja: "ja",
};
export const expectedHreflangs = ["zh-Hant", "en", "ja", "x-default"];

const routeGroupsByKey = new Map(
  primaryRouteGroups.map((routeGroup) => [routeGroup.routeKey, routeGroup]),
);

export function getProductionUrl(routePath) {
  return `${productionOrigin}${routePath}`;
}

export function getExpectedSeoMetadata(route) {
  const routeGroup = routeGroupsByKey.get(route.routeKey);

  if (!routeGroup) {
    throw new Error(`Unknown primary route group: ${route.routeKey}`);
  }

  return {
    canonical: getProductionUrl(route.url),
    alternates: [
      {
        hreflang: "zh-Hant",
        href: getProductionUrl(routeGroup.paths.zh),
      },
      { hreflang: "en", href: getProductionUrl(routeGroup.paths.en) },
      { hreflang: "ja", href: getProductionUrl(routeGroup.paths.ja) },
      {
        hreflang: "x-default",
        href: getProductionUrl(routeGroup.paths.zh),
      },
    ],
  };
}
