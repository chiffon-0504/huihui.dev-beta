import { expect, test } from "@playwright/test";

async function loadAbout(page) {
  await page.goto("/about/");
  await expect(page.locator("#aboutPage h1")).toBeVisible();
  await expect(page.locator(".os-scrollbar-vertical")).toBeVisible();
}

async function getRootScrollState(page) {
  return page.evaluate(() => ({
    activeElement: document.activeElement?.tagName,
    bodyScrollTop: document.body.scrollTop,
    documentElementScrollTop: document.documentElement.scrollTop,
    scrollingElement: document.scrollingElement?.tagName,
    windowScrollY: window.scrollY,
  }));
}

async function getRootScrollBehavior(page) {
  return page.evaluate(() => ({
    computed: getComputedStyle(document.documentElement).scrollBehavior,
    inline: document.documentElement.style.scrollBehavior,
  }));
}

async function waitForScrollHistoryCommit(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}

async function runAndWaitForScrollEnd(page, action) {
  const supportsScrollEnd = await page.evaluate(() => "onscrollend" in window);
  if (!supportsScrollEnd) {
    throw new Error("This test requires window scrollend support");
  }

  await page.evaluate(() => {
    window.__rootOverlayScrollEnd = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        window.removeEventListener("scrollend", handleScrollEnd);
        reject(new Error("Timed out after 2s waiting for window scrollend"));
      }, 2000);
      const handleScrollEnd = () => {
        clearTimeout(timeoutId);
        resolve();
      };
      window.addEventListener("scrollend", handleScrollEnd, { once: true });
    });
  });
  await action();
  await page.evaluate(async () => {
    await window.__rootOverlayScrollEnd;
    delete window.__rootOverlayScrollEnd;
  });
}

test("body mode keeps the document root as the native page scroll owner", async ({
  page,
}) => {
  await loadAbout(page);

  const architecture = await page.evaluate(() => {
    const bodyRect = document.body.getBoundingClientRect();
    const main = document.querySelector(".main");
    const verticalScrollbar = document.querySelector(
      ".os-scrollbar-vertical",
    );
    const scrollbars = [...document.querySelectorAll(".os-scrollbar")];

    return {
      bodyRight: bodyRect.right,
      bodyWidth: bodyRect.width,
      gutterWidth: window.innerWidth - document.documentElement.clientWidth,
      horizontalOverflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      innerWidth: window.innerWidth,
      mainOverflowY: getComputedStyle(main).overflowY,
      scrollbarCount: scrollbars.length,
      scrollbarParents: scrollbars.map(
        (scrollbar) => scrollbar.parentElement?.tagName,
      ),
      scrollingElement: document.scrollingElement?.tagName,
      verticalPosition: getComputedStyle(verticalScrollbar).position,
    };
  });

  expect(architecture).toEqual({
    bodyRight: architecture.innerWidth,
    bodyWidth: architecture.innerWidth,
    gutterWidth: 0,
    horizontalOverflow: 0,
    innerWidth: architecture.innerWidth,
    mainOverflowY: "visible",
    scrollbarCount: 2,
    scrollbarParents: ["BODY", "BODY"],
    scrollingElement: "HTML",
    verticalPosition: "fixed",
  });

  await page.evaluate(() => window.scrollTo({ top: 900, behavior: "instant" }));
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBe(900);
  expect(await getRootScrollState(page)).toEqual({
    activeElement: "BODY",
    bodyScrollTop: 0,
    documentElementScrollTop: 900,
    scrollingElement: "HTML",
    windowScrollY: 900,
  });
});

