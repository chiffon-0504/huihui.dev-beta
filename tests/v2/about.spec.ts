import { expect, test, type Page } from "@playwright/test";
import { getContent, localeHref, supportedLocales } from "../../v2/src/locales";

async function expectReflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator(".about-section, .about-topics, main h1, main h2, main p, main dt, main dd, main a, .footer-contact").evaluateAll((nodes) =>
    nodes.filter((node) => node.scrollWidth > node.clientWidth ||
      (getComputedStyle(node).overflowY !== "visible" && node.scrollHeight > node.clientHeight))
      .map((node) => node.textContent))).toEqual([]);
}

for (const locale of supportedLocales) {
  const copy = getContent(locale);
  const about = copy.aboutPage;
  const route = localeHref(locale, "", "about");

  for (const width of [1440, 390]) {
    test(`${locale} About content, shared shell and themes at ${width}px`, async ({ page, baseURL }, testInfo) => {
      const errors: string[] = [];
      const external: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      page.on("requestfailed", (request) => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
      page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
      page.on("request", (request) => { if (new URL(request.url()).origin !== new URL(baseURL!).origin) external.push(request.url()); });
      await page.setViewportSize({ width, height: 900 });
      await page.goto(route);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page).toHaveTitle(`${about.title} | huihui.dev`);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", about.description);
      await expect(page.getByRole("banner")).toBeVisible();
      await expect(page.getByRole("main")).toHaveCount(1);
      await expect(page.locator("main h1")).toHaveText(about.title);
      await expect(page.locator(".about-lead")).toHaveText(about.introduction);
      await expect(page.locator("main h2")).toHaveText([about.backgroundTitle, about.practiceTitle, about.interestsTitle, about.musicTitle]);
      await expect(page.locator(".about-story p")).toHaveText([...about.background]);
      for (const [id, items] of [["practice", about.practice], ["interests", about.interests], ["music", about.music]] as const) {
        await expect(page.locator(`#${id} dt`)).toHaveText(items.map((item) => item.title));
        await expect(page.locator(`#${id} dd`)).toHaveText(items.map((item) => item.description));
      }
      const nav = page.getByRole("navigation", { name: copy.navigation });
      await expect(nav.getByRole("link", { name: copy.aboutLabel, exact: true })).toHaveAttribute("href", route);
      await expect(nav.getByRole("link", { name: copy.aboutLabel, exact: true })).toHaveAttribute("aria-current", "page");
      await expect(nav.getByRole("link", { name: copy.worksLabel, exact: true })).toHaveAttribute("href", localeHref(locale, "#works"));
      await expect(nav.getByRole("link", { name: "huihui.dev", exact: true })).toHaveAttribute("href", localeHref(locale));
      await expect(page.locator(".footer-contact span")).toHaveText(copy.contact.label);
      await expect(page.getByRole("contentinfo").getByRole("link")).toHaveText(copy.contact.email);
      await expect(page.getByRole("contentinfo").getByRole("link")).toHaveAttribute("href", `mailto:${copy.contact.email}`);
      await expect(page.locator('a[href*="/contact/"], form, iframe')).toHaveCount(0);
      for (const [preference, label] of [["light", copy.themeLight], ["dark", copy.themeDark], ["auto", copy.themeAuto]] as const) {
        await page.locator(".theme-trigger").click();
        await page.getByRole("menuitemradio", { name: label, exact: true }).click();
        await expect(page.locator("html")).toHaveAttribute("data-theme", preference === "auto" ? /^(light|dark)$/ : preference);
        expect(await page.evaluate(() => localStorage.getItem("huihui-v2-theme"))).toBe(preference);
        await expectReflow(page);
        if (testInfo.project.name === "chromium" && preference !== "auto") {
          await page.screenshot({ path: testInfo.outputPath(`about-${locale}-${width}-${preference}.png`), fullPage: true });
        }
      }
      await page.getByRole("link", { name: about.worksCta, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${localeHref(locale)}#works$`));
      await expect(page.locator("#works h2")).toBeInViewport();
      await page.locator("#about a").click();
      await expect(page).toHaveURL(new RegExp(`${route}$`));
      await expect(page.locator("main.about")).toBeVisible();
      expect(errors).toEqual([]);
      expect(external).toEqual([]);
    });
  }

  test(`${locale} About switches to every localized page and preserves sections`, async ({ page }) => {
    for (const hash of ["", "#interests"]) {
      for (const target of supportedLocales) {
        await page.goto(`${route}${hash}`);
        await page.locator(".language-trigger").click();
        const option = page.locator(".language-switcher").getByRole("link", { name: getContent(target).language.label, exact: true });
        const destination = localeHref(target, hash, "about");
        await expect(option).toHaveAttribute("href", destination);
        await option.click();
        await expect(page).toHaveURL(new RegExp(`${destination}$`));
        await expect(page.locator("html")).toHaveAttribute("lang", target);
        await expect(page.locator("main h1")).toHaveText(getContent(target).aboutPage.title);
        await expect(page.locator(".language-switcher")).not.toHaveAttribute("open");
      }
    }
    await page.goto(`${route}index.html`);
    await expect(page.locator("main h1")).toHaveText(about.title);
    await page.locator(".language-trigger").click();
    await expect(page.locator(`.language-option[hreflang="${locale}"]`)).toHaveAttribute("href", route);
  });

  test(`${locale} About native keyboard focus, skip link and shared menus`, async ({ page }) => {
    await page.goto(route);
    await page.keyboard.press("Tab");
    await expect(page.locator(".skip-link")).toBeFocused();
    await expect(page.locator(".skip-link")).toBeInViewport();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("main")).toBeFocused();
    await page.goto(route);
    for (const selector of [".skip-link", ".brand", ".navbar-primary li:first-child a", ".navbar-primary li:last-child a", ".navbar-actions > a", ".language-trigger"]) {
      await page.keyboard.press("Tab");
      const control = page.locator(selector);
      await expect(control).toBeFocused();
      await expect(control).toBeInViewport();
      await expect(control).toHaveCSS("outline-style", "solid");
    }
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    await expect(page.locator(".language-option").first()).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator(".language-trigger")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.locator(".theme-trigger")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menuitemradio").first()).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: about.worksCta, exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.locator(".footer-contact a")).toBeFocused();
    await expect(page.locator(".footer-contact a")).toHaveCSS("outline-style", "solid");
  });

  test(`${locale} About reflows at 320px with 200% text and reduced motion`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(route);
    await page.locator("html").evaluate((node) => { node.style.fontSize = "200%"; });
    await expectReflow(page);
    for (const selector of [".language-trigger", ".theme-trigger"]) {
      await page.locator(selector).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.keyboard.press("Escape");
      await expect(page.locator(selector)).toBeFocused();
    }
    // Continue from the theme trigger using real keyboard modality. A scripted
    // focus after pointer-opened menus need not match :focus-visible in Firefox.
    for (const control of await page.locator("main a, .footer-contact a").all()) {
      await page.keyboard.press("Tab");
      await expect(control).toBeFocused();
      await expect(control).toBeInViewport();
      await expect(control).toHaveCSS("outline-style", "solid");
    }
    expect(await page.locator("main, main *").evaluateAll((nodes) => nodes.every((node) => {
      const css = getComputedStyle(node);
      return css.animationName === "none" && css.transitionDuration === "0s";
    }))).toBe(true);
  });
}
