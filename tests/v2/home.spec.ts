import { expect, test, type Page } from "@playwright/test";
import { getContent, localeHref, supportedLocales } from "../../v2/src/locales";

async function expectReflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // Catch intrinsic grid overflow into the gutter even when the document fits.
  const clipped = await page.locator(".home-topic-list, main h1, main h2, main h3, main p, main a").evaluateAll((nodes) =>
    // Glyph ink can extend past a line box without clipping when overflow is visible.
    nodes.filter((node) => node.scrollWidth > node.clientWidth ||
      (getComputedStyle(node).overflowY !== "visible" && node.scrollHeight > node.clientHeight))
      .map((node) => node.textContent));
  expect(clipped).toEqual([]);
}

for (const locale of supportedLocales) {
  const copy = getContent(locale);
  for (const width of [1440, 390]) {
    test(`${locale} Home hierarchy, links and themes at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      const errors: string[] = [];
      const externalRequests: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      page.on("requestfailed", (request) => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
      page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
      page.on("request", (request) => {
        if (new URL(request.url()).origin !== new URL(testInfo.project.use.baseURL!).origin) externalRequests.push(request.url());
      });
      await page.goto(localeHref(locale));
      await expect(page.locator("main h1")).toHaveCount(1);
      await expect(page.locator("main h2")).toHaveText([
        copy.worksHeading, copy.focusLabel, copy.principlesLabel, copy.skillsLabel, copy.interestsLabel,
      ]);
      await expect(page.locator("main h3")).toHaveText([
        copy.websiteTitle, copy.toolTitle,
        ...[...copy.focus, ...copy.principles, ...copy.skills, ...copy.interests].map((topic) => topic.title),
      ]);
      await expect(page.locator("main h4, main h5, main h6")).toHaveCount(0);
      await expect(page.getByRole("region", { name: copy.title, exact: true })).toBeVisible();
      for (const name of [copy.worksHeading, copy.focusLabel, copy.principlesLabel, copy.skillsLabel, copy.interestsLabel]) {
        await expect(page.getByRole("region", { name, exact: true })).toBeVisible();
      }
      await expect(page.locator(".eyebrow, .project-category, .hero-visual")).toHaveCount(0);
      expect(await page.locator("main h1, main h2, main h3, main p, main a, main span").evaluateAll((nodes) =>
        nodes.every((node) => parseFloat(getComputedStyle(node).fontSize) >= 16 &&
          getComputedStyle(node).textTransform !== "uppercase"))).toBe(true);
      const destination = `https://huihui.dev${localeHref(locale)}`;
      await expect(page.locator("#about a")).toHaveAttribute("href", `${destination}about/`);
      await expect(page.locator("#works .section-heading a")).toHaveAttribute("href", `${destination}works/`);
      await expect(page.locator(".home-project a").first()).toHaveAttribute("href", "https://github.com/chiffon-0504/huihui.dev-beta");
      await expect(page.locator(".home-project a").last()).toHaveAttribute("href", `${destination}tools/tier-maker/`);
      // All navigation uses real anchors, without simulated buttons or dead routes.
      await expect(page.locator("main button, main [role=button]")).toHaveCount(0);
      for (const id of ["works", "about"]) {
        const action = page.locator(`.hero-actions a[href='#${id}']`);
        await action.focus();
        expect(await action.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe("solid");
        await expect(action).toHaveCSS("border-radius", "9999px");
        await page.keyboard.press("Enter");
        await expect(page.locator(`#${id}`)).toBeFocused();
        await expect(page.locator(`#${id} h2`)).toBeInViewport();
      }
      // Tab continues from the About anchor to its useful full-profile link.
      await page.keyboard.press("Tab");
      await expect(page.locator("#about a")).toBeFocused();
      for (const theme of ["light", "dark"] as const) {
        await page.locator(".theme-trigger").click();
        await page.getByRole("menuitemradio", { name: theme === "light" ? copy.themeLight : copy.themeDark, exact: true }).click();
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        const buttonColor = theme === "light" ? "rgb(0, 111, 222)" : "rgb(143, 211, 255)";
        await expect(page.locator(".button--primary")).toHaveCSS("background-color", buttonColor);
        await expect(page.locator(".button--primary")).toHaveCSS("color", theme === "light" ? "rgb(250, 250, 249)" : "rgb(0, 0, 0)");
        await expect(page.locator("main a.button")).toHaveCount(6);
        for (const action of await page.locator("main a").all()) {
          await expect(action).toHaveCSS("border-radius", "9999px");
          await expect(action).toHaveCSS("text-decoration-line", "none");
          await expect(action).toHaveCSS("border-color", buttonColor);
          await action.hover();
          await expect(action).toHaveCSS("text-decoration-line", "none");
          await expect(action).toHaveCSS("border-radius", "9999px");
        }
        await page.locator(".theme-trigger").focus();
        await expectReflow(page);
        const cards = await page.locator(".home-project").evaluateAll((nodes) => nodes.map((node) => {
          const rect = node.getBoundingClientRect();
          return { x: rect.x, y: rect.y, bottom: rect.bottom };
        }));
        expect(cards).toHaveLength(2);
        if (width > 640) expect(cards[0]!.y).toBe(cards[1]!.y);
        else expect(cards[1]!.y).toBeGreaterThan(cards[0]!.bottom);
        if (testInfo.project.name === "chromium") {
          await page.screenshot({ path: testInfo.outputPath(`home-${locale}-${width}-${theme}.png`), fullPage: true });
        }
      }
      expect(errors).toEqual([]);
      expect(externalRequests).toEqual([]);
    });
  }

  test(`${locale} Home remains readable at 320px and 200% text without motion`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(localeHref(locale));
    await page.locator("html").evaluate((node) => { node.style.fontSize = "200%"; });
    await expectReflow(page);
    for (const action of await page.locator("main a").all()) {
      await action.focus();
      await expect(action).toBeInViewport();
      expect(await action.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe("solid");
      await expect(action).toHaveCSS("border-radius", "9999px");
    }
    expect(await page.locator("main, main *").evaluateAll((nodes) => nodes.every((node) => {
      const style = getComputedStyle(node);
      return style.animationName === "none" && style.transitionDuration === "0s";
    }))).toBe(true);
  });
}

