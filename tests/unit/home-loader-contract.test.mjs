import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { beforeAll, describe, expect, test, vi } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const homeDocuments = ["index.html", "en/index.html", "ja/index.html"];
const obsoleteElementIds = [
  "apod-image",
  "apod-link",
  "apodTitle",
  "apod-desc",
  "apod-date",
  "projectUpdateLink",
];
const liveHomeFunctionNames = [
  "getSafeTechNewsUrl",
  "getHomeTechNewsText",
  "getHomeInfrastructureText",
  "getSystemStatusText",
  "getSystemStatusLabel",
  "aggregateSystemStatus",
  "unknownSystemStatus",
  "getValidSystemStatus",
  "createStatusText",
  "createSystemStatusState",
  "formatSystemStatusTime",
  "createSystemStatusComponents",
  "renderSystemStatus",
  "setTechNewsStatus",
  "formatTechNewsTimeAgo",
  "getValidTechNewsItem",
  "renderTechNewsCards",
  "getInfrastructureStatusText",
  "getValidInfrastructureProvider",
  "createInfrastructureStatusText",
  "createInfrastructureCard",
  "renderInfrastructureStatus",
  "setInfrastructureStatusLoading",
  "loadTechNews",
  "loadInfrastructureStatus",
  "loadSystemStatus",
  "isSystemStatusHistoryObject",
  "isSystemStatusHistoryDate",
  "getValidSystemStatusHistory",
  "getSystemStatusHistoryLocale",
  "formatSystemStatusHistoryDate",
  "formatSystemStatusHistoryCellDate",
  "formatSystemStatusHistoryDuration",
  "hasSystemStatusHistoryImpact",
  "getSystemStatusHistoryImpactText",
  "createSystemStatusHistoryText",
  "createSystemStatusHistoryCard",
  "renderSystemStatusHistory",
  "loadSystemStatusHistory",
  "isSystemStatusIncidentInstant",
  "isSystemStatusIncidentUrl",
  "getValidSystemStatusIncidents",
  "formatSystemStatusIncidentTime",
  "createSystemStatusIncidentText",
  "createSystemStatusIncidentTime",
  "createSystemStatusIncidentReport",
  "renderSystemStatusIncidents",
  "loadSystemStatusIncidents",
  "initHomeCards",
];

let homeCardsSource;
let i18nSource;
let homeSources;

beforeAll(async () => {
  [homeCardsSource, i18nSource, homeSources] = await Promise.all([
    readFile(path.join(root, "js/home-cards.js"), "utf8"),
    readFile(path.join(root, "js/i18n.js"), "utf8"),
    Promise.all(
      homeDocuments.map((document) =>
        readFile(path.join(root, document), "utf8"),
      ),
    ),
  ]);
});

describe("Tech News relative-time localization", () => {
  const locales = [
    { path: "/", expected: ["12 分鐘前", "12 小時前", "3 天前"], now: "現在" },
    { path: "/en/", expected: ["12 minutes ago", "12 hours ago", "3 days ago"], now: "just now" },
    { path: "/ja/", expected: ["12 分前", "12 時間前", "3 日前"], now: "今" },
  ];

  function createContext(pathname) {
    const context = vm.createContext({
      window: { location: { pathname } },
      document: { addEventListener() {} },
      navigator: { language: "fr-FR" },
      URL,
    });
    vm.runInContext(i18nSource, context);
    vm.runInContext(homeCardsSource, context);
    return context;
  }

  test.each(locales)("$path uses the page locale for minutes, hours, and days", ({ path, expected }) => {
    const context = createContext(path);
    const actual = ["12 mins ago", "12 hours ago", "3 days ago"].map(
      (value) => context.formatTechNewsTimeAgo(value),
    );
    expect(actual).toEqual(expected);
    if (path !== "/en/") expect(actual.join(" ")).not.toMatch(/(?:hours|minutes|mins) ago/);
  });

  test.each(locales)("$path preserves the Worker future/equal-time clamp", ({ path, now }) => {
    const context = createContext(path);
    expect(context.formatTechNewsTimeAgo("just now")).toBe(now);
    expect(context.formatTechNewsTimeAgo("-2 hours ago")).toBe(now);
  });

  test.each(locales)("$path keeps cards with missing/invalid dates and upstream fallbacks", ({ path }) => {
    const context = createContext(path);
    for (const timeAgo of [undefined, null, "", 42, {}]) {
      const item = context.getValidTechNewsItem({
        category: "OpenAI", title: "OpenAI News", source: "OpenAI News",
        tag: "News", link: "https://openai.com/news", timeAgo,
      });
      expect(item).not.toBeNull();
      expect(item.timeAgo).toBe("");
      expect(item.link).toBe("https://openai.com/news");
    }
    expect(context.formatTechNewsTimeAgo("now")).toBe("now");
    expect(context.formatTechNewsTimeAgo("999999999999999999999 hours ago")).toBe("");
  });

  test("English pluralization and zero-minute ages use the internationalization API", () => {
    const context = createContext("/en/");
    expect(["0 mins ago", "1 min ago", "1 hours ago", "1 days ago"].map(
      (value) => context.formatTechNewsTimeAgo(value),
    )).toEqual(["0 minutes ago", "1 minute ago", "1 hour ago", "1 day ago"]);
  });
});

