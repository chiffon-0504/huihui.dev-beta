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

const unsupportedBackdropCondition =
  "@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {";
const fallbackColors = {
  sidebar: "rgb(217, 237, 247)",
  sidebarBottom: "rgb(237, 247, 251)",
  hero: "rgb(223, 239, 248)",
  card: "rgb(237, 247, 252)",
  cardHover: "rgb(244, 251, 254)",
  heroButton: "rgb(229, 244, 251)",
  heroButtonHover: "rgb(238, 250, 255)",
  overlay: "rgba(4, 18, 38, 0.72)",
};
const localizedHomeRoutes = [
  { locale: "ZH", route: "/" },
  { locale: "EN", route: "/en/" },
  { locale: "JA", route: "/ja/" },
];
const boundaryViewports = [
  { label: "900", width: 900, height: 844 },
  { label: "901", width: 901, height: 844 },
  { label: "1200", width: 1200, height: 900 },
  { label: "1201", width: 1201, height: 900 },
];
const motionModes = [
  { label: "normal motion", value: "no-preference" },
  { label: "reduced motion", value: "reduce" },
];
const populatedTechNews = Array.from({ length: 3 }, (_, index) => ({
  category: "CSS",
  title: "Fallback fixture " + (index + 1),
  source: "Fixture",
  timeAgo: "",
  tag: "Test",
  link: "https://example.test/glass-fallback/" + (index + 1),
}));

function transformForUnsupportedBackdropFilter(css) {
  const fallbackCount = css.split(unsupportedBackdropCondition).length - 1;
  if (fallbackCount !== 2) {
    throw new Error(
      "Expected the broad and final fallback blocks, found " + fallbackCount,
    );
  }

  let transformed = css.replaceAll(
    unsupportedBackdropCondition,
    "@supports (display: block) {",
  );
  const standardCount = (
    transformed.match(/^\s*backdrop-filter\s*:/gm) || []
  ).length;
  const prefixedCount = (
    transformed.match(/^\s*-webkit-backdrop-filter\s*:/gm) || []
  ).length;

  if (standardCount === 0 || prefixedCount === 0) {
    throw new Error("Expected both standard and prefixed backdrop declarations");
  }

  transformed = transformed
    .replace(
      /^(\s*)backdrop-filter\s*:/gm,
      "$1--simulated-backdrop-filter:",
    )
    .replace(
      /^(\s*)-webkit-backdrop-filter\s*:/gm,
      "$1--simulated-webkit-backdrop-filter:",
    );

  if (/^\s*(?:-webkit-)?backdrop-filter\s*:/m.test(transformed)) {
    throw new Error("A backdrop-filter declaration escaped neutralization");
  }

  return transformed;
}

async function installUnsupportedBackdropSimulation(page) {
  await page.route("**/style.css", async (route) => {
    const response = await route.fetch();
    const headers = { ...response.headers() };
    delete headers["content-length"];

    await route.fulfill({
      status: response.status(),
      headers: {
        ...headers,
        "content-type": "text/css; charset=utf-8",
      },
      body: transformForUnsupportedBackdropFilter(await response.text()),
    });
  });
}

function createTechNewsController() {
  let state = "populated";
  let gate = Promise.resolve();
  let releaseGate = () => {};

  return {
    get state() {
      return state;
    },
    beginLoading() {
      state = "loading";
      gate = new Promise((resolve) => {
        releaseGate = resolve;
      });
    },
    async waitWhileLoading() {
      if (state === "loading") await gate;
    },
    setState(nextState) {
      state = nextState;
      releaseGate();
    },
  };
}

async function stubGlassDependencies(page, controller) {
  await page.route("https://cdn.jsdelivr.net/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType:
        route.request().resourceType() === "stylesheet"
          ? "text/css"
          : "application/javascript",
      body: "",
    });
  });
  await page.route("https://challenges.cloudflare.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: "",
    }),
  );
  await page.route("https://api.huihui.dev/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;

    if (pathname === "/api/tech-news") {
      await controller.waitWhileLoading();
      const isError = controller.state === "error";
      await route.fulfill({
        status: isError ? 500 : 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: !isError,
          techNews: isError ? [] : populatedTechNews,
        }),
      });
      return;
    }

    const body =
      pathname === "/api/github-updates"
        ? {
            ok: true,
            updatedText: "now",
            link: "https://example.test/project",
          }
        : pathname === "/api/apod"
          ? {
              imageUrl: "/images/0001_hp.webp",
              originalUrl: "https://example.test/apod",
              title: "Fallback APOD fixture",
              explanation: "Deterministic fallback material fixture.",
              date: "2026-07-27",
              mediaType: "image",
            }
          : { ok: true };

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

