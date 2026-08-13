import { expect, test } from "@playwright/test";

const desktopViewport = { width: 1440, height: 900 };
const mobileViewport = { width: 390, height: 844 };

async function stubExternalDependencies(page, handleTechNews = null) {
  await page.route("https://challenges.cloudflare.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: "",
    }),
  );

  await page.route("https://api.huihui.dev/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;

    if (pathname === "/api/tech-news" && handleTechNews) {
      await handleTechNews(route);
      return;
    }

    const body = pathname === "/api/steam-library"
      ? { ok: true, games: [] }
      : pathname === "/api/tech-news"
        ? { ok: true, techNews: [] }
        : null;

    await route.fulfill({
      status: body ? 200 : 500,
      contentType: "application/json",
      body: JSON.stringify(body || { ok: false }),
    });
  });
}

function getStyle(locator, properties) {
  return locator.evaluate((element, names) => {
    const style = getComputedStyle(element);
    return Object.fromEntries(names.map((name) => [name, style[name]]));
  }, properties);
}

const navBaseStyle = {
  display: "flex",
  position: "relative",
  padding: "12px 18px",
  borderRadius: "14px",
  fontWeight: "500",
  transitionProperty: "color, background, border-color, box-shadow, transform",
  transitionDuration: "0.2s, 0.2s, 0.2s, 0.2s, 0.2s",
};

const navBaseProperties = Object.keys(navBaseStyle);
const mobileGridStyle = {
  display: "grid",
  gridTemplateColumns: "350px",
  width: "350px",
  columnGap: "18px",
  rowGap: "18px",
};

test("About banner hours keep their winning computed styles", async ({ page }) => {
  await page.setViewportSize(desktopViewport);
  await stubExternalDependencies(page);
  await page.goto("/en/about/", { waitUntil: "load" });

  const bannerHours = page.locator("#galgameBannerHours");
  await expect(bannerHours).toBeVisible();
  expect(
    await getStyle(bannerHours, [
      "display",
      "paddingLeft",
      "color",
      "fontWeight",
    ]),
  ).toEqual({
    display: "block",
    paddingLeft: "2px",
    color: "rgba(45, 58, 78, 0.72)",
    fontWeight: "500",
  });
});

test("sidebar navigation keeps default, hover, focus-visible, and active styles", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize(desktopViewport);
  await stubExternalDependencies(page);
  await page.goto("/en/about/", { waitUntil: "load" });

  const defaultLink = page.locator('.sidebar-top nav a[data-nav="works"]');
  const activeLink = page.locator('.sidebar-top nav a[data-nav="about"]');

  await expect(defaultLink).toBeVisible();
  await expect(activeLink).toHaveAttribute("aria-current", "page");
  expect(await getStyle(defaultLink, navBaseProperties)).toEqual(navBaseStyle);
  expect(
    await getStyle(defaultLink, ["color", "borderColor", "transform"]),
  ).toEqual({
    color: "rgba(8, 30, 58, 0.72)",
    borderColor: "rgba(230, 251, 255, 0.2)",
    transform: "none",
  });

  await defaultLink.hover();
  await expect
    .poll(() => defaultLink.evaluate((element) => getComputedStyle(element).transform))
    .toBe("matrix(1, 0, 0, 1, 4, 0)");
  const hoverStyle = await getStyle(defaultLink, [
    "color",
    "borderColor",
    "transform",
    "backgroundImage",
  ]);
  expect(hoverStyle).toMatchObject({
    color: "rgba(0, 75, 165, 0.92)",
    borderColor: "rgba(222, 250, 255, 0.34)",
    transform: "matrix(1, 0, 0, 1, 4, 0)",
  });
  expect(hoverStyle.backgroundImage).toContain("radial-gradient");
  expect(hoverStyle.backgroundImage).toContain("linear-gradient");

  await page.mouse.move(1400, 850);
  await expect
    .poll(() => defaultLink.evaluate((element) => getComputedStyle(element).transform))
    .toBe("none");
  await page.keyboard.press("Tab");
  await defaultLink.focus();
  await expect
    .poll(() => defaultLink.evaluate((element) => element.matches(":hover")))
    .toBe(false);
  expect(await defaultLink.evaluate((element) => element.matches(":focus-visible"))).toBe(
    true,
  );
  expect(await getStyle(defaultLink, navBaseProperties)).toEqual(navBaseStyle);
  const focusStyle = await getStyle(defaultLink, [
    "color",
    "borderColor",
    "transform",
    "outlineStyle",
    "outlineWidth",
  ]);
  expect(focusStyle).toMatchObject({
    color: "rgba(8, 30, 58, 0.72)",
    borderColor: "rgba(230, 251, 255, 0.2)",
    transform: "none",
  });
  expect(focusStyle.outlineStyle).not.toBe("none");
  expect(Number.parseFloat(focusStyle.outlineWidth)).toBeGreaterThan(0);

  expect(await getStyle(activeLink, navBaseProperties)).toEqual(navBaseStyle);
  expect(
    await getStyle(activeLink, ["color", "borderColor", "transform"]),
  ).toEqual({
    color: "rgba(0, 48, 128, 0.98)",
    borderColor: "rgba(238, 254, 255, 0.72)",
    transform: "matrix(1, 0, 0, 1, 4, 0)",
  });
});

