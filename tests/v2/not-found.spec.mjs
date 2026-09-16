import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { notFoundPaths } from "../support/v2-beta-contract.mjs";

const contentRoutes = ["/", "/about/", "/works/", "/posts/", "/en/", "/en/about/", "/en/works/", "/en/posts/", "/ja/", "/ja/about/", "/ja/works/", "/ja/posts/"];
const builtHtml = await readFile(new URL("../../v2/dist/404.html", import.meta.url), "utf8");

for (const javaScriptEnabled of [true, false]) {
  test.describe(`unknown navigation with JavaScript ${javaScriptEnabled ? "enabled" : "disabled"}`, () => {
    test.use({ javaScriptEnabled });
    for (const path of notFoundPaths) {
      test(`${path} preserves the URL and serves the shared 404`, async ({ page, baseURL }) => {
        const url = new URL(path, baseURL).href;
        const response = await page.goto(url);
        expect(response.status()).toBe(404);
        expect(response.headers()["cache-control"]).toBe("no-store");
        expect(response.request().redirectedFrom()).toBeNull();
        expect(page.url()).toBe(url);
        expect(await response.text()).toBe(builtHtml);
        await expect(page.locator("main.not-found")).toBeVisible();
        await expect(page.getByRole("heading", { level: 1 })).toHaveText("404");
        await expect(page.getByRole("heading", { level: 2 })).toHaveCount(3);
        await expect(page.locator("#app, main.home, nav, footer, script")).toHaveCount(0);
        for (const href of ["/", "/en/", "/ja/"]) {
          const link = page.locator(`a[href="${href}"]`);
          await page.keyboard.press("Tab");
          await expect(link).toBeFocused();
          await expect(link).toHaveCSS("outline-style", "solid");
          await expect(link).toHaveCSS("outline-width", "2px");
        }
        await page.keyboard.press("Enter");
        await expect(page).toHaveURL(new URL("/ja/", baseURL).href);
      });
    }
  });
}

test("all twelve content entries and only their canonical aliases remain valid", async ({ request, baseURL }) => {
  expect(contentRoutes).toHaveLength(12);
  for (const path of contentRoutes) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(200);
    expect(await response.text()).toContain('id="app"');
    for (const alias of [`${path}index.html`, ...(path === "/" ? [] : [path.slice(0, -1)])]) {
      const redirected = await request.get(`${alias}?keep=1`, { maxRedirects: 0 });
      expect(redirected.status(), alias).toBe(308);
      expect(redirected.headers().location).toBe(`${path}?keep=1`);
      const canonical = await request.get(alias);
      expect(canonical.status()).toBe(200);
      expect(canonical.url()).toBe(new URL(path, baseURL).href);
    }
  }
});

test("query, fragment, extension and missing-asset paths cannot fall back to Home", async ({ page, request, baseURL }) => {
  const url = new URL("/en/posts/extra/?private=do-not-reflect#original", baseURL).href;
  const response = await page.goto(url);
  expect(response.status()).toBe(404);
  expect(page.url()).toBe(url);
  expect(await response.text()).toBe(builtHtml);
  for (const path of ["/fr", "/fr/index.html", "/en/posts/extra", "/en/posts/extra/index.html", "/assets/missing.js", "/assets/missing.css", "/assets/missing.webp"]) {
    const missing = await request.get(path, { maxRedirects: 0 });
    expect(missing.status(), path).toBe(404);
    expect(missing.headers().location).toBeUndefined();
  }
  const head = await request.head("/does-not-exist/");
  expect(head.status()).toBe(404);
  expect(head.headers()["cache-control"]).toBe("no-store");
  expect(await head.body()).toHaveLength(0);
  for (const path of ["/404.html", "/404"]) {
    for (const method of ["get", "head"]) {
      const reserved = await request[method](`${path}?keep=1`, { maxRedirects: 0 });
      expect(reserved.status(), `${method} ${path}`).toBe(404);
      expect(reserved.headers().location).toBeUndefined();
      expect(reserved.headers()["cache-control"]).toBe("no-store");
      if (method === "get") expect(await reserved.text()).toBe(builtHtml);
      else expect(await reserved.body()).toHaveLength(0);
    }
  }
  // Static files must win before the error fallback, even with HTML Accept.
  const style = builtHtml.match(/href="(\/assets\/[^"\s]+\.css)"/)[1];
  const css = await request.get(style, { headers: { Accept: "text/html" } });
  expect(css.status()).toBe(200);
  expect(css.headers()["content-type"]).toContain("text/css");
  expect(await css.body()).toEqual(await readFile(new URL(`../../v2/dist${style}`, import.meta.url)));
});

test("error document reflows at 320px with enlarged text", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/fr/");
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const link of await page.getByRole("link").all()) await expect(link).toBeVisible();
});