async function setUpSimulatedPage(page, controller) {
  await installUnsupportedBackdropSimulation(page);
  await stubGlassDependencies(page, controller);
}

async function finishAnimations(page) {
  await page.evaluate(() => {
    document.getAnimations().forEach((animation) => {
      try {
        animation.finish();
      } catch {
        // Infinite or idle animations do not affect the material assertions.
      }
    });
  });
}

async function expectBackgroundColor(locator, expected) {
  await expect
    .poll(() =>
      locator.evaluate((element) => getComputedStyle(element).backgroundColor),
    )
    .toBe(expected);
}

async function getFilterState(locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      standard:
        style.getPropertyValue("backdrop-filter") ||
        style.backdropFilter ||
        "none",
      prefixed:
        style.getPropertyValue("-webkit-backdrop-filter") ||
        style.webkitBackdropFilter ||
        "none",
      simulatedStandard: style
        .getPropertyValue("--simulated-backdrop-filter")
        .trim(),
      simulatedPrefixed: style
        .getPropertyValue("--simulated-webkit-backdrop-filter")
        .trim(),
    };
  });
}

async function expectBackdropFiltersNeutralized(locator, expectedOwnerValue) {
  const state = await getFilterState(locator);
  expect(["", "none"], "standard backdrop-filter").toContain(state.standard);
  expect(["", "none"], "prefixed backdrop-filter").toContain(state.prefixed);
  expect(state.simulatedStandard).toBe(expectedOwnerValue);
  expect(state.simulatedPrefixed).toBe(expectedOwnerValue);
}

async function getRootGlassVariables(page) {
  return page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return {
      opacity: style.getPropertyValue("--glass-tint-opacity").trim(),
      hoverOpacity: style
        .getPropertyValue("--glass-tint-hover-opacity")
        .trim(),
    };
  });
}

async function expectFallbackContract(page, viewportWidth) {
  const sidebar = page.locator(".sidebar");
  const sidebarBottom = page.locator(".sidebar-bottom");
  const hero = page.locator(".home-hero");
  const projectCard = page.locator(".home-hero .project-update-card");
  const apodCard = page.locator(".website-version-section .apod-card");
  const techCard = page.locator(".tech-news-section .tech-news-card").first();
  const heroButton = page
    .locator(".home-hero .hero-actions .hero-btn")
    .first();

  await expect(page.locator("#techNewsCards > .tech-news-card")).toHaveCount(3);
  await expectBackgroundColor(sidebar, fallbackColors.sidebar);
  await expectBackgroundColor(sidebarBottom, fallbackColors.sidebarBottom);
  await expectBackgroundColor(hero, fallbackColors.hero);
  await expectBackgroundColor(projectCard, fallbackColors.card);
  await expectBackgroundColor(apodCard, fallbackColors.card);
  await expectBackgroundColor(techCard, fallbackColors.card);
  await expectBackgroundColor(heroButton, fallbackColors.heroButton);

  const expectedSidebarFilter =
    viewportWidth <= 900
      ? "blur(34px) saturate(185%) contrast(1.06)"
      : "blur(34px) saturate(178%) contrast(1.06)";
  for (const [locator, expectedOwnerValue] of [
    [sidebar, expectedSidebarFilter],
    [sidebarBottom, "blur(24px) saturate(168%)"],
    [hero, "blur(28px) saturate(185%) contrast(1.03)"],
    [projectCard, "blur(24px) saturate(178%)"],
    [apodCard, "blur(24px) saturate(178%)"],
    [techCard, "blur(24px) saturate(178%)"],
    [heroButton, "blur(22px) saturate(180%)"],
  ]) {
    await expectBackdropFiltersNeutralized(locator, expectedOwnerValue);
  }

  const overlay = page.locator(".sidebar-overlay");
  if (viewportWidth <= 900) {
    await expectBackgroundColor(overlay, fallbackColors.overlay);
    await expectBackdropFiltersNeutralized(
      overlay,
      "blur(10px) saturate(140%)",
    );
  } else {
    expect(
      await overlay.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      ),
    ).not.toBe(fallbackColors.overlay);
  }

  expect(await getRootGlassVariables(page)).toEqual({
    opacity: "0.58",
    hoverOpacity: "0.64",
  });
}

