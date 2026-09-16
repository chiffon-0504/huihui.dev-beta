import { expect, test } from "@playwright/test";
import { getContent, localeHref, supportedLocales } from "../../v2/src/locales";

for (const locale of supportedLocales) {
  const route = localeHref(locale, "", "works");
  const copy = getContent(locale).worksPage;
  for (const width of [1440, 390]) {
    test(`${locale} Works content, images and reflow at ${width}px`, async ({ page, baseURL }, testInfo) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      page.on("requestfailed", (request) => errors.push(request.url()));
      page.on("response", (response) => { if (response.status() >= 400) errors.push(response.url()); });
      page.on("request", (request) => { if (new URL(request.url()).origin !== new URL(baseURL!).origin) errors.push(request.url()); });
      await page.setViewportSize({ width, height: 900 });
      await page.goto(route);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page).toHaveTitle(`${copy.title} | huihui.dev`);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", copy.description);
      await expect(page.locator("main h1")).toHaveText(copy.title);
      await expect(page.locator(".works-lead")).toHaveText(copy.introduction);
      await expect(page.locator("main h2")).toHaveText([copy.website.title, copy.tool.title, copy.photography.title]);
      await expect(page.locator(".work-description")).toHaveText([copy.website.description, copy.tool.description, copy.photography.description]);
      await expect(page.locator(".work-card a")).toHaveText([copy.website.linkLabel, copy.tool.linkLabel]);
      await expect(page.locator(".work-card a").first()).toHaveAttribute("href", "https://github.com/chiffon-0504/huihui.dev-beta");
      await expect(page.locator(".work-card a").last()).toHaveAttribute("href", `https://huihui.dev${localeHref(locale)}tools/tier-maker/`);
      await expect(page.locator(".navbar-primary a[aria-current=page]")).toHaveAttribute("href", route);
      await expect(page.locator("main a a, main a button, main button a, main h3, main h4")).toHaveCount(0);
      expect(await page.locator("[id]").evaluateAll((nodes) => nodes.map((node) => node.id).filter((id, i, all) => all.indexOf(id) !== i))).toEqual([]);
      const images = page.locator("main img");
      await expect(images).toHaveCount(3);
      for (const [index, alt] of [copy.website.alt, copy.photography.alt, copy.photography.shibaAlt].entries()) {
        const image = images.nth(index);
        await expect(image).toHaveAttribute("alt", alt);
        await expect(image).toHaveAttribute("loading", index === 0 ? "eager" : "lazy");
        await expect(image).toHaveAttribute("decoding", "async");
        await expect(image).toHaveAttribute("width", "800");
        await expect(image).toHaveAttribute("height", "1067");
        await expect(image).toHaveAttribute("srcset", /480w, .*800w, .*1200w$/);
        await image.scrollIntoViewIfNeeded();
        await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)).toBe(true);
        const selection = await image.evaluate((node: HTMLImageElement) => ({
          current: node.currentSrc, rendered: node.getBoundingClientRect().width,
          height: node.getBoundingClientRect().height, sizes: node.sizes,
        }));
        expect(selection.sizes).toContain("(max-width: 40rem)");
        expect(selection.rendered).toBe(width === 1440 ? 536 : 358);
        expect(selection.height / selection.rendered).toBeCloseTo(1067 / 800, 2);
        expect(selection.current).toMatch(width === 1440 ? /-(800|1200)-[\w-]+\.webp$/ : /-(480|800)-[\w-]+\.webp$/);
        await testInfo.attach(`image-selection-${index}`, { body: JSON.stringify(selection), contentType: "application/json" });
      }
      for (const theme of ["light", "dark"]) {
        await page.locator("html").evaluate((node, value) => { node.dataset.theme = value; }, theme);
        if (testInfo.project.name === "chromium") await page.screenshot({ path: testInfo.outputPath(`works-${locale}-${width}-${theme}.png`), fullPage: true });
      }
      await page.setViewportSize({ width: 320, height: 700 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.locator("html").evaluate((node) => { node.style.fontSize = "200%"; });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await page.locator("main p, main h1, main h2, main a").evaluateAll((nodes) => nodes.filter((node) => node.scrollWidth > node.clientWidth).map((node) => node.textContent))).toEqual([]);
      expect(errors).toEqual([]);
    });
  }

  test(`${locale} Works language switching and shell navigation preserve the page`, async ({ page }) => {
    for (const hash of ["", "#main-content"]) {
      await page.goto(`${route}${hash}`);
      for (const target of supportedLocales) {
        await page.locator(".language-trigger").click();
        const destination = localeHref(target, hash, "works");
        const option = page.locator(`.language-option[hreflang="${target}"]`);
        await expect(option).toHaveAttribute("href", destination);
        await option.click();
        await expect(page).toHaveURL(new RegExp(`${destination}$`));
        await expect(page.locator("main h1")).toHaveText(getContent(target).worksPage.title);
      }
    }
    for (const origin of [localeHref(locale), localeHref(locale, "", "about")]) {
      await page.goto(origin);
      await page.locator(".navbar-primary a").first().click();
      await expect(page).toHaveURL(new RegExp(`${route}$`));
    }
  });

  test(`${locale} Works project links support native keyboard focus`, async ({ page }) => {
    await page.goto(route);
    await page.keyboard.press("Tab");
    await expect(page.locator(".skip-link")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("main")).toBeFocused();
    for (const anchor of await page.locator(".work-card a, .image-preview").all()) {
      await page.keyboard.press("Tab");
      await expect(anchor).toBeFocused();
      await expect(anchor).toHaveCSS("outline-style", "solid");
      await expect(anchor).toBeInViewport();
    }
  });
}

test("a missing image leaves alt text, reserved geometry and project links", async ({ page }) => {
  await page.route("**/assets/fuji-*.webp", (route) => route.fulfill({ status: 404, body: "" }));
  await page.goto("/en/works/");
  const image = page.locator("main img").first();
  await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.complete)).toBe(true);
  expect(await image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBe(0);
  await expect(image).toHaveAttribute("alt", getContent("en").worksPage.website.alt);
  expect((await image.boundingBox())!.height).toBeGreaterThan(100);
  await expect(page.locator(".work-card a").first()).toBeVisible();
});

test("a 2x mobile display selects a bounded higher-resolution source", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto(`${baseURL}/en/works/`);
  const image = page.locator("main img").first();
  await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)).toBe(true);
  expect(await image.evaluate((node: HTMLImageElement) => node.currentSrc)).toMatch(/-(800|1200)-[\w-]+\.webp$/);
  await context.close();
});
