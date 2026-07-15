import { expect, test } from "@playwright/test";

async function stubHomepageApis(page) {
  await page.route("https://api.huihui.dev/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    let body;

    if (pathname === "/api/tech-news") {
      body = {
        ok: true,
        techNews: [
          {
            category: "AI",
            title: "Reduced motion fixture",
            source: "Fixture",
            timeAgo: "",
            tag: "Test",
            link: "https://example.test/reduced-motion",
          },
        ],
      };
    } else if (pathname === "/api/github-updates") {
      body = {
        ok: true,
        updatedText: "now",
        link: "https://example.test/project",
      };
    } else {
      body = { ok: false };
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

async function loadHomepage(page, reducedMotion) {
  await page.emulateMedia({ reducedMotion });
  await stubHomepageApis(page);
  const response = await page.goto("/", { waitUntil: "load" });

  expect(response?.status()).toBe(200);
  await expect(page.locator("#techNewsCards > .tech-news-card")).toHaveCount(1);
}

async function getMotionStyle(locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      animationName: style.animationName,
      opacity: style.opacity,
      transform: style.transform,
      transitionDuration: style.transitionDuration,
    };
  });
}

function expectZeroDuration(value) {
  const durations = value.split(",").map((duration) => Number.parseFloat(duration));
  expect(durations.every((duration) => duration === 0)).toBe(true);
}

test("reduced motion disables homepage entrance and card movement", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loadHomepage(page, "reduce");

  for (const selector of [
    ".home-hero.fade-in",
    ".website-version-section.fade-in",
    ".tech-news-section.fade-in",
  ]) {
    expect(await getMotionStyle(page.locator(selector)), selector).toMatchObject({
      animationName: "none",
      opacity: "1",
      transform: "none",
    });
  }

  for (const selector of [
    ".home-hero .project-update-card",
    ".website-version-section .apod-card",
    ".tech-news-section .tech-news-card",
  ]) {
    const card = page.locator(selector);
    expectZeroDuration((await getMotionStyle(card)).transitionDuration);
    await card.hover();
    expect((await getMotionStyle(card)).transform, selector).toBe("none");
  }

  const heroButton = page.locator(".home-hero .hero-actions .hero-btn").first();
  await heroButton.hover();
  expect((await getMotionStyle(heroButton)).transform).toBe("none");
});

test("reduced motion preserves the desktop sidebar glass and position", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loadHomepage(page, "reduce");

  const sidebarStyle = await page.locator(".sidebar").evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backdropFilter: style.backdropFilter || style.webkitBackdropFilter || "",
      position: style.position,
      transform: style.transform,
    };
  });

  expect(sidebarStyle).toMatchObject({
    position: "fixed",
    transform: "none",
  });
  expect(sidebarStyle.backdropFilter).toMatch(/blur\(/);
});

test("reduced motion disables mobile drawer slide and fade transitions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loadHomepage(page, "reduce");

  const sidebar = page.locator(".sidebar");
  const overlay = page.locator(".sidebar-overlay");
  const toggle = page.locator("#menuToggle");

  expectZeroDuration((await getMotionStyle(sidebar)).transitionDuration);
  expectZeroDuration((await getMotionStyle(overlay)).transitionDuration);

  await toggle.click();
  await expect(sidebar).toHaveClass(/\bopen\b/);
  await expect(overlay).toHaveClass(/\bactive\b/);
  await expect(overlay).toHaveCSS("opacity", "1");
  expect((await getMotionStyle(sidebar)).transform).toMatch(
    /^(?:none|matrix\(1, 0, 0, 1, 0, 0\))$/,
  );
  expect(
    await overlay.evaluate((element) => {
      const style = getComputedStyle(element);
      return style.backdropFilter || style.webkitBackdropFilter || "";
    }),
  ).toMatch(/blur\(/);

  await page.keyboard.press("Escape");
  await expect(sidebar).not.toHaveClass(/\bopen\b/);
  await expect(overlay).not.toHaveClass(/\bactive\b/);
  await expect(overlay).toHaveCSS("opacity", "0");
});

test("normal motion keeps homepage hover and mobile drawer transitions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loadHomepage(page, "no-preference");

  expect((await getMotionStyle(page.locator(".home-hero.fade-in"))).animationName).toBe(
    "fadeInUp",
  );

  const card = page.locator(".home-hero .project-update-card");
  expect(Number.parseFloat((await getMotionStyle(card)).transitionDuration)).toBeGreaterThan(
    0,
  );
  await card.hover();
  await page.waitForTimeout(300);
  expect((await getMotionStyle(card)).transform).not.toBe("none");

  const heroButton = page.locator(".home-hero .hero-actions .hero-btn").first();
  await heroButton.hover();
  await page.waitForTimeout(250);
  expect((await getMotionStyle(heroButton)).transform).not.toBe("none");

  await page.setViewportSize({ width: 390, height: 844 });
  const sidebarDuration = (await getMotionStyle(page.locator(".sidebar")))
    .transitionDuration;
  const overlayDuration = (await getMotionStyle(page.locator(".sidebar-overlay")))
    .transitionDuration;

  expect(Number.parseFloat(sidebarDuration)).toBeGreaterThan(0);
  expect(Number.parseFloat(overlayDuration)).toBeGreaterThan(0);
});