async function expectGradientLayersRemain(page) {
  const definitions = [
    { selector: ".sidebar", pseudos: ["::before", "::after"] },
    { selector: ".home-hero", pseudos: ["::before", "::after"] },
    {
      selector: ".home-hero .project-update-card",
      pseudos: ["::before", "::after"],
    },
    {
      selector: ".website-version-section .apod-card",
      pseudos: ["::before", "::after"],
    },
    {
      selector: ".tech-news-section .tech-news-card",
      pseudos: ["::before", "::after"],
    },
    {
      selector: ".home-hero .hero-actions .hero-btn",
      pseudos: ["::before"],
    },
  ];

  for (const definition of definitions) {
    const layers = await page.locator(definition.selector).first().evaluate(
      (element, pseudos) => ({
        base: getComputedStyle(element).backgroundImage,
        pseudos: pseudos.map((pseudo) => {
          const style = getComputedStyle(element, pseudo);
          return {
            pseudo,
            content: style.content,
            backgroundImage: style.backgroundImage,
          };
        }),
      }),
      definition.pseudos,
    );

    expect(layers.base, definition.selector).not.toBe("none");
    for (const layer of layers.pseudos) {
      expect(layer.content, definition.selector + layer.pseudo).not.toBe(
        "none",
      );
      expect(
        layer.backgroundImage,
        definition.selector + layer.pseudo,
      ).not.toBe("none");
    }
  }
}

async function expectHoverFallbacks(page) {
  const cards = [
    page.locator(".home-hero .project-update-card"),
    page.locator(".website-version-section .apod-card"),
    page.locator(".tech-news-section .tech-news-card").first(),
  ];

  for (const card of cards) {
    await card.hover();
    await finishAnimations(page);
    await expectBackgroundColor(card, fallbackColors.cardHover);
  }

  const heroButton = page
    .locator(".home-hero .hero-actions .hero-btn")
    .first();
  await heroButton.hover();
  await finishAnimations(page);
  await expectBackgroundColor(heroButton, fallbackColors.heroButtonHover);
  await page.mouse.move(0, 0);
  await finishAnimations(page);
}

async function captureMaterialInvariant(locator, pseudo = null) {
  return locator.evaluate((element, pseudoElement) => {
    const style = getComputedStyle(element, pseudoElement);
    const rect = element.getBoundingClientRect();
    return {
      backgroundImage: style.backgroundImage,
      border: style.border,
      boxShadow: style.boxShadow,
      opacity: style.opacity,
      overflow: style.overflow,
      isolation: style.isolation,
      filter: style.filter,
      transition: style.transition,
      rect: pseudoElement
        ? null
        : {
            width: rect.width,
            height: rect.height,
            offsetLeft: element.offsetLeft,
            offsetTop: element.offsetTop,
          },
    };
  }, pseudo);
}

async function captureUnchangedContract(page) {
  const definitions = [
    { key: "sidebar", selector: ".sidebar", pseudos: ["::before", "::after"] },
    { key: "sidebarBottom", selector: ".sidebar-bottom", pseudos: [] },
    { key: "hero", selector: ".home-hero", pseudos: ["::before", "::after"] },
    {
      key: "projectCard",
      selector: ".home-hero .project-update-card",
      pseudos: ["::before", "::after"],
    },
    {
      key: "apodCard",
      selector: ".website-version-section .apod-card",
      pseudos: ["::before", "::after"],
    },
    {
      key: "techCard",
      selector: ".tech-news-section .tech-news-card",
      pseudos: ["::before", "::after"],
    },
    {
      key: "heroButton",
      selector: ".home-hero .hero-actions .hero-btn",
      pseudos: ["::before"],
    },
  ];
  const result = { base: {}, hover: {} };

  for (const definition of definitions) {
    const locator = page.locator(definition.selector).first();
    result.base[definition.key] = {
      element: await captureMaterialInvariant(locator),
      pseudos: {},
    };
    for (const pseudo of definition.pseudos) {
      result.base[definition.key].pseudos[pseudo] =
        await captureMaterialInvariant(locator, pseudo);
    }
  }

  for (const key of ["projectCard", "apodCard", "techCard", "heroButton"]) {
    const definition = definitions.find((entry) => entry.key === key);
    const locator = page.locator(definition.selector).first();
    await locator.hover();
    await finishAnimations(page);
    result.hover[key] = await captureMaterialInvariant(locator);
  }

  await page.mouse.move(0, 0);
  await finishAnimations(page);
  return result;
}

