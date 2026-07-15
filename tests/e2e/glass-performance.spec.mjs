import { expect, test } from "@playwright/test";

const expectedInitialWrites = [
  { name: "--glass-tint-opacity", value: "0.58" },
  { name: "--glass-tint-hover-opacity", value: "0.64" },
];

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
            title: "Glass performance fixture",
            source: "Fixture",
            timeAgo: "",
            tag: "Test",
            link: "https://example.test/glass",
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

async function getBackdropFilter(locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return style.backdropFilter || style.webkitBackdropFilter || "";
  });
}

test("glass variables are written exactly once during initialization", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const setProperty = CSSStyleDeclaration.prototype.setProperty;

    window.__glassPropertyWrites = [];
    CSSStyleDeclaration.prototype.setProperty = function setTrackedProperty(
      name,
      value,
      priority,
    ) {
      if (
        name === "--glass-tint-opacity" ||
        name === "--glass-tint-hover-opacity"
      ) {
        window.__glassPropertyWrites.push({ name, value });
      }

      return setProperty.call(this, name, value, priority);
    };
  });
  await stubHomepageApis(page);
  await page.goto("/", { waitUntil: "load" });

  await expect
    .poll(() => page.evaluate(() => window.__glassPropertyWrites))
    .toEqual(expectedInitialWrites);

  await page.evaluate(async () => {
    for (let index = 0; index < 3; index += 1) {
      window.dispatchEvent(new Event("scroll"));
      window.dispatchEvent(new Event("resize"));
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  });

  expect(await page.evaluate(() => window.__glassPropertyWrites)).toEqual(
    expectedInitialWrites,
  );
  expect(
    await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return {
        opacity: style.getPropertyValue("--glass-tint-opacity").trim(),
        hoverOpacity: style
          .getPropertyValue("--glass-tint-hover-opacity")
          .trim(),
      };
    }),
  ).toEqual({ opacity: "0.58", hoverOpacity: "0.64" });
});

test("desktop Liquid Glass surfaces keep effective backdrop filters", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await stubHomepageApis(page);
  await page.goto("/", { waitUntil: "load" });
  await expect(page.locator("#techNewsCards > .tech-news-card")).toHaveCount(1);

  for (const selector of [
    ".sidebar",
    ".home-hero",
    ".home-hero .project-update-card",
    ".website-version-section .apod-card",
    ".tech-news-section .tech-news-card",
  ]) {
    expect(await getBackdropFilter(page.locator(selector)), selector).toMatch(
      /blur\(/,
    );
  }
});

test("the active mobile drawer overlay keeps its backdrop filter", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stubHomepageApis(page);
  await page.goto("/", { waitUntil: "load" });

  const overlay = page.locator(".sidebar-overlay");
  await page.locator("#menuToggle").click();
  await expect(overlay).toHaveClass(/\bactive\b/);
  expect(await getBackdropFilter(overlay)).toMatch(/blur\(/);
});