test("initial BODY focus retains native document keyboard scrolling", async ({
  page,
}) => {
  const cases = [
    { key: "ArrowDown", start: 0, direction: "down" },
    { key: "ArrowUp", start: 1200, direction: "up" },
    { key: "PageDown", start: 0, direction: "down" },
    { key: "PageUp", start: 1200, direction: "up" },
    { key: "Home", start: 1200, expected: 0 },
    { key: "End", start: 0, direction: "down" },
    { key: "Space", start: 0, direction: "down" },
    { key: "Shift+Space", start: 1200, direction: "up" },
  ];

  for (const keyCase of cases) {
    await loadAbout(page);
    await page.evaluate(
      (top) => window.scrollTo({ top, behavior: "instant" }),
      keyCase.start,
    );

    const before = await getRootScrollState(page);
    expect(before.activeElement, keyCase.key).toBe("BODY");
    expect(before.scrollingElement, keyCase.key).toBe("HTML");
    expect(before.windowScrollY, keyCase.key).toBe(keyCase.start);

    await page.keyboard.press(keyCase.key);

    if (keyCase.expected !== undefined) {
      await expect
        .poll(() => page.evaluate(() => window.scrollY))
        .toBe(keyCase.expected);
    } else if (keyCase.direction === "down") {
      await expect
        .poll(() => page.evaluate(() => window.scrollY))
        .toBeGreaterThan(before.windowScrollY);
    } else {
      await expect
        .poll(() => page.evaluate(() => window.scrollY))
        .toBeLessThan(before.windowScrollY);
    }

    const after = await getRootScrollState(page);
    expect(after.activeElement, keyCase.key).toBe("BODY");
    expect(after.documentElementScrollTop, keyCase.key).toBe(
      after.windowScrollY,
    );
    expect(after.bodyScrollTop, keyCase.key).toBe(0);
  }
});