test.describe("shared pill controls follow the effective Auto theme", () => {
  test.use({ timezoneId: "Asia/Taipei" });
  for (const locale of supportedLocales) {
    for (const width of [1440, 320]) {
      test(`${locale} Auto and manual button palettes at ${width}px`, async ({ page }) => {
        const copy = getContent(locale);
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ reducedMotion: "reduce" });
        for (const [hour, effective, system] of [[12, "light", "dark"], [23, "dark", "light"]] as const) {
          // Auto is solar-based. An opposing OS scheme must not override it.
          await page.emulateMedia({ colorScheme: system });
          await page.clock.setFixedTime(new Date(`2026-09-14T${hour}:00:00+08:00`));
          await page.goto(localeHref(locale));
          await page.locator(".theme-trigger").click();
          await page.getByRole("menuitemradio", { name: copy.themeAuto, exact: true }).click();
          await expect(page.locator("html")).toHaveAttribute("data-theme", effective);
          // Closed menu options can retain pointer hover at the last clicked row.
          // Compare rendered controls; open-menu geometry is checked below.
          const appearance = () => page.locator(".button:visible").evaluateAll((nodes) => nodes.map((node) => {
            const css = getComputedStyle(node);
            return { color: css.color, background: css.backgroundColor, border: css.borderColor, radius: css.borderRadius };
          }));
          const auto = await appearance();
          await page.locator(".theme-trigger").click();
          await page.getByRole("menuitemradio", { name: effective === "light" ? copy.themeLight : copy.themeDark, exact: true }).click();
          expect(await appearance()).toEqual(auto);
          await expect(page.locator(".button--primary")).toHaveCSS("background-color", effective === "light" ? "rgb(0, 111, 222)" : "rgb(143, 211, 255)");
          for (const selector of [".theme-trigger", ".language-trigger"]) {
            await page.locator(selector).click();
            for (const control of await page.locator(".button:visible").all()) {
              await expect(control).toHaveCSS("border-radius", "9999px");
              await expect(control).toHaveCSS("text-decoration-line", "none");
              expect(await control.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
            }
            await page.keyboard.press("Escape");
            await expect(page.locator(selector)).toBeFocused();
          }
          await expectReflow(page);
        }
      });
    }
  }
});
