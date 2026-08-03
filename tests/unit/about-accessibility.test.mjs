import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { beforeAll, describe, expect, test, vi } from "vitest";

const root = process.cwd();
const locales = ["zh", "en", "ja"];
const localeFiles = locales.map((locale) => `js/locales/${locale}.js`);
const expectedCopy = {
  zh: {
    label: "複製程式碼",
    success: "已複製程式碼",
    failure: "複製失敗，請手動選取並複製",
  },
  en: {
    label: "Copy code",
    success: "Code copied",
    failure: "Could not copy code. Select and copy it manually.",
  },
  ja: {
    label: "コードをコピー",
    success: "コードをコピーしました",
    failure: "コードをコピーできませんでした。手動で選択してコピーしてください。",
  },
};
const expectedCardHeadings = {
  zh: ["maimai DX", "Favorite", "Best", "Arcaea", "Favorite", "Best", "Galgame"],
  en: ["maimai DX", "Favorite", "Best", "Arcaea", "Favorite", "Best", "Galgame"],
  ja: [
    "maimai でらっくす",
    "Favorite",
    "Best",
    "Arcaea",
    "Favorite",
    "Best",
    "美少女ゲーム",
  ],
};

let aboutSource;
let codeBlocksSource;
let codeCss;
let i18nSource;
let styleCss;

function flattenKeys(value, prefix = "") {
  return Object.entries(value).flatMap(([key, child]) => {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;

    if (child && typeof child === "object" && !Array.isArray(child)) {
      return flattenKeys(child, nextPrefix);
    }

    return [nextPrefix];
  });
}

async function createContext(pathname = "/about/") {
  const rootElement = {
    classList: { add() {} },
    innerHTML: "",
    querySelectorAll() {
      return [];
    },
  };
  const context = {
    AbortController,
    URL,
    clearTimeout: vi.fn(),
    document: {
      addEventListener() {},
      getElementById(id) {
        return id === "aboutPage" ? rootElement : null;
      },
      querySelectorAll() {
        return [];
      },
    },
    getHuihuiApiBase: () => "https://api.huihui.dev",
    navigator: { clipboard: { writeText: vi.fn() } },
    setTimeout: vi.fn(() => 1),
    window: { location: { pathname } },
  };
  vm.createContext(context);

  for (const relativePath of localeFiles) {
    const source = await readFile(path.join(root, relativePath), "utf8");
    vm.runInContext(source, context, { filename: relativePath });
  }

  vm.runInContext(i18nSource, context, { filename: "js/i18n.js" });
  vm.runInContext(aboutSource, context, { filename: "js/about-page.js" });
  vm.runInContext(codeBlocksSource, context, { filename: "js/code-blocks.js" });

  return { context, rootElement };
}

function getHeadings(markup) {
  return [...markup.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map(
    (match) => ({
      level: Number(match[1]),
      text: match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    }),
  );
}

function getRuleBody(css, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))?.[1] || "";
}

beforeAll(async () => {
  [aboutSource, codeBlocksSource, codeCss, i18nSource, styleCss] =
    await Promise.all([
      readFile(path.join(root, "js/about-page.js"), "utf8"),
      readFile(path.join(root, "js/code-blocks.js"), "utf8"),
      readFile(path.join(root, "css/code.css"), "utf8"),
      readFile(path.join(root, "js/i18n.js"), "utf8"),
      readFile(path.join(root, "style.css"), "utf8"),
    ]);
});

