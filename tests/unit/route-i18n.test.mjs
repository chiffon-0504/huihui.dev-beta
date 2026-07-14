import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, test } from "vitest";
import { primaryRouteGroups } from "../support/routes.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const locales = ["zh", "en", "ja"];
const localeFiles = locales.map((locale) => `js/locales/${locale}.js`);

async function createLayoutContext(pathname = "/") {
  const sidebar = { innerHTML: "" };
  const document = {
    addEventListener() {},
    querySelector(selector) {
      return selector === "#site-sidebar" ? sidebar : null;
    },
    querySelectorAll() {
      return [];
    },
  };
  const context = {
    document,
    window: {
      location: { pathname },
    },
  };

  vm.createContext(context);

  const layoutSource = await readFile(path.join(root, "js/layout.js"), "utf8");
  vm.runInContext(layoutSource, context, { filename: "js/layout.js" });

  for (const relativePath of localeFiles) {
    const source = await readFile(path.join(root, relativePath), "utf8");
    vm.runInContext(source, context, { filename: relativePath });
  }

  return { context, sidebar };
}

describe("route and localization core", () => {
  test("generates every equivalent route across all three locales", async () => {
    const { context } = await createLayoutContext();

    for (const routeGroup of primaryRouteGroups) {
      for (const sourcePath of Object.values(routeGroup.paths)) {
        for (const targetLocale of locales) {
          const result = vm.runInContext(
            `getLocalizedRoute(${JSON.stringify(targetLocale)}, ${JSON.stringify(sourcePath)})`,
            context,
          );

          expect(
            result,
            `${sourcePath} -> ${targetLocale}`,
          ).toBe(routeGroup.paths[targetLocale]);
        }
      }
    }
  });

  test("uses locale dictionaries for shared dynamic layout labels", async () => {
    const { context, sidebar } = await createLayoutContext("/en/works/");
    const layout = context.window.HUIHUI_I18N.en.layout;

    layout.nav.works = "Dictionary Works";
    layout.languageSwitch.label = "Dictionary language switch";
    layout.languageSwitch.en = "Dictionary English";
    layout.beta = "Dictionary Beta";
    layout.rights = "Dictionary rights";
    vm.runInContext("renderSidebar()", context);

    expect(sidebar.innerHTML).toContain("Dictionary Works");
    expect(sidebar.innerHTML).toContain('aria-label="Dictionary language switch"');
    expect(sidebar.innerHTML).toContain("Dictionary English");
    expect(sidebar.innerHTML).toContain('aria-label="Dictionary Beta"');
    expect(sidebar.innerHTML).toContain("Dictionary rights");
    expect(sidebar.innerHTML).toContain('href="/en/works/"');
  });

  test("defines localized values for dynamic Tier Maker labels", async () => {
    const { context } = await createLayoutContext();
    const expected = {
      zh: { uploadedImageAlt: "上傳的圖片", newTier: "新等級" },
      en: { uploadedImageAlt: "Uploaded image", newTier: "NEW" },
      ja: { uploadedImageAlt: "アップロード画像", newTier: "新規" },
    };

    for (const locale of locales) {
      const messages = context.window.HUIHUI_I18N[locale].tierMaker;

      expect(messages.uploadedImageAlt).toBe(expected[locale].uploadedImageAlt);
      expect(messages.newTier).toBe(expected[locale].newTier);
      expect(messages.downloadFileName).toBe("tier-list.png");
    }
  });
});
