import { expect, test } from "@playwright/test";

const siteOrigin = "http://127.0.0.1:4173";
const aboutRoutes = ["/about/", "/en/about/", "/ja/about/"];
const expectedPrismAssets = [
  "/vendor/prism/themes/prism-tomorrow.min.css",
  "/vendor/prism/plugins/line-numbers/prism-line-numbers.min.css",
  "/vendor/prism/components/prism-core.min.js",
  "/vendor/prism/components/prism-python.min.js",
  "/vendor/prism/plugins/line-numbers/prism-line-numbers.min.js",
];

async function stubSteam(page) {
  await page.route("https://api.huihui.dev/api/steam-library", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, games: [] }),
    }),
  );
}

for (const route of aboutRoutes) {
  test(`${route} renders the VS Code workspace with local Prism profile text`, async ({
    page,
  }) => {
    await stubSteam(page);

    const executableRequests = [];
    const vendorResponses = new Map();

    page.on("request", (request) => {
      if (["script", "stylesheet"].includes(request.resourceType())) {
        executableRequests.push(request.url());
      }
    });
    page.on("response", (response) => {
      const url = new URL(response.url());
      if (url.pathname.startsWith("/vendor/prism/")) {
        vendorResponses.set(url.pathname, response.status());
      }
    });

    const response = await page.goto(route, { waitUntil: "load" });

    expect(response?.status()).toBe(200);
    await expect(page.locator(".vscode-window[role='region']")).toHaveAttribute(
      "data-vscode-ready",
      "true",
    );
    await expect(page.locator(".vscode-window[role='region']")).toHaveAttribute(
      "aria-label",
      /.+/,
    );
    await expect(page.locator(".vscode-editor-scroll[role='region']")).toHaveAttribute(
      "aria-label",
      /.+/,
    );
    await expect(page.locator("#profileCode .token.keyword").first()).toBeVisible();
    await expect(page.locator(".custom-line-numbers")).toBeVisible();
    await expect(page.locator(".vscode-window .copy-btn")).toBeHidden();

    expect(
      await page.evaluate(() => ({
        python: Boolean(window.Prism?.languages?.python),
        lineNumbers: Boolean(window.Prism?.plugins?.lineNumbers),
      })),
    ).toEqual({ python: true, lineNumbers: true });

    const renderedCode = await page.locator("#profileCode").evaluate((code) => ({
      lineCount: code.textContent.replace(/\n$/, "").split("\n").length,
      gutterCount: code
        .closest(".code-block")
        .querySelectorAll(".custom-line-numbers > span").length,
      textLength: code.innerText.trim().length,
    }));
    expect(renderedCode.gutterCount).toBe(renderedCode.lineCount);
    expect(renderedCode.gutterCount).toBeGreaterThan(1);
    expect(renderedCode.textLength).toBeGreaterThan(0);
    expect(
      await page
        .locator("#profileCode .token.keyword")
        .first()
        .evaluate((token) => getComputedStyle(token).color),
    ).toBe("rgb(204, 153, 205)");

    expect([...vendorResponses.entries()].sort()).toEqual(
      expectedPrismAssets.map((asset) => [asset, 200]).sort(),
    );
    expect(
      executableRequests.filter(
        (url) => new URL(url).origin !== siteOrigin,
      ),
    ).toEqual([]);
  });
}