test("hash, Back, Forward, reload, and cross-page restoration stay native", async ({
  browserName,
  page,
}) => {
  await loadAbout(page);
  await page.evaluate(() => window.scrollTo({ top: 1200, behavior: "instant" }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(1200);
  await waitForScrollHistoryCommit(page);
  await page.locator(".skip-link").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  await expect.poll(() => new URL(page.url()).hash).toBe("#main-content");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

  await page.goBack();
  await expect.poll(() => new URL(page.url()).hash).toBe("");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(1200);

  await page.goForward();
  await expect.poll(() => new URL(page.url()).hash).toBe("#main-content");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

  await page.goto("/");
  await expect(page.locator(".os-scrollbar-vertical")).toBeVisible();
  const aboutLink = page.locator('a[data-nav="about"]');
  if (browserName === "webkit") {
    // WebKit locator actionability can adjust the page for this fixed link.
    // Complete that work before establishing the restoration position.
    await aboutLink.click({ trial: true });
  }
  await page.evaluate(() => window.scrollTo({ top: 160, behavior: "instant" }));
  // Confirm the exact restoration precondition before leaving the page.
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(160);
  await waitForScrollHistoryCommit(page);
  await aboutLink.click();
  await expect(page).toHaveURL(/\/about\/$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(160);
  await expect.poll(() => getRootScrollBehavior(page)).toEqual({
    computed: "smooth",
    inline: "",
  });

  await page.goto("/about/");
  await expect(page.locator("#aboutPage h1")).toBeVisible();
  await expect(page.locator(".os-scrollbar-vertical")).toBeVisible();
  await page.evaluate(() => window.scrollTo({ top: 900, behavior: "instant" }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(900);
  // Let Chromium commit the new position to session history before reloading.
  if (browserName === "chromium") {
    await waitForScrollHistoryCommit(page);
  }
  await page.reload();
  await expect(page.locator("#aboutPage h1")).toBeVisible();
  await expect(page.locator(".os-scrollbar-vertical")).toBeVisible();
  // Bundled Firefox and WebKit reset reload scroll to 0 on their unchanged
  // native baselines. Chromium preserves 900, so keep each behavior exact.
  const expectedReloadScroll = browserName === "chromium" ? 900 : 0;
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBe(expectedReloadScroll);
  await expect.poll(() => getRootScrollBehavior(page)).toEqual({
    computed: "smooth",
    inline: "",
  });

  await page.goto("/about/#profileCode");
  await expect(page.locator("#profileCode")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0);
});

test("window scroll listeners and the About reveal remain coupled to the document", async ({
  page,
}) => {
  await loadAbout(page);
  const wrapper = page.locator(".code-scroll-reveal").first();
  await expect(wrapper).toBeVisible();
  await page.evaluate(() => {
    window.__rootScrollEventCount = 0;
    window.addEventListener(
      "scroll",
      () => {
        window.__rootScrollEventCount += 1;
      },
      { passive: true },
    );
  });

  const before = await wrapper.evaluate((element) =>
    getComputedStyle(element)
      .getPropertyValue("--code-reveal-progress")
      .trim(),
  );
  await page.evaluate(() => window.scrollTo({ top: 1200, behavior: "instant" }));
  await expect
    .poll(() => page.evaluate(() => window.__rootScrollEventCount))
    .toBeGreaterThan(0);
  await expect
    .poll(() =>
      wrapper.evaluate((element) =>
        getComputedStyle(element)
          .getPropertyValue("--code-reveal-progress")
          .trim(),
      ),
    )
    .not.toBe(before);
});

test("wheel, handle drag, and track click update window.scrollY", async ({
  page,
}) => {
  await loadAbout(page);

  await page.mouse.wheel(0, 240);
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0);

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  const handle = page.locator(
    ".os-scrollbar-vertical .os-scrollbar-handle",
  );
  const handleBox = await handle.boundingBox();
  expect(handleBox).not.toBeNull();
  await page.mouse.move(
    handleBox.x + handleBox.width / 2,
    handleBox.y + handleBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    handleBox.x + handleBox.width / 2,
    handleBox.y + handleBox.height / 2 + 180,
    { steps: 6 },
  );
  await page.mouse.up();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0);

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  const trackBox = await page
    .locator(".os-scrollbar-vertical .os-scrollbar-track")
    .boundingBox();
  expect(trackBox).not.toBeNull();
  await page.mouse.click(
    trackBox.x + trackBox.width / 2,
    trackBox.y + trackBox.height * 0.75,
  );
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0);
});

test("forced colors keeps the custom root scrollbar visible and interactive", async ({
  page,
}) => {
  await page.emulateMedia({ forcedColors: "active" });
  await loadAbout(page);

  const forcedColorsState = await page.evaluate(() => {
    const verticalScrollbar = document.querySelector(
      ".os-scrollbar-vertical",
    );
    const track = verticalScrollbar.querySelector(".os-scrollbar-track");
    const handle = verticalScrollbar.querySelector(".os-scrollbar-handle");
    const scrollbarStyle = getComputedStyle(verticalScrollbar);

    return {
      forcedColorsActive: matchMedia("(forced-colors: active)").matches,
      gutterWidth: window.innerWidth - document.documentElement.clientWidth,
      handleBackground: getComputedStyle(handle).backgroundColor,
      handleColors: [
        "--os-handle-bg",
        "--os-handle-bg-hover",
        "--os-handle-bg-active",
      ].map((property) => scrollbarStyle.getPropertyValue(property).trim()),
      horizontalOverflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      scrollingElement: document.scrollingElement?.tagName,
      trackBackground: getComputedStyle(track).backgroundColor,
      trackColors: [
        "--os-track-bg",
        "--os-track-bg-hover",
        "--os-track-bg-active",
      ].map((property) => scrollbarStyle.getPropertyValue(property).trim()),
      verticalPosition: scrollbarStyle.position,
      verticalScrollbarCount: document.querySelectorAll(
        ".os-scrollbar-vertical",
      ).length,
    };
  });

  expect(forcedColorsState).toEqual({
    forcedColorsActive: true,
    gutterWidth: 0,
    handleBackground: forcedColorsState.handleBackground,
    handleColors: ["CanvasText", "CanvasText", "CanvasText"],
    horizontalOverflow: 0,
    scrollingElement: "HTML",
    trackBackground: forcedColorsState.trackBackground,
    trackColors: ["Canvas", "Canvas", "Canvas"],
    verticalPosition: "fixed",
    verticalScrollbarCount: 1,
  });
  expect(forcedColorsState.handleBackground).not.toBe(
    forcedColorsState.trackBackground,
  );

  await runAndWaitForScrollEnd(page, () => page.mouse.wheel(0, 240));
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0);
  let rootScrollState = await getRootScrollState(page);
  expect(rootScrollState.bodyScrollTop).toBe(0);
  expect(rootScrollState.documentElementScrollTop).toBe(
    rootScrollState.windowScrollY,
  );
  expect(rootScrollState.scrollingElement).toBe("HTML");

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  expect((await getRootScrollState(page)).activeElement).toBe("BODY");
  await runAndWaitForScrollEnd(page, () => page.keyboard.press("PageDown"));
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0);
  rootScrollState = await getRootScrollState(page);
  expect(rootScrollState.bodyScrollTop).toBe(0);
  expect(rootScrollState.documentElementScrollTop).toBe(
    rootScrollState.windowScrollY,
  );
  expect(rootScrollState.scrollingElement).toBe("HTML");

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  const handle = page.locator(
    ".os-scrollbar-vertical .os-scrollbar-handle",
  );
  const handleBox = await handle.boundingBox();
  expect(handleBox).not.toBeNull();
  await page.mouse.move(
    handleBox.x + handleBox.width / 2,
    handleBox.y + handleBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    handleBox.x + handleBox.width / 2,
    handleBox.y + handleBox.height / 2 + 180,
    { steps: 6 },
  );
  await page.mouse.up();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0);
});