test("simulated unsupported path is forced inside backdrop-capable Chromium", async ({
  page,
}) => {
  const controller = createTechNewsController();
  await setUpSimulatedPage(page, controller);
  await page.setViewportSize({ width: 1201, height: 900 });
  await page.goto("/", { waitUntil: "load" });

  expect(
    await page.evaluate(
      () =>
        CSS.supports("backdrop-filter", "blur(1px)") ||
        CSS.supports("-webkit-backdrop-filter", "blur(1px)"),
    ),
  ).toBe(true);
  await expectFallbackContract(page, 1201);
  await expectGradientLayersRemain(page);
});

for (const homeRoute of localizedHomeRoutes) {
  test(
    "simulated unsupported " +
      homeRoute.locale +
      " Home covers 900/901 and 1200/1201 in normal and reduced motion",
    async ({ page }) => {
      const controller = createTechNewsController();
      await setUpSimulatedPage(page, controller);

      for (const viewport of boundaryViewports) {
        for (const motion of motionModes) {
          await test.step(
            viewport.label + "px, " + motion.label,
            async () => {
              await page.emulateMedia({ reducedMotion: motion.value });
              await page.setViewportSize(viewport);
              await page.goto(homeRoute.route, { waitUntil: "load" });
              await expectFallbackContract(page, viewport.width);
            },
          );
        }
      }
    },
  );

  test(
    "simulated unsupported " +
      homeRoute.locale +
      " Home covers loading, populated, error, card hover, and button hover",
    async ({ page }) => {
      const controller = createTechNewsController();
      await setUpSimulatedPage(page, controller);
      await page.setViewportSize({ width: 1201, height: 900 });

      for (const motion of motionModes) {
        await test.step(motion.label, async () => {
          await page.emulateMedia({ reducedMotion: motion.value });
          controller.beginLoading();
          await page.goto(homeRoute.route, { waitUntil: "domcontentloaded" });

          await expect(
            page.locator("#techNewsCards .tech-news-loading"),
          ).toBeVisible();
          await expectBackgroundColor(
            page.locator(".sidebar"),
            fallbackColors.sidebar,
          );
          await expectBackgroundColor(
            page.locator(".home-hero"),
            fallbackColors.hero,
          );

          controller.setState("populated");
          await expect(
            page.locator("#techNewsCards > .tech-news-card"),
          ).toHaveCount(3);
          await expectFallbackContract(page, 1201);
          await expectHoverFallbacks(page);

          controller.setState("error");
          await page.reload({ waitUntil: "load" });
          await expect(
            page.locator("#techNewsCards .tech-news-error"),
          ).toBeVisible();
          await expect(page.locator("#techNewsCards > *")).toHaveCount(1);
          await expectBackgroundColor(
            page.locator(".home-hero .project-update-card"),
            fallbackColors.card,
          );
          await expectBackgroundColor(
            page.locator(".website-version-section .apod-card"),
            fallbackColors.card,
          );
          await expectBackgroundColor(
            page.locator(".home-hero .hero-actions .hero-btn").first(),
            fallbackColors.heroButton,
          );
        });
      }
    },
  );

  test(
    "simulated unsupported " +
      homeRoute.locale +
      " mobile drawer covers closed/open overlay, Escape, and focus restoration",
    async ({ page }) => {
      const controller = createTechNewsController();
      await setUpSimulatedPage(page, controller);
      await page.setViewportSize({ width: 390, height: 844 });

      for (const motion of motionModes) {
        await test.step(motion.label, async () => {
          await page.emulateMedia({ reducedMotion: motion.value });
          await page.goto(homeRoute.route, { waitUntil: "load" });

          const sidebar = page.locator(".sidebar");
          const overlay = page.locator(".sidebar-overlay");
          const toggle = page.locator("#menuToggle");

          await expect(sidebar).not.toHaveClass(/\bopen\b/);
          await expect(overlay).not.toHaveClass(/\bactive\b/);
          await expectBackgroundColor(overlay, fallbackColors.overlay);
          await expectBackdropFiltersNeutralized(
            sidebar,
            "blur(34px) saturate(185%) contrast(1.06)",
          );
          await expectBackdropFiltersNeutralized(
            overlay,
            "blur(10px) saturate(140%)",
          );

          await toggle.focus();
          await page.keyboard.press("Enter");
          await expect(sidebar).toHaveClass(/\bopen\b/);
          await expect(overlay).toHaveClass(/\bactive\b/);
          await expect
            .poll(() =>
              overlay.evaluate(
                (element) => getComputedStyle(element).opacity,
              ),
            )
            .toBe("1");
          await expectBackgroundColor(overlay, fallbackColors.overlay);
          await expect
            .poll(() =>
              sidebar.evaluate((element) =>
                element.contains(document.activeElement),
              ),
            )
            .toBe(true);

          await page.keyboard.press("Escape");
          await expect(sidebar).not.toHaveClass(/\bopen\b/);
          await expect(overlay).not.toHaveClass(/\bactive\b/);
          await expect(toggle).toBeFocused();
          await expectBackgroundColor(overlay, fallbackColors.overlay);
          await expectBackgroundColor(sidebar, fallbackColors.sidebar);
        });
      }
    },
  );
}

