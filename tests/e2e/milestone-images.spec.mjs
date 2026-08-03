import { expect, test } from "@playwright/test";

const localOrigin = "http://127.0.0.1:4173";
const milestoneImages = [
  {
    id: "course-mode-phase-10-score",
    path: "/images/3011_p.webp",
    width: 2560,
    height: 1600,
  },
  {
    id: "course-mode-phase-10-banner-select",
    path: "/images/3012_p.webp",
    width: 2560,
    height: 1600,
  },
  {
    id: "grievous-lady-score",
    path: "/images/3008_p.webp",
    width: 2560,
    height: 1600,
  },
  {
    id: "tempestissimo-score",
    path: "/images/3009_p.webp",
    width: 2560,
    height: 1600,
  },
  {
    id: "lament-rain-score",
    path: "/images/3010_p.webp",
    width: 2560,
    height: 1600,
  },
  {
    id: "fracture-ray-score",
    path: "/images/3007_p.webp",
    width: 2560,
    height: 1600,
  },
  {
    id: "aether-crest-astral-score",
    path: "/images/3006_p.webp",
    width: 2560,
    height: 1600,
  },
  {
    id: "cyaegha-score",
    path: "/images/3002_p.webp",
    width: 2560,
    height: 1600,
  },
];
const viewportCases = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];
const deepImage = milestoneImages.at(-1);

function localMilestoneImagePath(url) {
  const parsedUrl = new URL(url);

  return parsedUrl.origin === localOrigin &&
    milestoneImages.some((image) => image.path === parsedUrl.pathname)
    ? parsedUrl.pathname
    : null;
}

async function settleLazyLoading(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}