test("reduced motion disables animated track clicks without disabling native wheel scrolling", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await loadAbout(page);

  const clickScroll = await page.evaluate(() =>
    window.OverlayScrollbarsGlobal
      .OverlayScrollbars(document.body)
      .options().scrollbars.clickScroll,
  );
  expect(clickScroll).toBe(false);

  const trackBox = await page
    .locator(".os-scrollbar-vertical .os-scrollbar-track")
    .boundingBox();
  expect(trackBox).not.toBeNull();
  await page.mouse.click(
    trackBox.x + trackBox.width / 2,
    trackBox.y + trackBox.height * 0.75,
  );
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  await page.mouse.wheel(0, 240);
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0);
});

test("click scrolling follows reduced motion changes on the existing instance", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await loadAbout(page);

  const initialClickScroll = await page.evaluate(() => {
    const instance =
      window.OverlayScrollbarsGlobal.OverlayScrollbars(document.body);
    window.__rootOverlayScrollbarInstance = instance;
    window.__rootOverlayScrollbarClickScrollChanges = [];
    instance.on("updated", (_, { changedOptions }) => {
      const clickScroll = changedOptions.scrollbars?.clickScroll;
      if (typeof clickScroll === "boolean") {
        window.__rootOverlayScrollbarClickScrollChanges.push(clickScroll);
      }
    });

    initHuihuiSite();
    initHuihuiSite();

    return instance.options().scrollbars.clickScroll;
  });
  expect(initialClickScroll).toBe(true);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const instance =
          window.OverlayScrollbarsGlobal.OverlayScrollbars(document.body);
        return {
          clickScroll: instance.options().scrollbars.clickScroll,
          changes: window.__rootOverlayScrollbarClickScrollChanges,
          sameInstance: instance === window.__rootOverlayScrollbarInstance,
        };
      }),
    )
    .toEqual({
      clickScroll: false,
      changes: [false],
      sameInstance: true,
    });

  const trackBox = await page
    .locator(".os-scrollbar-vertical .os-scrollbar-track")
    .boundingBox();
  expect(trackBox).not.toBeNull();
  await page.mouse.click(
    trackBox.x + trackBox.width / 2,
    trackBox.y + trackBox.height * 0.75,
  );
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  await page.mouse.wheel(0, 240);
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0);
  const reducedMotionScrollState = await getRootScrollState(page);
  expect(reducedMotionScrollState.bodyScrollTop).toBe(0);
  expect(reducedMotionScrollState.documentElementScrollTop).toBe(
    reducedMotionScrollState.windowScrollY,
  );
  expect(reducedMotionScrollState.scrollingElement).toBe("HTML");

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const instance =
          window.OverlayScrollbarsGlobal.OverlayScrollbars(document.body);
        return {
          clickScroll: instance.options().scrollbars.clickScroll,
          changes: window.__rootOverlayScrollbarClickScrollChanges,
          sameInstance: instance === window.__rootOverlayScrollbarInstance,
        };
      }),
    )
    .toEqual({
      clickScroll: true,
      changes: [false, true],
      sameInstance: true,
    });

  await page.mouse.click(
    trackBox.x + trackBox.width / 2,
    trackBox.y + trackBox.height * 0.75,
  );
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0);
});

