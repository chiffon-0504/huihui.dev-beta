import { expect, test } from "@playwright/test";
import { getContent, localeHref, supportedLocales } from "../../v2/src/locales";
import { postCategories, postHref, posts } from "../../v2/src/posts/registry";

for (const locale of supportedLocales) {
  const route = localeHref(locale, "", "posts");
  const copy = getContent(locale).postsPage;
  for (const width of [1440, 390]) {
    test(`${locale} Posts content, categories, themes and reflow at ${width}px`, async ({ page, baseURL }, testInfo) => {
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
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(copy.title);
      await expect(page.locator(".posts-lead")).toHaveText(copy.introduction);
      await expect(page.locator("main h2")).toHaveText(postCategories.map((category) => copy.categories[category]));
      await expect(page.getByRole("article")).toHaveCount(posts.length);
      await expect(page.locator("main h3")).toHaveCount(posts.length);
      await expect(page.locator("main h4, main a a, main a button")).toHaveCount(0);
      for (const category of postCategories) {
        const group = page.getByRole("region", { name: copy.categories[category], exact: true });
        await expect(group).toBeVisible();
        for (const post of posts.filter((post) => post.category === category)) {
          const text = copy.articles[post.id];
          const article = group.getByRole("article", { name: text.title, exact: true });
          await expect(article.locator(".post-excerpt")).toHaveText(text.excerpt);
          await expect(article.locator("time")).toHaveAttribute("datetime", post.published);
          await expect(article.locator("time")).toHaveText(new Intl.DateTimeFormat(locale, {
            year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
          }).format(new Date(`${post.published}T00:00:00Z`)));
          const anchor = article.getByRole("link", { name: text.title, exact: true });
          await expect(anchor).toHaveAttribute("href", postHref(locale, post.id));
          await anchor.click();
          await expect(page).toHaveURL(new URL(postHref(locale, post.id), baseURL!).href);
          await expect(article).toBeInViewport();
        }
      }
      expect(await page.locator("[id]").evaluateAll((nodes) => nodes.map((node) => node.id).filter((id, i, all) => all.indexOf(id) !== i))).toEqual([]);
      await expect(page.locator(".navbar-primary a[aria-current=page]")).toHaveAttribute("href", route);
      for (const theme of ["light", "dark", "auto"] as const) {
        await page.locator(".theme-trigger").click();
        const label = getContent(locale)[theme === "auto" ? "themeAuto" : theme === "light" ? "themeLight" : "themeDark"];
        await page.getByRole("menuitemradio", { name: label, exact: true }).click();
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme === "auto" ? /^(light|dark)$/ : theme);
        if (theme !== "auto" && testInfo.project.name === "chromium") {
          await page.screenshot({ path: testInfo.outputPath(`posts-${locale}-${width}-${theme}.png`), fullPage: true });
        }
      }
      await page.setViewportSize({ width: 320, height: 700 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.locator("html").evaluate((node) => { node.style.fontSize = "200%"; });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await page.locator("main p, main h1, main h2, main h3, main time").evaluateAll((nodes) => nodes.filter((node) => node.scrollWidth > node.clientWidth).map((node) => node.textContent))).toEqual([]);
      expect(await page.locator("main *").evaluateAll((nodes) => nodes.every((node) => getComputedStyle(node).animationName === "none"))).toBe(true);
      expect(errors).toEqual([]);
    });
  }

  test(`${locale} Posts language links retain category and article fragments; all navbar entries reach Posts`, async ({ page }) => {
    for (const hash of ["", "#rhythm-games", `#${posts[3].id}`]) {
      for (const target of supportedLocales) {
        await page.goto(`${route}${hash}`);
        await page.locator(".language-switcher summary").click();
        const destination = localeHref(target, hash, "posts");
        await page.locator(`.language-switcher a[hreflang="${target}"]`).click();
        await expect(page).toHaveURL(new RegExp(`${destination}$`));
        await expect(page.locator("main h1")).toHaveText(getContent(target).postsPage.title);
        if (hash) await expect(page.locator(hash)).toBeInViewport();
      }
    }
    for (const origin of ["about", "works"] as const) {
      await page.goto(localeHref(locale, "", origin));
      await page.locator(".navbar-primary").getByRole("link", { name: getContent(locale).postsLabel, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${route}$`));
      await expect(page.locator("main.posts")).toBeVisible();
    }
  });

  test(`${locale} Posts supports native skip, article tab order and visible keyboard focus`, async ({ page }) => {
    await page.goto(route);
    await page.keyboard.press("Tab");
    await expect(page.locator(".skip-link")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("main")).toBeFocused();
    for (const anchor of await page.locator(".post-card a").all()) {
      await page.keyboard.press("Tab");
      await expect(anchor).toBeFocused();
      await expect(anchor).toHaveCSS("outline-style", "solid");
      await expect(anchor).toBeInViewport();
    }
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`${postHref(locale, posts[6].id)}$`));
  });
}
