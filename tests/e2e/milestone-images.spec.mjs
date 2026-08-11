import { expect, test } from "@playwright/test";

const localOrigin = "http://127.0.0.1:4173";
const exitusImageSizes =
  "(max-width: 900px) calc(100vw - 44px - clamp(36px, 6vw, 56px)), (max-width: 1200px) min(700px, calc(100vw - 360px - clamp(36px, 6vw, 56px))), 700px";
const c2SingleImageSizes =
  "(max-width: 900px) calc(100vw - 43px - clamp(36px, 6vw, 56px)), (max-width: 1200px) min(700px, calc(100vw - 359px - clamp(36px, 6vw, 56px))), 700px";
const c2MultiImageSizes =
  "(max-width: 900px) calc(100vw - 41px - clamp(36px, 6vw, 56px)), (max-width: 1200px) min(600px, calc(100vw - 357px - clamp(36px, 6vw, 56px))), 600px";

function c2Image(id, basename, sizes) {
  return {
    id,
    path: `/images/${basename}_p.webp`,
    width: 2560,
    height: 1600,
    srcset: `/images/${basename}_p-800.webp 800w, /images/${basename}_p-1800.webp 1800w`,
    sizes,
    displaySources: [
      { path: `/images/${basename}_p-800.webp`, width: 800, height: 500 },
      { path: `/images/${basename}_p-1800.webp`, width: 1800, height: 1125 },
    ],
    c2: true,
  };
}