for (const viewport of viewportCases) {
  test(`Milestone images preserve geometry and load on demand at ${viewport.name}`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
    });
    const page = await context.newPage();
    const networkSession = await context.newCDPSession(page);
    const requestedImages = new Set();
    const releasedImages = new Set();
    const pendingReleases = new Map();
    const consoleErrors = [];
    const pageErrors = [];
    const missingLocalResources = [];
    const externalRequests = [];

    await networkSession.send("Network.enable");
    await networkSession.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 20,
      downloadThroughput: 1_250_000,
      uploadThroughput: 625_000,
      connectionType: "wifi",
    });

    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("request", (request) => {
      const url = new URL(request.url());

      if (url.origin !== localOrigin) externalRequests.push(request.url());
    });
    page.on("response", (response) => {
      const url = new URL(response.url());

      if (url.origin === localOrigin && response.status() === 404) {
        missingLocalResources.push(url.pathname);
      }
    });

    await page.route("**/images/*_p.webp", async (route) => {
      const imagePath = localMilestoneImagePath(route.request().url());

      if (!imagePath || releasedImages.has(imagePath)) {
        await route.continue();
        return;
      }

      requestedImages.add(imagePath);
      await new Promise((resolve) => pendingReleases.set(imagePath, resolve));
      releasedImages.add(imagePath);
      pendingReleases.delete(imagePath);
      await route.continue();
    });

    const releaseImage = (imagePath) => {
      const release = pendingReleases.get(imagePath);

      expect(release, `${imagePath} should have a gated request`).toBeDefined();
      release();
    };

    try {
      const response = await page.goto("/milestones/", {
        waitUntil: "domcontentloaded",
      });
      const imageLocator = page.locator("#postsList img.zoomable");

      await settleLazyLoading(page);

      expect(response?.status()).toBe(200);
      await expect(imageLocator).toHaveCount(milestoneImages.length);

      const initialState = await imageLocator.evaluateAll((images) =>
        images.map((image) => {
          const rect = image.getBoundingClientRect();

          return {
            path: new URL(image.src).pathname,
            width: image.getAttribute("width"),
            height: image.getAttribute("height"),
            loading: image.getAttribute("loading"),
            dataImageId: image.dataset.imageId,
            naturalWidth: image.naturalWidth,
            naturalHeight: image.naturalHeight,
            renderedWidth: rect.width,
            renderedHeight: rect.height,
          };
        }),
      );

      for (const [index, image] of milestoneImages.entries()) {
        const state = initialState[index];

        expect(state.path).toBe(image.path);
        expect(state.width).toBe(String(image.width));
        expect(state.height).toBe(String(image.height));
        expect(state.loading).toBe("lazy");
        expect(state.dataImageId).toBe(image.id);
        expect(state.naturalWidth).toBe(0);
        expect(state.naturalHeight).toBe(0);
        expect(state.renderedWidth).toBeGreaterThan(0);
        expect(state.renderedHeight).toBeGreaterThan(0);
        expect(state.renderedWidth / state.renderedHeight).toBeCloseTo(
          image.width / image.height,
          5,
        );
      }

      const initialScrollHeight = await page.evaluate(
        () => document.documentElement.scrollHeight,
      );
      const initialRequestedImages = [...requestedImages].sort();
      const deepImageLocator = page.locator(
        `img.zoomable[src$="${deepImage.path}"]`,
      );
      const deepImageTop = await deepImageLocator.evaluate(
        (image) => image.getBoundingClientRect().top,
      );

      expect(deepImageTop).toBeGreaterThan(viewport.height * 2);
      expect(requestedImages.has(deepImage.path)).toBe(false);

      await deepImageLocator.scrollIntoViewIfNeeded();
      await expect
        .poll(() => requestedImages.has(deepImage.path))
        .toBe(true);
      releaseImage(deepImage.path);
      await expect
        .poll(() =>
          deepImageLocator.evaluate((image) => ({
            complete: image.complete,
            naturalWidth: image.naturalWidth,
            naturalHeight: image.naturalHeight,
          })),
        )
        .toEqual({ complete: true, naturalWidth: 2560, naturalHeight: 1600 });

      for (const image of milestoneImages.slice(0, -1)) {
        const locator = page.locator(`img.zoomable[src$="${image.path}"]`);

        await locator.scrollIntoViewIfNeeded();
        await expect.poll(() => requestedImages.has(image.path)).toBe(true);
        releaseImage(image.path);
        await expect
          .poll(() =>
            locator.evaluate((element) => ({
              complete: element.complete,
              naturalWidth: element.naturalWidth,
              naturalHeight: element.naturalHeight,
            })),
          )
          .toEqual({
            complete: true,
            naturalWidth: image.width,
            naturalHeight: image.height,
          });
      }

      const loadedScrollHeight = await page.evaluate(
        () => document.documentElement.scrollHeight,
      );
      const loadedState = await imageLocator.evaluateAll((images) =>
        images.map((image) => {
          const rect = image.getBoundingClientRect();

          return {
            path: new URL(image.currentSrc || image.src).pathname,
            naturalWidth: image.naturalWidth,
            naturalHeight: image.naturalHeight,
            renderedRatio: rect.width / rect.height,
          };
        }),
      );

      expect(Math.abs(loadedScrollHeight - initialScrollHeight)).toBeLessThanOrEqual(
        1,
      );
      for (const [index, image] of milestoneImages.entries()) {
        expect(loadedState[index].path).toBe(image.path);
        expect(loadedState[index].naturalWidth).toBe(image.width);
        expect(loadedState[index].naturalHeight).toBe(image.height);
        expect(loadedState[index].renderedRatio).toBeCloseTo(
          image.width / image.height,
          5,
        );
      }
      expect([...requestedImages].sort()).toEqual(
        milestoneImages.map((image) => image.path).sort(),
      );
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      ).toBe(true);

      await expect(deepImageLocator).toHaveAttribute("tabindex", "0");
      await expect(deepImageLocator).toHaveAttribute("role", "button");
      await deepImageLocator.click();
      await expect(page.locator("#lightbox")).toHaveAttribute("open", "");
      await expect(page.locator("#lightboxImg")).toHaveAttribute(
        "src",
        new RegExp(`${deepImage.path}$`),
      );
      await expect(page.locator("#lightboxClose")).toBeFocused();

      if (viewport.name === "desktop") {
        await page.keyboard.press("Escape");
      } else {
        await page.locator("#lightboxClose").click();
      }

      await expect(page.locator("#lightbox")).not.toHaveAttribute("open", "");
      await expect(deepImageLocator).toBeFocused();
      expect(consoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);
      expect(missingLocalResources).toEqual([]);
      expect(externalRequests).toEqual([]);

      console.log(
        `[milestone-geometry:${viewport.name}] ${JSON.stringify({
          initialScrollHeight,
          loadedScrollHeight,
          initialRequestedImages,
          deepImageRequestedInitially: false,
          deepImageRequestedAfterScroll: true,
        })}`,
      );
    } finally {
      for (const release of pendingReleases.values()) release();
      await context.close();
    }
  });
}