describe("About copy control localization", () => {
  test("keeps aligned, non-empty copy keys with natural text in every locale", async () => {
    const { context } = await createContext();
    const dictionaries = JSON.parse(
      vm.runInContext("JSON.stringify(window.HUIHUI_I18N)", context),
    );
    const expectedKeys = ["failure", "label", "success"];

    for (const locale of locales) {
      expect(flattenKeys(dictionaries[locale].about.copy).sort()).toEqual(
        expectedKeys,
      );
      expect(dictionaries[locale].about.copy).toEqual(expectedCopy[locale]);
      expect(Object.values(dictionaries[locale].about.copy).every(Boolean)).toBe(
        true,
      );
    }
  });

  test("uses the shared i18n lookup without fixed Chinese copy strings", () => {
    expect(codeBlocksSource).toContain(
      'button.setAttribute("aria-label", getI18nText("about.copy.label"))',
    );
    expect(codeBlocksSource).toContain(
      'status.textContent = getI18nText("about.copy.success")',
    );
    expect(codeBlocksSource).toContain(
      'status.textContent = getI18nText("about.copy.failure")',
    );
    expect(codeBlocksSource).not.toMatch(/複製程式碼|複製失敗/);
    expect(codeBlocksSource).not.toMatch(/location\.pathname|alert\s*\(/);
    expect(i18nSource).toContain("function getI18nText(keyPath)");
    expect(i18nSource).toContain("getCurrentLocale()");
    expect(i18nSource).toContain("getLocaleValue(");
  });

  test("creates a non-hidden polite atomic status region", () => {
    expect(codeBlocksSource).toContain('status.setAttribute("role", "status")');
    expect(codeBlocksSource).toContain(
      'status.setAttribute("aria-live", "polite")',
    );
    expect(codeBlocksSource).toContain(
      'status.setAttribute("aria-atomic", "true")',
    );
    expect(codeBlocksSource).not.toMatch(
      /status\.(?:hidden|style\.display)|status\.setAttribute\("hidden"/,
    );

    const statusRule = getRuleBody(codeCss, ".code-copy-status");
    expect(statusRule).toContain("position: absolute");
    expect(statusRule).toContain("clip-path: inset(50%)");
    expect(statusRule).not.toMatch(/display\s*:\s*none|visibility\s*:\s*hidden/);
  });

  test("clears stale status and reports localized Clipboard success and failure", async () => {
    const { context } = await createContext("/en/about/");
    const status = { textContent: "stale status" };
    const button = {
      innerHTML: "<svg>copy</svg>",
      closest(selector) {
        if (selector === ".code-block") {
          return { querySelector: () => ({ innerText: "print('fixture')" }) };
        }
        if (selector === ".code-header") {
          return { querySelector: () => status };
        }
        return null;
      },
    };
    context.button = button;
    vm.runInContext(
      "copyButtonContents.set(button, button.innerHTML)",
      context,
    );

    context.navigator.clipboard.writeText.mockResolvedValueOnce(undefined);
    await vm.runInContext("copyCode(button)", context);
    expect(context.navigator.clipboard.writeText).toHaveBeenLastCalledWith(
      "print('fixture')",
    );
    expect(status.textContent).toBe(expectedCopy.en.success);

    status.textContent = "stale success";
    context.navigator.clipboard.writeText.mockRejectedValueOnce(
      new Error("fixture rejection"),
    );
    await expect(vm.runInContext("copyCode(button)", context)).resolves.toBeUndefined();
    expect(status.textContent).toBe(expectedCopy.en.failure);
    expect(button.innerHTML).toBe("<svg>copy</svg>");
  });
});

describe("About heading hierarchy", () => {
  test("renders the same h3 card and h4 child structure in all locales", async () => {
    for (const locale of locales) {
      const pathnames = { zh: "/about/", en: "/en/about/", ja: "/ja/about/" };
      const { context, rootElement } = await createContext(pathnames[locale]);
      const cardMarkup = vm.runInContext("renderAboutInterestCards()", context);
      const cardHeadings = getHeadings(cardMarkup);

      expect(cardHeadings.map(({ level }) => level)).toEqual([3, 4, 4, 3, 4, 4, 3]);
      expect(cardHeadings.map(({ text }) => text)).toEqual(
        expectedCardHeadings[locale],
      );
      expect(cardMarkup).toMatch(
        /<h3>\s*<a[\s\S]*?class="rhythm-title-link"[\s\S]*?<\/a>\s*<\/h3>/,
      );
      expect(cardMarkup).toMatch(
        /<h3>\s*<a[\s\S]*?class="arcaea-title-link"[\s\S]*?<\/a>\s*<\/h3>/,
      );

      vm.runInContext("renderAboutPage()", context);
      const mainHeadings = getHeadings(rootElement.innerHTML);
      expect(mainHeadings.map(({ level }) => level)).toEqual([
        1, 2, 3, 4, 4, 3, 4, 4, 3,
      ]);
      expect(rootElement.innerHTML).toContain(
        '<h1 data-i18n="about.title"></h1>',
      );
      expect(rootElement.innerHTML).toContain(
        '<h2 data-i18n="about.interests"></h2>',
      );
    }
  });

  test("keeps the heading text and visual declarations while changing elements", () => {
    expect(aboutSource).not.toMatch(/<h5\b|<article\b[^>]*>\s*<h4\b/);
    expect(styleCss).not.toContain(".interest-card h4 {");
    expect(styleCss).not.toContain(".rhythm-record-text h5 {");

    const cardRule = getRuleBody(
      styleCss,
      ".about-page .interest-card > h3",
    );
    expect(cardRule).toContain("margin: 0 0 18px");
    expect(cardRule).toContain("font-size: clamp(2rem, 3vw, 3rem)");
    expect(cardRule).toContain("font-weight: 700");
    expect(cardRule).toContain("line-height: 1.08");
    expect(cardRule).toContain("letter-spacing: inherit");

    const childRule = getRuleBody(
      styleCss,
      "body:has(#aboutPage) .rhythm-record-text h4",
    );
    expect(childRule).toContain("margin: 0");
    expect(childRule).toContain("font-size: 1rem");
    expect(childRule).toContain("font-weight: 700");
  });
});