test("mobile drawer keeps equivalent closed and open transforms", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize(mobileViewport);
  await stubExternalDependencies(page);
  await page.goto("/", { waitUntil: "load" });

  const sidebar = page.locator("#site-sidebar");
  const toggle = page.locator("#menuToggle");

  await expect(sidebar).toHaveAttribute("aria-hidden", "true");
  expect(
    await getStyle(sidebar, [
      "display",
      "position",
      "width",
      "padding",
      "transitionProperty",
      "transitionDuration",
      "transform",
    ]),
  ).toEqual({
    display: "flex",
    position: "fixed",
    width: "260px",
    padding: "72px 18px 22px",
    transitionProperty: "transform",
    transitionDuration: "0.3s",
    transform: "matrix(1, 0, 0, 1, -260, 0)",
  });

  await toggle.click();
  await expect(sidebar).toHaveClass(/\bopen\b/);
  await expect(sidebar).not.toHaveAttribute("aria-hidden");
  await expect
    .poll(() => sidebar.evaluate((element) => getComputedStyle(element).transform))
    .toBe("matrix(1, 0, 0, 1, 0, 0)");
});

test("mobile Tech News loading and success states keep one grid column", async ({
  page,
}) => {
  let releaseTechNews;
  const techNewsGate = new Promise((resolve) => {
    releaseTechNews = resolve;
  });

  await page.setViewportSize(mobileViewport);
  await stubExternalDependencies(page, async (route) => {
    await techNewsGate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        techNews: [
          {
            category: "CSS",
            title: "Cascade regression fixture",
            source: "Fixture",
            timeAgo: "",
            tag: "Test",
            link: "https://example.test/css-cascade",
          },
        ],
      }),
    });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const grid = page.locator("#techNewsCards");
  await expect(grid.locator(".tech-news-loading")).toBeVisible();
  expect(await getStyle(grid, Object.keys(mobileGridStyle))).toEqual(mobileGridStyle);

  releaseTechNews();
  await expect(grid.locator(":scope > .tech-news-card")).toHaveCount(1);
  expect(await getStyle(grid, Object.keys(mobileGridStyle))).toEqual(mobileGridStyle);
});

test("mobile Tech News error state keeps one grid column", async ({ page }) => {
  await page.setViewportSize(mobileViewport);
  await stubExternalDependencies(page, (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ ok: false }),
    }),
  );
  await page.goto("/", { waitUntil: "load" });

  const grid = page.locator("#techNewsCards");
  await expect(grid.locator(".tech-news-error")).toBeVisible();
  await expect(grid.locator(":scope > *")).toHaveCount(1);
  expect(await getStyle(grid, Object.keys(mobileGridStyle))).toEqual(mobileGridStyle);
});