describe("Home loader contract", () => {
  test("localized Home documents keep live cards without obsolete loader DOM", () => {
    for (const [index, html] of homeSources.entries()) {
      const document = homeDocuments[index];

      for (const id of obsoleteElementIds) {
        expect(html, `${document}: ${id}`).not.toMatch(
          new RegExp(`\\bid=["']${id}["']`, "i"),
        );
      }

      expect(html, document).toContain('aria-labelledby="systemStatusTitle"');
      expect(html, document).toContain('data-system-status-surface="home"');
      expect(html, document).not.toContain('id="systemStatusHistory"');
      expect(html, document).not.toContain('id="systemStatusIncidents"');
      expect(html, document).toContain('id="websiteVersionTitle"');
      expect(html, document).toContain('id="techNewsCards"');
      expect(html, document).toContain('id="infrastructureStatusCards"');
      expect(html.indexOf('id="infrastructureStatusTitle"')).toBeGreaterThan(
        html.indexOf('id="techNewsCards"'),
      );
    }
  });

  test("initialization retains only the live Tech News loader lifecycle", () => {
    const elementLookups = [];
    const fetchMock = vi.fn();
    const setIntervalMock = vi.fn();
    const context = {
      document: {
        querySelectorAll() {
          return [];
        },
        getElementById(id) {
          elementLookups.push(id);
          return null;
        },
      },
      fetch: fetchMock,
      setInterval: setIntervalMock,
      window: {},
    };

    vm.createContext(context);
    vm.runInContext(homeCardsSource, context, { filename: "js/home-cards.js" });
    vm.runInContext("initHomeCards(); initHomeCards();", context);

    expect(elementLookups).toEqual([
      "systemStatusHistory",
      "systemStatusIncidents",
      "techNewsCards",
      "infrastructureStatusCards",
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(setIntervalMock).not.toHaveBeenCalled();
    expect(vm.runInContext("typeof loadTechNews", context)).toBe("function");
    expect(vm.runInContext("typeof initHomeCards", context)).toBe("function");

    for (const obsoleteFunction of [
      "loadApodCard",
      "loadProjectUpdateCard",
      "shortenText",
    ]) {
      expect(vm.runInContext(`typeof ${obsoleteFunction}`, context)).toBe(
        "undefined",
      );
    }
  });

  test("dynamic Tech News status uses one polite atomic live region", () => {
    for (const [index, html] of homeSources.entries()) {
      const document = homeDocuments[index];
      const statusMatches = html.match(
        /<p class="tech-news-loading tech-news-status" role="status" aria-live="polite" aria-atomic="true" data-tech-news-state="loading">/g,
      );

      expect(statusMatches, document).toHaveLength(1);
    }

    expect(homeCardsSource).toContain(
      'container.querySelector(":scope > .tech-news-status")',
    );
    expect(homeCardsSource).toContain('message.setAttribute("role", "status")');
    expect(homeCardsSource).toContain(
      'message.setAttribute("aria-live", "polite")',
    );
    expect(homeCardsSource).toContain(
      'message.setAttribute("aria-atomic", "true")',
    );
    expect(homeCardsSource).not.toMatch(
      /container\.setAttribute\("(?:role|aria-live|aria-atomic)"/,
    );
  });

  test("Infrastructure Status uses one localized polite atomic loading region", () => {
    for (const [index, html] of homeSources.entries()) {
      const document = homeDocuments[index];
      const statusMatches = html.match(
        /<p class="infrastructure-status-message" role="status" aria-live="polite" aria-atomic="true" data-infrastructure-status-state="loading" data-i18n="home\.infrastructure\.loading"><\/p>/g,
      );

      expect(statusMatches, document).toHaveLength(1);
      expect(html, document).toContain(
        'aria-labelledby="infrastructureStatusTitle"',
      );
    }

    expect(homeCardsSource).toContain(
      'message.setAttribute("aria-live", "polite")',
    );
    expect(homeCardsSource).toContain(
      'message.setAttribute("aria-atomic", "true")',
    );
    expect(homeCardsSource).toContain(
      '`${getHuihuiApiBase()}/api/infrastructure-status`',
    );
  });

  test("System Status uses a polite atomic live region and the first-party API", () => {
    for (const [index, html] of homeSources.entries()) {
      const document = homeDocuments[index];

      expect(html, document).toContain(
        'role="status" aria-live="polite" aria-atomic="true" data-system-status-surface="home"',
      );
    }

    expect(homeCardsSource).toContain(
      '`${getHuihuiApiBase()}/api/system-status`',
    );
    expect(homeCardsSource).toContain('cache: "no-store"');
  });

  test("the frontend script has no orphan loader, selector, endpoint, or interval", () => {
    const declaredFunctions = [
      ...homeCardsSource.matchAll(/^(?:async\s+)?function\s+(\w+)\s*\(/gm),
    ].map((match) => match[1]);

    expect(declaredFunctions).toEqual(liveHomeFunctionNames);
    expect(homeCardsSource).not.toMatch(/\b(?:import|export)\b/);
    expect(homeCardsSource).not.toContain("/api/apod");
    expect(homeCardsSource).not.toContain("/api/github-updates");
    expect(homeCardsSource).not.toMatch(/\bsetInterval\s*\(/);
    expect(homeCardsSource).not.toMatch(/\bclearInterval\s*\(/);
    expect(homeCardsSource).not.toMatch(/\b300000\b|5\s*\*\s*60/);

    for (const id of obsoleteElementIds) {
      expect(homeCardsSource).not.toContain(id);
    }
  });
});
