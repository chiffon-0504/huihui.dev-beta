import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { localeHref, supportedLocales } from "../../v2/src/locales";
import { budgetFailures, loadingBudgets, measurePerformance, readFiles } from "../../v2/tools/performance.mjs";

let bytes: Map<string, number>;
test.beforeAll(async () => {
  const build = measurePerformance(await readFiles(resolve("v2/dist")));
  bytes = new Map(build.inventory.map(({ file, bytes }) => [file, bytes]));
});
const photoPath = /^assets\/(?:fuji|tsutenkaku|shiba)-\d+-[\w-]+\.webp$/;

const memoryPath = /^assets\/ave-mujica-exitus-taipei-day2-(?:320|640)-[\w-]+\.webp$/;

for (const locale of supportedLocales) {
  for (const name of ["home", "about", "works", "posts"] as const) {
    for (const width of [1440, 390]) {
      test(`${locale} ${name} resource budgets and isolation at ${width}px`, async ({ page, baseURL }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        const route = localeHref(locale, "", name);
        const documentFile = `${route.slice(1)}index.html`;
        const requests: string[] = [];
        const unexpected: string[] = [];
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
        page.on("requestfailed", (request) => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
        page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.url()}: ${response.status()}`); });
        page.on("request", (request) => requests.push(request.url()));
        // Fresh Playwright context + routing disables cache. Never contact external infrastructure.
        await page.route("**/*", async (intercept) => {
          const url = new URL(intercept.request().url());
          const file = url.pathname === route ? documentFile : url.pathname.slice(1);
          const allowed = url.origin === baseURL && !url.search && bytes.has(file)
            && (file === documentFile || /\.(?:js|css|svg)$/.test(file) || (name === "works" && photoPath.test(file)) || (name === "home" && memoryPath.test(file)));
          if (!allowed) {
            unexpected.push(url.href);
            return intercept.abort("blockedbyclient");
          }
          return intercept.continue();
        });
        const sprite = page.waitForResponse((response) => /\/assets\/icons-[\w-]+\.svg$/.test(response.url()));
        await page.goto(route);
        await expect(page.locator(name === "home" ? "#version .desktop-version" : "main h1")).toBeVisible();
        expect(await (await sprite).finished()).toBeNull();
        const images = page.locator("main img");
        await expect(images).toHaveCount(name === "works" ? 3 : name === "home" ? 1 : 0);
        if (name === "works") await images.first().evaluate((image: HTMLImageElement) => image.decode());

        const footprint = () => {
          const paths = requests.filter((url) => new URL(url).origin === baseURL)
            .map((url) => new URL(url).pathname === route ? documentFile : new URL(url).pathname.slice(1));
          const shell = paths.filter((path) => !photoPath.test(path) && !memoryPath.test(path));
          const photos = paths.filter((path) => photoPath.test(path));
          const memories = paths.filter((path) => memoryPath.test(path));
          return { shellRequests: shell.length, shellBytes: shell.reduce((sum, path) => sum + (bytes.get(path) ?? 0), 0),
            worksImageRequests: photos.length, worksImageBytes: photos.reduce((sum, path) => sum + (bytes.get(path) ?? 0), 0),
            homeImageRequests: memories.length, homeImageBytes: memories.reduce((sum, path) => sum + (bytes.get(path) ?? 0), 0), paths };
        };
        const initial = footprint();
        // No exact lazy count at load: browsers may fetch near-viewport images at different distances.
        expect(budgetFailures(initial, loadingBudgets)).toEqual([]);
        expect(initial.shellRequests).toBe(loadingBudgets.shellRequests);
        await expect(page.locator('link[rel~="preload"][as="image"], link[rel~="prefetch"], link[rel~="preconnect"], link[rel~="dns-prefetch"]')).toHaveCount(0);

        if (name === "works") {
          for (let index = 0; index < 3; index++) {
            const image = images.nth(index);
            await expect(image).toHaveAttribute("loading", index === 0 ? "eager" : "lazy");
            await expect(image).toHaveAttribute("decoding", "async");
            await expect(image).not.toHaveAttribute("fetchpriority", "high");
            await image.scrollIntoViewIfNeeded();
            // Firefox may not have activated a lazy request in the scroll task yet.
            await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)).toBe(true);
            await image.evaluate((node: HTMLImageElement) => node.decode());
          }
          expect(footprint().worksImageRequests).toBe(3);
        } else {
          // Exercise the whole ordinary page without constructing Works or initiating its media.
          await page.locator("footer").scrollIntoViewIfNeeded();
          await page.locator(".language-trigger").click();
          await expect(page.locator(".language-option")).toHaveCount(3);
          await page.keyboard.press("Escape");
          expect(footprint().worksImageRequests).toBe(0);
          await expect(page.locator(".image-viewer")).toHaveCount(0);
        }
        if (name === "home") {
          await images.first().scrollIntoViewIfNeeded();
          await expect.poll(() => images.first().evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)).toBe(true);
          await images.first().evaluate((node: HTMLImageElement) => node.decode());
        }
        const browsed = footprint();
        expect(browsed.homeImageRequests).toBe(name === "home" ? 1 : 0);
        expect(budgetFailures(browsed, loadingBudgets)).toEqual([]);
        expect(unexpected).toEqual([]);
        expect(errors).toEqual([]);
        await testInfo.attach("resource-footprint", { body: JSON.stringify({
          route, width, deviceScaleFactor: testInfo.project.use.deviceScaleFactor,
          units: "requested build bytes, not encoded transfer bytes; repeated requests charged again",
          checkpoint: "initial = load + shell sprite + eager image decode; browsed = all local images decoded or footer/language interaction",
          initial, browsed, budgets: loadingBudgets,
        }, null, 2), contentType: "application/json" });
      });
    }
  }
}
