import { expect, test } from "@playwright/test";

async function stubHomepageApis(page) {
  await page.route("https://api.huihui.dev/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const body =
      pathname === "/api/tech-news"
        ? {
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
          }
        : pathname === "/api/infrastructure-status"
          ? { ok: true, providers: [] }
        : null;

    await route.fulfill({
      status: body ? 200 : 500,
      contentType: "application/json",
      body: JSON.stringify(body || { ok: false }),
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

async function stubAboutDependencies(page) {
  await page.route("https://api.huihui.dev/api/steam-library", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, games: [] }),
    }),
  );
  await page.route("https://challenges.cloudflare.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: "",
    }),
  );
}

async function loadPageWithMotion(page, route, reducedMotion) {
  await page.emulateMedia({ reducedMotion });
  const response = await page.goto(route, { waitUntil: "load" });

  expect(response?.status()).toBe(200);
}

async function addTierItemFixture(page) {
  await page.locator("#poolContent").evaluate((pool) => {
    const item = document.createElement("img");
    item.className = "tier-item";
    item.alt = "Motion fixture";
    item.src =
      "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
    pool.append(item);
  });

  return page.locator('.tier-item[alt="Motion fixture"]');
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
    ".tech-news-section:not(.infrastructure-status-section).fade-in",
    ".infrastructure-status-section.fade-in",
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
    "#techNewsCards .tech-news-card",
    '.infrastructure-status-card[data-provider="cloudflare"]',
    '.infrastructure-status-card[data-provider="github"]',
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

test("reduced motion disables the remaining About code and image movement", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await stubAboutDependencies(page);
  await loadPageWithMotion(page, "/en/about/", "reduce");

  const code = page.locator("#profileCode");
  const gutter = page.locator(".custom-line-numbers");
  const banner = page.locator(".galgame-banner");

  expectZeroDuration((await getMotionStyle(code)).transitionDuration);
  expectZeroDuration((await getMotionStyle(gutter)).transitionDuration);
  expectZeroDuration((await getMotionStyle(banner)).transitionDuration);

  await banner.hover();
  expect((await getMotionStyle(banner)).transform).toBe("none");
  expect(await banner.evaluate((element) => getComputedStyle(element).filter)).not.toBe(
    "none",
  );
});

test("reduced motion keeps contact feedback while disabling its transition", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("https://challenges.cloudflare.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: "",
    }),
  );
  await loadPageWithMotion(page, "/en/contact/", "reduce");

  const button = page.locator(".contact-form button");
  const restingBackground = await button.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );

  expectZeroDuration((await getMotionStyle(button)).transitionDuration);
  await button.hover();
  expect((await getMotionStyle(button)).transform).toBe("none");
  expect(await button.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(
    restingBackground,
  );
});

test("reduced motion disables Tier Maker control and item translation only", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loadPageWithMotion(page, "/en/tools/tier-maker/", "reduce");

  const saveButton = page.locator("#saveBtn");
  const item = await addTierItemFixture(page);
  const restingBackground = await saveButton.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );

  for (const element of [saveButton, item]) {
    expectZeroDuration((await getMotionStyle(element)).transitionDuration);
    await element.hover();
    expect((await getMotionStyle(element)).transform).toBe("none");
  }

  await saveButton.hover();
  expect(
    await saveButton.evaluate((element) => getComputedStyle(element).backgroundColor),
  ).not.toBe(restingBackground);
});

test("normal motion keeps the existing About, contact, and Tier Maker interactions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await stubAboutDependencies(page);
  await loadPageWithMotion(page, "/en/about/", "no-preference");

  const code = page.locator("#profileCode");
  const banner = page.locator(".galgame-banner");
  expect(Number.parseFloat((await getMotionStyle(code)).transitionDuration)).toBeGreaterThan(
    0,
  );
  expect(Number.parseFloat((await getMotionStyle(banner)).transitionDuration)).toBeGreaterThan(
    0,
  );
  await banner.hover();
  await page.waitForTimeout(250);
  expect((await getMotionStyle(banner)).transform).not.toBe("none");

  await loadPageWithMotion(page, "/en/contact/", "no-preference");
  expect(
    Number.parseFloat(
      (await getMotionStyle(page.locator(".contact-form button"))).transitionDuration,
    ),
  ).toBeGreaterThan(0);

  await loadPageWithMotion(page, "/en/tools/tier-maker/", "no-preference");
  const saveButton = page.locator("#saveBtn");
  const item = await addTierItemFixture(page);
  for (const element of [saveButton, item]) {
    expect(Number.parseFloat((await getMotionStyle(element)).transitionDuration)).toBeGreaterThan(
      0,
    );
    await element.hover();
    await page.waitForTimeout(250);
    expect((await getMotionStyle(element)).transform).not.toBe("none");
  }
});
