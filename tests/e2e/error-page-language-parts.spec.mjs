import { expect, test } from "@playwright/test";

const localOrigin = "http://127.0.0.1:4173";
const viewports = [
  { name: "desktop", size: { width: 1280, height: 720 } },
  { name: "mobile", size: { width: 390, height: 844 } },
];
const pages = [
  {
    name: "missing route",
    path: "/language-parts-missing-route/",
    status: 404,
    heading: "404",
    paragraphs: ["這個頁面不存在。", "This page does not exist.", "このページは存在しません。"],
    bodyText: "404 這個頁面不存在。 This page does not exist. このページは存在しません。 回首頁 / Home / ホーム",
  },
  {
    name: "114514",
    path: "/114514/",
    status: 200,
    heading: "114514",
    paragraphs: ["這個頁面太過惡臭了。", "This page is far too foul.", "このページはあまりにも臭すぎます。"],
    bodyText: "114514 這個頁面太過惡臭了。 This page is far too foul. このページはあまりにも臭すぎます。 回首頁 / Home / ホーム",
  },
];

const normalizeText = (value) => value.replace(/\s+/g, " ").trim();

function observePage(page, expectedDocumentPath, expectedStatus) {
  const diagnostics = { consoleErrors: [], pageErrors: [], localFailures: [] };
  page.on("console", (message) => {
    const expectedDocument404 =
      expectedStatus === 404 &&
      message.text() ===
        "Failed to load resource: the server responded with a status of 404 (Not Found)";
    if (message.type() === "error" && !expectedDocument404) {
      diagnostics.consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (
      url.origin === localOrigin &&
      response.status() >= 400 &&
      !(url.pathname === expectedDocumentPath && response.request().resourceType() === "document")
    ) {
      diagnostics.localFailures.push(`${response.status()} ${url.pathname}`);
    }
  });
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    if (url.origin === localOrigin) diagnostics.localFailures.push(`FAILED ${url.pathname}`);
  });
  return diagnostics;
}

async function effectiveLanguage(locator) {
  return locator.evaluate((element) =>
    element.closest("[lang]")?.getAttribute("lang"),
  );
}

async function expectLanguageContract(page, pageContract) {
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hant");
  await expect(page.locator("h1")).toHaveText(pageContract.heading);
  await expect(page.locator(".error-card > p")).toHaveText(pageContract.paragraphs);

  const paragraphs = page.locator(".error-card > p");
  expect(await effectiveLanguage(paragraphs.nth(0))).toBe("zh-Hant");
  for (const [index, lang] of [[1, "en"], [2, "ja"]]) {
    await expect(paragraphs.nth(index)).toHaveAttribute("lang", lang);
    expect(await effectiveLanguage(paragraphs.nth(index))).toBe(lang);
    expect(await paragraphs.nth(index).evaluate((element) => element.lang)).toBe(lang);
  }

  const homeLink = page.locator("a.error-home-button");
  await expect(homeLink).toHaveAttribute("href", "/");
  await expect(homeLink).toHaveAccessibleName("回首頁 / Home / ホーム");
  expect(await effectiveLanguage(homeLink)).toBe("zh-Hant");
  for (const { lang, text } of [{ lang: "en", text: "Home" }, { lang: "ja", text: "ホーム" }]) {
    const part = homeLink.locator(`span[lang="${lang}"]`);
    await expect(part).toHaveText(text);
    expect(await effectiveLanguage(part)).toBe(lang);
    expect(await part.evaluate((element) => element.lang)).toBe(lang);
  }

  expect(normalizeText(await page.locator("body").innerText())).toBe(pageContract.bodyText);
}

for (const pageContract of pages) {
  for (const viewport of viewports) {
    test(`${pageContract.name} preserves language, text, focus, and layout at ${viewport.name}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: viewport.size });
      const page = await context.newPage();
      const diagnostics = observePage(page, pageContract.path, pageContract.status);
      const response = await page.goto(pageContract.path, { waitUntil: "load" });

      expect(response?.status()).toBe(pageContract.status);
      await expectLanguageContract(page, pageContract);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

      await page.keyboard.press("Tab");
      await expect(page.locator("a.error-home-button")).toBeFocused();
      expect(diagnostics.consoleErrors).toEqual([]);
      expect(diagnostics.pageErrors).toEqual([]);
      expect(diagnostics.localFailures).toEqual([]);
      await context.close();
    });
  }

  test(`${pageContract.name} exposes the static language contract without JavaScript`, async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    const diagnostics = observePage(page, pageContract.path, pageContract.status);
    const response = await page.goto(pageContract.path, { waitUntil: "load" });

    expect(response?.status()).toBe(pageContract.status);
    await expectLanguageContract(page, pageContract);
    expect(diagnostics.consoleErrors).toEqual([]);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(diagnostics.localFailures).toEqual([]);
    await context.close();
  });
}