for (const motion of motionModes) {
  test(
    "simulated unsupported path preserves non-filter material and geometry with " +
      motion.label,
    async ({ page }) => {
      const controller = createTechNewsController();
      await stubGlassDependencies(page, controller);
      await page.emulateMedia({ reducedMotion: motion.value });
      await page.setViewportSize({ width: 1201, height: 900 });
      await page.goto("/en/", { waitUntil: "load" });
      await expect(
        page.locator("#techNewsCards > .tech-news-card"),
      ).toHaveCount(3);
      await finishAnimations(page);
      const supported = await captureUnchangedContract(page);

      await installUnsupportedBackdropSimulation(page);
      await page.reload({ waitUntil: "load" });
      await expect(
        page.locator("#techNewsCards > .tech-news-card"),
      ).toHaveCount(3);
      await finishAnimations(page);
      const simulated = await captureUnchangedContract(page);

      expect(simulated).toEqual(supported);
      await expectFallbackContract(page, 1201);
    },
  );
}

test("supported Chromium keeps audited Liquid Glass filters at all boundaries", async ({
  page,
}) => {
  const controller = createTechNewsController();
  await stubGlassDependencies(page, controller);

  for (const viewport of boundaryViewports) {
    await page.setViewportSize(viewport);
    await page.goto("/", { waitUntil: "load" });
    await expect(page.locator("#techNewsCards > .tech-news-card")).toHaveCount(3);

    expect(await getBackdropFilter(page.locator(".sidebar"))).toBe(
      viewport.width <= 900
        ? "blur(34px) saturate(1.85) contrast(1.06)"
        : "blur(34px) saturate(1.78) contrast(1.06)",
    );
    expect(await getBackdropFilter(page.locator(".home-hero"))).toBe(
      "blur(28px) saturate(1.85) contrast(1.03)",
    );
    expect(await getBackdropFilter(page.locator(".sidebar-bottom"))).toBe(
      "blur(24px) saturate(1.68)",
    );
    expect(
      await getBackdropFilter(
        page.locator(".home-hero .hero-actions .hero-btn").first(),
      ),
    ).toBe("blur(22px) saturate(1.8)");

    for (const selector of [
      ".home-hero .project-update-card",
      ".website-version-section .apod-card",
      ".tech-news-section .tech-news-card",
    ]) {
      expect(await getBackdropFilter(page.locator(selector).first())).toBe(
        "blur(24px) saturate(1.78)",
      );
    }

    if (viewport.width <= 900) {
      expect(await getBackdropFilter(page.locator(".sidebar-overlay"))).toBe(
        "blur(10px) saturate(1.4)",
      );
    }
  }
});