const milestoneImages = [
  {
    id: "ave-mujica-exitus-taipei-day2-venue",
    path: "/images/3013_p.webp",
    width: 8064,
    height: 6048,
    srcset:
      "/images/3013_p-800.webp 800w, /images/3013_p-1600.webp 1600w",
    sizes: exitusImageSizes,
    displaySources: [
      { path: "/images/3013_p-800.webp", width: 800, height: 600 },
      { path: "/images/3013_p-1600.webp", width: 1600, height: 1200 },
    ],
    c2: false,
  },
  c2Image("course-mode-phase-10-score", "3011", c2MultiImageSizes),
  c2Image(
    "course-mode-phase-10-banner-select",
    "3012",
    c2MultiImageSizes,
  ),
  c2Image("grievous-lady-score", "3008", c2MultiImageSizes),
  c2Image("tempestissimo-score", "3009", c2MultiImageSizes),
  c2Image("lament-rain-score", "3010", c2MultiImageSizes),
  c2Image("fracture-ray-score", "3007", c2SingleImageSizes),
  c2Image("aether-crest-astral-score", "3006", c2SingleImageSizes),
  c2Image("cyaegha-score", "3002", c2SingleImageSizes),
];
const viewportCases = [
  { name: "mobile-1x", width: 390, height: 844, deviceScaleFactor: 1 },
  { name: "mobile-1.25x", width: 390, height: 844, deviceScaleFactor: 1.25 },
  { name: "mobile-1.5x", width: 390, height: 844, deviceScaleFactor: 1.5 },
  { name: "mobile-2x", width: 390, height: 844, deviceScaleFactor: 2 },
  { name: "boundary-900-2x", width: 900, height: 900, deviceScaleFactor: 2 },
  { name: "desktop-transition", width: 901, height: 900, deviceScaleFactor: 1 },
  { name: "desktop-1x", width: 1280, height: 800, deviceScaleFactor: 1, verifyAllLightboxes: true },
  { name: "desktop-1.25x", width: 1280, height: 800, deviceScaleFactor: 1.25 },
  { name: "desktop-1.5x", width: 1280, height: 800, deviceScaleFactor: 1.5 },
  { name: "desktop-2x", width: 1280, height: 800, deviceScaleFactor: 2 },
  { name: "wide-desktop", width: 1440, height: 900, deviceScaleFactor: 1 },
];
const localeRoutes = [
  { locale: "zh", route: "/milestones/" },
  { locale: "en", route: "/en/milestones/" },
  { locale: "ja", route: "/ja/milestones/" },
];
const deepImage = milestoneImages.at(-1);
const c2Images = milestoneImages.filter((image) => image.c2);
const milestoneImagePaths = new Set(
  milestoneImages.flatMap((image) => [
    image.path,
    ...image.displaySources.map((source) => source.path),
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
  test(`Milestone responsive images preserve geometry and load on demand at ${viewport.name}`, async ({
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
    const requestedDisplaySource = (image) =>
      image.displaySources.find((source) => requestedImages.has(source.path));

    async function loadDisplayImage(image) {
      const locator = page.locator(
        `img.zoomable[data-image-id="${image.id}"]`,
      );

      await locator.scrollIntoViewIfNeeded();
      await expect
        .poll(() => Boolean(requestedDisplaySource(image)))
        .toBe(true);

      const selectedSource = requestedDisplaySource(image);

      expect(requestedImages.has(image.path)).toBe(false);
      releaseImage(selectedSource.path);
      await expect
        .poll(() =>
          locator.evaluate((element) => ({
            complete: element.complete,
            currentPath: element.currentSrc
              ? new URL(element.currentSrc).pathname
              : "",
          })),
        )
        .toEqual({ complete: true, currentPath: selectedSource.path });

      const geometry = await locator.evaluate((element) => {
        const rect = element.getBoundingClientRect();

        return {
          renderedWidth: rect.width,
          renderedHeight: rect.height,
          requiredWidth: Math.ceil(rect.width * devicePixelRatio),
          requiredHeight: Math.ceil(rect.height * devicePixelRatio),
          renderedRatio: rect.width / rect.height,
        };
      });

      expect(
        Math.abs(
          geometry.renderedHeight -
            geometry.renderedWidth * (image.height / image.width),
        ),
        `${viewport.name}:${image.id}:aspect-ratio rounding`,
      ).toBeLessThanOrEqual(1);
      if (image.c2) {
        expect(selectedSource.width, `${viewport.name}:${image.id}:width`).toBeGreaterThanOrEqual(
          geometry.requiredWidth,
        );
        expect(selectedSource.height, `${viewport.name}:${image.id}:height`).toBeGreaterThanOrEqual(
          geometry.requiredHeight,
        );
      } else if (viewport.name === "boundary-900-2x") {
        // C2 must not rewrite 3013. Its pre-existing contract is four source
        // pixels below this exact breakpoint's rounded border-box requirement.
        expect(geometry.requiredWidth - selectedSource.width).toBeLessThanOrEqual(4);
        expect(geometry.requiredHeight - selectedSource.height).toBeLessThanOrEqual(3);
      } else {
        expect(selectedSource.width).toBeGreaterThanOrEqual(
          geometry.requiredWidth,
        );
        expect(selectedSource.height).toBeGreaterThanOrEqual(
          geometry.requiredHeight,
        );
      }

      return { ...geometry, selectedSource };
    }

    async function openOriginal(image) {
      const trigger = page.locator(
        `img.zoomable[data-image-id="${image.id}"]`,
      );
      const lightboxImage = page.locator("#lightboxImg");

      expect(requestedImages.has(image.path)).toBe(false);
      await trigger.click();
      await expect(page.locator("#lightbox")).toHaveAttribute("open", "");
      await expect(lightboxImage).toHaveAttribute(
        "src",
        new RegExp(`${image.path}$`),
      );
      await expect.poll(() => requestedImages.has(image.path)).toBe(true);
      releaseImage(image.path);
      await expect
        .poll(() =>
          lightboxImage.evaluate((element) => ({
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
      await page.locator("#lightboxClose").click();
      await expect(page.locator("#lightbox")).not.toHaveAttribute("open", "");
      await expect(trigger).toBeFocused();
    }

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
        expect(state.decoding).toBe("async");
        expect(state.srcset).toBe(image.srcset);
        expect(state.sizes).toBe(image.sizes);
        expect(state.fullSrc).toBe(image.path);
        expect(state.dataImageId).toBe(image.id);
        expect(state.naturalWidth).toBe(0);
        expect(state.naturalHeight).toBe(0);
        expect(state.renderedWidth).toBeGreaterThan(0);
        expect(state.renderedHeight).toBeGreaterThan(0);
        expect(
          Math.abs(
            state.renderedHeight -
              state.renderedWidth * (image.height / image.width),
          ),
          `${viewport.name}:${image.id}:initial aspect-ratio rounding`,
        ).toBeLessThanOrEqual(1);
      }

      const initialScrollHeight = await page.evaluate(
        () => document.documentElement.scrollHeight,
      );
      const initialRequestedImages = [...requestedImages].sort();
      const deepImageLocator = page.locator(
        `img.zoomable[data-image-id="${deepImage.id}"]`,
      );
      const deepImageTop = await deepImageLocator.evaluate(
        (image) => image.getBoundingClientRect().top,
      );

      expect(deepImageTop).toBeGreaterThan(viewport.height * 2);
      expect(
        deepImage.displaySources.some((source) =>
          requestedImages.has(source.path),
        ),
      ).toBe(false);
      for (const image of milestoneImages) {
        expect(requestedImages.has(image.path)).toBe(false);
      }

      const loadedGeometry = new Map();
      for (const image of [...milestoneImages].reverse()) {
        loadedGeometry.set(image.id, await loadDisplayImage(image));
      }

      const loadedScrollHeight = await page.evaluate(
        () => document.documentElement.scrollHeight,
      );

      expect(
        Math.abs(loadedScrollHeight - initialScrollHeight),
      ).toBeLessThanOrEqual(1);
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      ).toBe(true);

      const expectedDisplayRequests = milestoneImages
        .map((image) => loadedGeometry.get(image.id).selectedSource.path)
        .sort();

      expect([...requestedImages].sort()).toEqual(expectedDisplayRequests);
      for (const image of milestoneImages) {
        expect(requestedImages.has(image.path)).toBe(false);
      }

      await expect(deepImageLocator).toHaveAttribute("tabindex", "0");
      await expect(deepImageLocator).toHaveAttribute("role", "button");
      await openOriginal(deepImage);

      if (viewport.verifyAllLightboxes) {
        for (const image of milestoneImages.filter(
          (candidate) => candidate.id !== deepImage.id,
        )) {
          await openOriginal(image);
        }
      }

      expect(consoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);
      expect(missingLocalResources).toEqual([]);
      expect(externalRequests).toEqual([]);

      console.log(
        `[milestone-geometry:${viewport.name}] ${JSON.stringify({
          viewport: viewport.width,
          deviceScaleFactor: viewport.deviceScaleFactor,
          initialScrollHeight,
          loadedScrollHeight,
          initialRequestedImages,
          deepImageRequestedInitially: false,
          deepImageRequestedAfterScroll: true,
          normalOriginalRequests: [],
          selections: milestoneImages.map((image) => {
            const geometry = loadedGeometry.get(image.id);

            return {
              id: image.id,
              renderedWidth: geometry.renderedWidth,
              renderedHeight: geometry.renderedHeight,
              requiredWidth: geometry.requiredWidth,
              requiredHeight: geometry.requiredHeight,
              selectedPath: geometry.selectedSource.path,
              selectedWidth: geometry.selectedSource.width,
              selectedHeight: geometry.selectedSource.height,
              sufficient:
                geometry.selectedSource.width +
                    (image.c2 ? 0 : viewport.width === 900 ? 4 : 0) >=
                  geometry.requiredWidth &&
                geometry.selectedSource.height +
                    (image.c2 ? 0 : viewport.width === 900 ? 3 : 0) >=
                  geometry.requiredHeight,
            };
          }),
        })}`,
      );
    } finally {
      for (const release of pendingReleases.values()) release();
      await context.close();
    }
  });
}

test("ZH, EN, and JA Milestones share responsive contracts and localized alt text", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const routeContracts = [];
  const missingLocalResources = [];
  const pageErrors = [];

  page.on("response", (response) => {
    const url = new URL(response.url());

    if (url.origin === localOrigin && response.status() === 404) {
      missingLocalResources.push(url.pathname);
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  try {
    for (const localeRoute of localeRoutes) {
      const response = await page.goto(localeRoute.route, {
        waitUntil: "domcontentloaded",
      });
      const images = page.locator("#postsList img.zoomable");

      expect(response?.status()).toBe(200);
      await expect(images).toHaveCount(milestoneImages.length);

      for (let index = 0; index < milestoneImages.length; index += 1) {
        const image = images.nth(index);

        await image.scrollIntoViewIfNeeded();
        await image.evaluate((element) => element.decode());
      }

      const expectedAlts = await page.evaluate(
        (locale) =>
          HUIHUI_POSTS.flatMap((post) =>
            post.images.map((image) => image.alt[locale]),
          ),
        localeRoute.locale,
      );
      const contracts = await images.evaluateAll((elements) =>
        elements.map((image) => ({
          id: image.dataset.imageId,
          src: image.getAttribute("src"),
          srcset: image.getAttribute("srcset"),
          sizes: image.getAttribute("sizes"),
          fullSrc: image.dataset.fullSrc,
          width: image.getAttribute("width"),
          height: image.getAttribute("height"),
          loading: image.getAttribute("loading"),
          decoding: image.getAttribute("decoding"),
          alt: image.alt,
        })),
      );

      expect(contracts.map((contract) => contract.alt)).toEqual(expectedAlts);
      routeContracts.push(
        contracts.map(({ alt, ...responsiveContract }) => responsiveContract),
      );
    }

    expect(routeContracts[1]).toEqual(routeContracts[0]);
    expect(routeContracts[2]).toEqual(routeContracts[0]);
    expect(missingLocalResources).toEqual([]);
    expect(pageErrors).toEqual([]);
  } finally {
    await context.close();
  }
});
