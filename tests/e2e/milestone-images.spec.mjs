import { expect, test } from "@playwright/test";

const localOrigin = "http://127.0.0.1:4173";
const milestoneImages = [
  {
    id: "ave-mujica-exitus-taipei-day2-venue",
    path: "/images/3013_p.webp",
    width: 8064,
    height: 6048,
    srcset:
      "/images/3013_p-800.webp 800w, /images/3013_p-1600.webp 1600w",
    sizes:
      "(max-width: 900px) calc(100vw - 44px - clamp(36px, 6vw, 56px)), (max-width: 1200px) min(700px, calc(100vw - 360px - clamp(36px, 6vw, 56px))), 700px",
    displaySources: [
      { path: "/images/3013_p-800.webp", width: 800, height: 600 },
      { path: "/images/3013_p-1600.webp", width: 1600, height: 1200 },
    ],
  },
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
  {
    name: "desktop",
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    expectedExitusPath: "/images/3013_p-800.webp",
    expectedRenderedWidth: 700,
  },
  {
    name: "desktop-high-dpi",
    width: 1280,
    height: 800,
    deviceScaleFactor: 2,
    expectedExitusPath: "/images/3013_p-1600.webp",
    expectedRenderedWidth: 700,
  },
  {
    name: "mobile",
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    expectedExitusPath: "/images/3013_p-800.webp",
    expectedRenderedWidth: 310,
  },
];
const deepImage = milestoneImages.at(-1);
const responsiveImage = milestoneImages[0];
const milestoneImagePaths = new Set(
  milestoneImages.flatMap((image) => [
    image.path,
    ...(image.displaySources || []).map((source) => source.path),
  ]),
);

function localMilestoneImagePath(url) {
  const parsedUrl = new URL(url);

  return parsedUrl.origin === localOrigin &&
    milestoneImagePaths.has(parsedUrl.pathname)
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
      deviceScaleFactor: viewport.deviceScaleFactor,
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

    await page.route("**/images/*.webp", async (route) => {
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
            decoding: image.getAttribute("decoding"),
            srcset: image.getAttribute("srcset"),
            sizes: image.getAttribute("sizes"),
            fullSrc: image.dataset.fullSrc,
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

        if (image.displaySources) {
          expect(state.decoding).toBe("async");
          expect(state.srcset).toBe(image.srcset);
          expect(state.sizes).toBe(image.sizes);
          expect(state.fullSrc).toBe(image.path);
          expect(state.renderedWidth).toBeCloseTo(
            viewport.expectedRenderedWidth,
            5,
          );
        }
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
      expect(requestedImages.has(responsiveImage.path)).toBe(false);

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
        const locator = page.locator(
          `img.zoomable[data-image-id="${image.id}"]`,
        );
        const expectedDisplayPath = image.displaySources
          ? viewport.expectedExitusPath
          : image.path;

        await locator.scrollIntoViewIfNeeded();
        await expect
          .poll(() => requestedImages.has(expectedDisplayPath))
          .toBe(true);
        releaseImage(expectedDisplayPath);
        await expect
          .poll(() =>
            locator.evaluate((element) => ({
              complete: element.complete,
              currentPath: element.currentSrc
                ? new URL(element.currentSrc).pathname
                : "",
            })),
          )
          .toEqual({ complete: true, currentPath: expectedDisplayPath });

        const loadedImageDimensions = await locator.evaluate((element) => ({
          naturalWidth: element.naturalWidth,
          naturalHeight: element.naturalHeight,
        }));

        if (image.displaySources) {
          expect(loadedImageDimensions.naturalWidth).toBeGreaterThan(0);
          expect(loadedImageDimensions.naturalHeight).toBeGreaterThan(0);
        } else {
          expect(loadedImageDimensions).toEqual({
            naturalWidth: image.width,
            naturalHeight: image.height,
          });
        }
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
        const expectedDisplayPath = image.displaySources
          ? viewport.expectedExitusPath
          : image.path;

        expect(loadedState[index].path).toBe(expectedDisplayPath);
        if (!image.displaySources) {
          expect(loadedState[index].naturalWidth).toBe(image.width);
          expect(loadedState[index].naturalHeight).toBe(image.height);
        }
        expect(loadedState[index].renderedRatio).toBeCloseTo(
          image.width / image.height,
          5,
        );
      }
      const expectedDisplayRequests = milestoneImages.map((image) =>
        image.displaySources ? viewport.expectedExitusPath : image.path,
      );

      expect([...requestedImages].sort()).toEqual(
        expectedDisplayRequests.sort(),
      );
      expect(requestedImages.has(responsiveImage.path)).toBe(false);
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

      const responsiveImageLocator = page.locator(
        `img.zoomable[data-image-id="${responsiveImage.id}"]`,
      );
      const lightboxImage = page.locator("#lightboxImg");

      await responsiveImageLocator.scrollIntoViewIfNeeded();
      await responsiveImageLocator.click();
      await expect(page.locator("#lightbox")).toHaveAttribute("open", "");
      await expect(lightboxImage).toHaveAttribute(
        "src",
        new RegExp(`${responsiveImage.path}$`),
      );
      await expect
        .poll(() => requestedImages.has(responsiveImage.path))
        .toBe(true);
      releaseImage(responsiveImage.path);
      await expect
        .poll(() =>
          lightboxImage.evaluate((image) => ({
            complete: image.complete,
            naturalWidth: image.naturalWidth,
            naturalHeight: image.naturalHeight,
          })),
        )
        .toEqual({
          complete: true,
          naturalWidth: responsiveImage.width,
          naturalHeight: responsiveImage.height,
        });
      await page.locator("#lightboxClose").click();
      await expect(page.locator("#lightbox")).not.toHaveAttribute("open", "");
      await expect(responsiveImageLocator).toBeFocused();
      expect(consoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);
      expect(missingLocalResources).toEqual([]);
      expect(externalRequests).toEqual([]);

      console.log(
        `[milestone-geometry:${viewport.name}] ${JSON.stringify({
          initialScrollHeight,
          loadedScrollHeight,
          initialRequestedImages,
          responsiveImageCurrentSrc: viewport.expectedExitusPath,
          responsiveImageRenderedWidth: viewport.expectedRenderedWidth,
          originalRequestedBeforeLightbox: false,
          originalRequestedAfterLightbox: true,
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