test("native controls keep their keyboard behavior without moving the page", async ({
  page,
}) => {
  await page.goto("/tools/tier-maker/");
  await expect(page.locator(".os-scrollbar-vertical")).toBeVisible();

  const rows = page.locator(".tier-row");
  const rowCount = await rows.count();
  await page.locator("#addTierBtn").focus();
  await page.keyboard.press("Space");
  await expect(rows).toHaveCount(rowCount + 1);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  const slider = page.locator("#sizeSlider");
  const sliderValue = Number(await slider.inputValue());
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveValue(String(sliderValue + 1));
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  await page.locator(".tier-label").first().focus();
  await page.keyboard.press("ArrowLeft");
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  await page.goto("/contact/");
  await expect(page.locator(".os-scrollbar-vertical")).toBeVisible();
  await page.locator('textarea[name="message"]').focus();
  await page.keyboard.press("ArrowDown");
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test("repeated site initialization reuses one script and one instance", async ({
  page,
}) => {
  let vendorRequestCount = 0;

  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname ===
      "/vendor/overlayscrollbars/overlayscrollbars.browser.es6.min.js"
    ) {
      vendorRequestCount += 1;
    }
  });

  await loadAbout(page);
  await page.evaluate(() => {
    initHuihuiSite();
    initHuihuiSite();
  });

  await expect(
    page.locator('script[data-root-overlay-scrollbar="true"]'),
  ).toHaveCount(1);
  await expect(page.locator(".os-scrollbar")).toHaveCount(2);
  expect(vendorRequestCount).toBe(1);
});

test("a failed library request leaves a native, keyboard-scrollable document", async ({
  page,
}) => {
  await page.route(
    "**/vendor/overlayscrollbars/overlayscrollbars.browser.es6.min.js",
    (route) => route.abort(),
  );
  await page.goto("/about/");
  await expect(page.locator("#aboutPage h1")).toBeVisible();
  await expect(page.locator(".os-scrollbar")).toHaveCount(0);

  expect(await getRootScrollState(page)).toEqual({
    activeElement: "BODY",
    bodyScrollTop: 0,
    documentElementScrollTop: 0,
    scrollingElement: "HTML",
    windowScrollY: 0,
  });

  await page.keyboard.press("PageDown");
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0);
});

test("JavaScript disabled leaves the native document scrollbar available", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();

  try {
    await page.setViewportSize({ width: 390, height: 400 });
    await page.goto("/contact/");
    await expect(page.locator("#contact-form")).toBeVisible();
    await expect(page.locator(".os-scrollbar")).toHaveCount(0);

    const nativeState = await page.evaluate(() => ({
      bodyScrollTop: document.body.scrollTop,
      canScroll: document.documentElement.scrollHeight > window.innerHeight,
      scrollingElement: document.scrollingElement?.tagName,
      windowScrollY: window.scrollY,
    }));
    expect(nativeState).toEqual({
      bodyScrollTop: 0,
      canScroll: true,
      scrollingElement: "HTML",
      windowScrollY: 0,
    });

    await page.keyboard.press("PageDown");
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(0);
  } finally {
    await context.close();
  }
});

test("390x844 keeps one root scroller and the fixed mobile drawer", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".os-scrollbar-vertical")).toBeVisible();
  const toggle = page.locator("#menuToggle");
  const sidebar = page.locator("#site-sidebar");
  await expect(toggle).toBeVisible();

  const mobileArchitecture = await page.evaluate(() => ({
    bodyWidth: document.body.getBoundingClientRect().width,
    gutterWidth: window.innerWidth - document.documentElement.clientWidth,
    horizontalOverflow:
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
    mainOverflowY: getComputedStyle(document.querySelector(".main")).overflowY,
    scrollingElement: document.scrollingElement?.tagName,
    sidebarPosition: getComputedStyle(document.querySelector(".sidebar"))
      .position,
  }));
  expect(mobileArchitecture).toEqual({
    bodyWidth: 390,
    gutterWidth: 0,
    horizontalOverflow: 0,
    mainOverflowY: "visible",
    scrollingElement: "HTML",
    sidebarPosition: "fixed",
  });

  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(sidebar).toHaveClass(/\bopen\b/);
  expect(await page.evaluate(() => document.scrollingElement?.tagName)).toBe(
    "HTML",
  );
});
