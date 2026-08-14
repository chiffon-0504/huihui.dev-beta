import { expect, test } from "@playwright/test";

const localOrigin = "http://127.0.0.1:4173";
const worksImageRoutePattern =
  /^http:\/\/127\.0\.0\.1:4173\/images\/(?:200[1-6]_w|200[1-4]_w-(?:900|1600)|200[13]_w-2400|200[24]_w-1800)\.webp(?:\?.*)?$/;
const largeImageSizes =
  "(max-width: 722px) 680px, (max-width: 900px) calc(100vw - 42px), 1074px";
const portraitImageSizes =
  "(max-width: 900px) calc(100vw - 42px), (max-width: 942px) 383px, (max-width: 1200px) calc(66.667vw - 245px), min(660px, calc(66.667vw - 298px))";
const tallImageSizes =
  "(max-width: 526px) 484px, (max-width: 900px) calc(100vw - 42px), 1146px";
const standardImageSizes =
  "(max-width: 439px) 397px, (max-width: 900px) calc(100vw - 42px), 554px";
const worksPages = [
  {
    name: "zh-Hant",
    route: "/works/",
    lang: "zh-Hant",
    heading: "作品",
    alts: ["富士山", "通天閣", "橫濱港", "電車", "小鹿", "企鵝"],
  },
  {
    name: "en",
    route: "/en/works/",
    lang: "en",
    heading: "Works",
    alts: [
      "Mount Fuji",
      "Tsutenkaku",
      "Yokohama Port",
      "Train",
      "Deer",
      "Penguin",
    ],
  },
  {
    name: "ja",
    route: "/ja/works/",
    lang: "ja",
    heading: "作品",
    alts: ["富士山", "通天閣", "横浜港", "電車", "鹿", "ペンギン"],
  },
];

const worksImages = [
  {
    path: "/images/2001_w.webp",
    width: 3024,
    height: 1859,
    lazy: false,
    srcset:
      "/images/2001_w-900.webp 900w, /images/2001_w-1600.webp 1600w, /images/2001_w-2400.webp 2400w",
    sizes: largeImageSizes,
    displaySources: [
      { path: "/images/2001_w-900.webp", width: 900, height: 553 },
      { path: "/images/2001_w-1600.webp", width: 1600, height: 984 },
      { path: "/images/2001_w-2400.webp", width: 2400, height: 1475 },
    ],
  },
  {
    path: "/images/2002_w.webp",
    width: 3024,
    height: 3078,
    lazy: true,
    srcset:
      "/images/2002_w-900.webp 900w, /images/2002_w-1600.webp 1600w, /images/2002_w-1800.webp 1800w",
    sizes: portraitImageSizes,
    displaySources: [
      { path: "/images/2002_w-900.webp", width: 900, height: 916 },
      { path: "/images/2002_w-1600.webp", width: 1600, height: 1629 },
      { path: "/images/2002_w-1800.webp", width: 1800, height: 1832 },
    ],
  },
  {
    path: "/images/2003_w.webp",
    width: 4615,
    height: 2660,
    lazy: true,
    srcset:
      "/images/2003_w-900.webp 900w, /images/2003_w-1600.webp 1600w, /images/2003_w-2400.webp 2400w",
    sizes: tallImageSizes,
    displaySources: [
      { path: "/images/2003_w-900.webp", width: 900, height: 519 },
      { path: "/images/2003_w-1600.webp", width: 1600, height: 922 },
      { path: "/images/2003_w-2400.webp", width: 2400, height: 1383 },
    ],
  },
  {
    path: "/images/2004_w.webp",
    width: 5043,
    height: 3538,
    lazy: true,
    srcset:
      "/images/2004_w-900.webp 900w, /images/2004_w-1600.webp 1600w, /images/2004_w-1800.webp 1800w",
    sizes: standardImageSizes,
    displaySources: [
      { path: "/images/2004_w-900.webp", width: 900, height: 631 },
      { path: "/images/2004_w-1600.webp", width: 1600, height: 1123 },
      { path: "/images/2004_w-1800.webp", width: 1800, height: 1263 },
    ],
  },
  {
    path: "/images/2005_w.webp",
    width: 745,
    height: 487,
    lazy: true,
  },
  {
    path: "/images/2006_w.webp",
    width: 1105,
    height: 1767,
    lazy: true,
  },
];
const targetImage = worksImages.at(-1);
const worksImagePaths = new Set(
  worksImages.flatMap((image) => [
    image.path,
    ...(image.displaySources || []).map((source) => source.path),
  ]),
);

function displayPathsFor(image) {
  return image.displaySources
    ? image.displaySources.map((source) => source.path)
    : [image.path];
}

function displaySourceForPath(image, imagePath) {
  return (
    image.displaySources?.find((source) => source.path === imagePath) ||
    (imagePath === image.path ? image : null)
  );
}

function localImagePath(url) {
  const parsedUrl = new URL(url);
  return parsedUrl.origin === localOrigin &&
    worksImagePaths.has(parsedUrl.pathname)
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

test.use({ viewport: { width: 390, height: 844 } });

test.describe("localized Works image reliability", () => {
  test.describe.configure({ mode: "parallel" });

  for (const worksPage of worksPages) {
    test(`localized Works images keep stable geometry while loading on demand (${worksPage.name})`, async ({
      page,
    }) => {
      const requestedImages = new Set();
      const releasedImages = new Set();
      const pendingReleases = new Map();
      const inFlightRouteHandlers = new Set();
      const consoleErrors = [];
      const pageErrors = [];
      const missingLocalResources = [];
      const externalRequests = [];

      const observeRequest = (request) => {
        const imagePath = localImagePath(request.url());

        if (imagePath) {
          requestedImages.add(imagePath);
        } else if (new URL(request.url()).origin !== localOrigin) {
          externalRequests.push(request.url());
        }
      };
      const observeResponse = (response) => {
        const url = new URL(response.url());

        if (url.origin === localOrigin && response.status() === 404) {
          missingLocalResources.push(url.pathname);
        }
      };
      const observeConsole = (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      };
      const observePageError = (error) => pageErrors.push(error.message);
      const gateWorksImage = async (route) => {
        const imagePath = localImagePath(route.request().url());

        if (!imagePath) {
          await route.continue();
          return;
        }

        let releaseGate;
        let gatePromise = Promise.resolve();

        if (!releasedImages.has(imagePath)) {
          gatePromise = new Promise((resolve) => {
            releaseGate = resolve;
          });

          const releases = pendingReleases.get(imagePath) || new Set();
          releases.add(releaseGate);
          pendingReleases.set(imagePath, releases);
        }

        try {
          const imageResponse = await route.fetch();

          await gatePromise;
          await route.fulfill({ response: imageResponse });
        } finally {
          if (releaseGate) {
            const releases = pendingReleases.get(imagePath);
            releases?.delete(releaseGate);

            if (releases?.size === 0) pendingReleases.delete(imagePath);
          }
        }
      };
      const routeWorksImage = (route) => {
        const handlerPromise = gateWorksImage(route);

        inFlightRouteHandlers.add(handlerPromise);
        void handlerPromise.then(
          () => inFlightRouteHandlers.delete(handlerPromise),
          () => inFlightRouteHandlers.delete(handlerPromise),
        );

        return handlerPromise;
      };
      const releaseImage = async (imagePath) => {
        await expect
          .poll(() => (pendingReleases.get(imagePath)?.size || 0) > 0)
          .toBe(true);

        releasedImages.add(imagePath);
        for (const release of pendingReleases.get(imagePath)) release();
      };
      const pendingDisplayPathsFor = (image) =>
        displayPathsFor(image).filter(
          (imagePath) => (pendingReleases.get(imagePath)?.size || 0) > 0,
        );
      const releasePendingDisplayPaths = (image) => {
        const pendingPaths = pendingDisplayPathsFor(image);

        for (const imagePath of pendingPaths) {
          releasedImages.add(imagePath);
          for (const release of pendingReleases.get(imagePath)) release();
        }

        return pendingPaths;
      };
      const waitForLoadedImage = async (image) => {
        const locator = page.locator(`img.zoomable[src$="${image.path}"]`);
        const allowedPaths = displayPathsFor(image);

        await expect
          .poll(() => pendingDisplayPathsFor(image).length)
          .toBeGreaterThan(0);

        await expect
          .poll(async () => {
            releasePendingDisplayPaths(image);
            const state = await locator.evaluate((element) => ({
              complete: element.complete,
              currentPath: element.currentSrc
                ? new URL(element.currentSrc).pathname
                : "",
              naturalWidth: element.naturalWidth,
              naturalHeight: element.naturalHeight,
            }));

            return (
              state.complete &&
              state.naturalWidth > 0 &&
              state.naturalHeight > 0 &&
              allowedPaths.includes(state.currentPath)
            );
          })
          .toBe(true);

        const loadedState = await locator.evaluate((element) => ({
          currentPath: new URL(element.currentSrc).pathname,
          naturalWidth: element.naturalWidth,
          naturalHeight: element.naturalHeight,
        }));

        expect(displaySourceForPath(image, loadedState.currentPath)).not.toBe(
          null,
        );
        expect(loadedState.naturalWidth).toBeGreaterThan(0);
        expect(loadedState.naturalHeight).toBeGreaterThan(0);

        await expect
          .poll(() => {
            releasePendingDisplayPaths(image);
            return pendingDisplayPathsFor(image).length;
          })
          .toBe(0);

        return loadedState;
      };

      page.on("request", observeRequest);
      page.on("response", observeResponse);
      page.on("console", observeConsole);
      page.on("pageerror", observePageError);

      try {
        await page.route(worksImageRoutePattern, routeWorksImage);

        const response = await page.goto(worksPage.route, {
          waitUntil: "domcontentloaded",
        });
        const landmark = page.locator(".works-showcase-page");
        const grid = page.locator(".works-showcase-grid");
        const imageLocator = grid.locator("img.zoomable");
        const cardLocator = grid.locator(":scope > .showcase-card");
        const firstLightboxTrigger = imageLocator.first();

        expect(response?.status()).toBe(200);
        await expect(page.locator("html")).toHaveAttribute(
          "lang",
          worksPage.lang,
        );
        await expect(landmark).toBeVisible();
        await expect(page.locator(".works-hero h1")).toHaveText(
          worksPage.heading,
        );
        await expect(imageLocator).toHaveCount(worksImages.length);
        await expect
          .poll(() =>
            grid.evaluate((element) => ({
              display: getComputedStyle(element).display,
              imageObjectFit: getComputedStyle(
                element.querySelector("img.zoomable"),
              ).objectFit,
            })),
          )
          .toEqual({ display: "grid", imageObjectFit: "cover" });
        await expect(firstLightboxTrigger).toHaveAttribute("tabindex", "0");
        await expect(firstLightboxTrigger).toHaveAttribute("role", "button");
        await expect(firstLightboxTrigger).toHaveAttribute(
          "aria-haspopup",
          "dialog",
        );
        await expect
          .poll(() => pendingDisplayPathsFor(worksImages[0]).length)
          .toBeGreaterThan(0);
        await settleLazyLoading(page);

        const blockedState = await imageLocator.evaluateAll((images) =>
          images.map((image) => {
            const rect = image.getBoundingClientRect();
            const card = image.closest(".showcase-card");
            const intrinsicRatio =
              Number(image.getAttribute("width")) /
              Number(image.getAttribute("height"));
            const expectedRenderedHeight = Math.max(
              rect.width / intrinsicRatio,
              card.clientHeight,
            );

            return {
              srcPath: new URL(image.src).pathname,
              currentPath: image.currentSrc
                ? new URL(image.currentSrc).pathname
                : "",
              alt: image.alt,
              loading: image.getAttribute("loading"),
              decoding: image.getAttribute("decoding"),
              srcset: image.getAttribute("srcset"),
              sizes: image.getAttribute("sizes"),
              fullSrc: image.dataset.fullSrc || null,
              width: image.getAttribute("width"),
              height: image.getAttribute("height"),
              naturalWidth: image.naturalWidth,
              naturalHeight: image.naturalHeight,
              renderedWidth: rect.width,
              renderedHeight: rect.height,
              renderedRatio: rect.width / rect.height,
              expectedRenderedHeight,
              aboveFold: rect.top < window.innerHeight && rect.bottom > 0,
            };
          }),
        );

        expect(
          blockedState.map(
            ({
              renderedWidth,
              renderedHeight,
              renderedRatio,
              expectedRenderedHeight,
              currentPath,
              ...imageState
            }) => imageState,
          ),
        ).toEqual(
          worksImages.map((image, index) => ({
            srcPath: image.path,
            alt: worksPage.alts[index],
            loading: image.lazy ? "lazy" : null,
            decoding: "async",
            srcset: image.srcset || null,
            sizes: image.sizes || null,
            fullSrc: image.displaySources ? image.path : null,
            width: String(image.width),
            height: String(image.height),
            naturalWidth: 0,
            naturalHeight: 0,
            aboveFold: index === 0,
          })),
        );
        for (const [index, imageState] of blockedState.entries()) {
          if (imageState.currentPath) {
            expect(displayPathsFor(worksImages[index])).toContain(
              imageState.currentPath,
            );
          }
          expect(imageState.renderedWidth).toBeGreaterThan(0);
          expect(imageState.renderedHeight).toBeGreaterThan(0);
          expect(
            Math.abs(
              imageState.renderedHeight - imageState.expectedRenderedHeight,
            ),
          ).toBeLessThanOrEqual(
            1 / 64,
          );
        }

        const blockedImageGeometry = blockedState.map((image) => ({
          width: image.renderedWidth,
          height: image.renderedHeight,
          ratio: image.renderedRatio,
        }));
        const blockedCardGeometry = await cardLocator.evaluateAll((cards) =>
          cards.map((card) => {
            const rect = card.getBoundingClientRect();

            return { width: rect.width, height: rect.height };
          }),
        );

        for (const geometry of blockedCardGeometry) {
          expect(geometry.width).toBeGreaterThan(0);
          expect(geometry.height).toBeGreaterThan(0);
        }
        expect(
          await page.evaluate(
            () =>
              document.documentElement.scrollWidth <=
              document.documentElement.clientWidth,
          ),
        ).toBe(true);

        const targetImageLocator = page.locator(
          `img.zoomable[src$="${targetImage.path}"]`,
        );
        const targetImageTop = await targetImageLocator.evaluate(
          (image) => image.getBoundingClientRect().top,
        );
        const requestedBeforeTargetScroll = requestedImages.has(
          targetImage.path,
        );
        const requestedImagesBeforeTargetScroll = [...requestedImages].sort();

        expect(targetImageTop).toBeGreaterThan(844 * 2);
        await targetImageLocator.scrollIntoViewIfNeeded();

        if (!requestedBeforeTargetScroll) {
          await expect.poll(() => requestedImages.has(targetImage.path)).toBe(
            true,
          );
        }

        await waitForLoadedImage(targetImage);

        for (const image of worksImages.filter(
          (candidate) => candidate !== targetImage,
        )) {
          const locator = page.locator(`img.zoomable[src$="${image.path}"]`);

          await locator.scrollIntoViewIfNeeded();
          await waitForLoadedImage(image);
        }

        const requestedImagesBeforeLightbox = new Set(requestedImages);

        for (const image of worksImages) {
          const allowedPaths = displayPathsFor(image);
          const requestedPaths = [
            image.path,
            ...(image.displaySources || []).map((source) => source.path),
          ].filter((imagePath) =>
            requestedImagesBeforeLightbox.has(imagePath),
          );

          if (image.displaySources) {
            expect(requestedPaths.length).toBeGreaterThan(0);
            expect(requestedPaths).not.toContain(image.path);
            for (const imagePath of requestedPaths) {
              expect(allowedPaths).toContain(imagePath);
            }
          } else {
            expect(requestedPaths).toEqual([image.path]);
          }
        }

        const loadedState = await imageLocator.evaluateAll((images) =>
          images.map((image) => {
            const rect = image.getBoundingClientRect();

            return {
              srcPath: new URL(image.src).pathname,
              currentPath: new URL(image.currentSrc).pathname,
              alt: image.alt,
              complete: image.complete,
              naturalWidth: image.naturalWidth,
              naturalHeight: image.naturalHeight,
              width: Number(image.getAttribute("width")),
              height: Number(image.getAttribute("height")),
              renderedWidth: rect.width,
              renderedHeight: rect.height,
              renderedRatio: rect.width / rect.height,
            };
          }),
        );

        expect(
          loadedState.map(
            ({
              naturalWidth,
              naturalHeight,
              renderedWidth,
              renderedHeight,
              renderedRatio,
              currentPath,
              ...imageState
            }) => imageState,
          ),
        ).toEqual(
          worksImages.map((image, index) => ({
            srcPath: image.path,
            alt: worksPage.alts[index],
            complete: true,
            width: image.width,
            height: image.height,
          })),
        );
        for (const [index, imageState] of loadedState.entries()) {
          const image = worksImages[index];

          expect(imageState.naturalWidth).toBeGreaterThan(0);
          expect(imageState.naturalHeight).toBeGreaterThan(0);
          expect(displayPathsFor(image)).toContain(imageState.currentPath);
          expect(
            displaySourceForPath(image, imageState.currentPath),
          ).not.toBe(null);

          if (!image.displaySources) {
            expect(imageState.naturalWidth).toBe(image.width);
            expect(imageState.naturalHeight).toBe(image.height);
          }
        }
        for (const [index, image] of loadedState.entries()) {
          const blockedGeometry = blockedImageGeometry[index];

          expect(image.renderedWidth).toBe(blockedGeometry.width);
          expect(
            Math.abs(image.renderedHeight - blockedGeometry.height),
          ).toBeLessThanOrEqual(1 / 16);
          expect(
            Math.abs(image.renderedRatio - blockedGeometry.ratio),
          ).toBeLessThanOrEqual(1 / 1000);
        }
        const loadedCardGeometry = await cardLocator.evaluateAll((cards) =>
          cards.map((card) => {
            const rect = card.getBoundingClientRect();

            return { width: rect.width, height: rect.height };
          }),
        );

        for (const [index, geometry] of loadedCardGeometry.entries()) {
          expect(geometry.width).toBe(blockedCardGeometry[index].width);
          expect(
            Math.abs(geometry.height - blockedCardGeometry[index].height),
          ).toBeLessThanOrEqual(1 / 16);
        }
        expect(
          await page.evaluate(
            () =>
              document.documentElement.scrollWidth <=
              document.documentElement.clientWidth,
          ),
        ).toBe(true);

        for (const image of worksImages) {
          const trigger = page.locator(`img.zoomable[src$="${image.path}"]`);
          const lightbox = page.locator("#lightbox");
          const lightboxImage = page.locator("#lightboxImg");

          if (image.displaySources) {
            expect(requestedImages.has(image.path)).toBe(false);
          }

          await trigger.click();
          await expect(lightbox).toHaveAttribute("open", "");
          await expect(lightbox).toHaveClass(/\bshow\b/);
          await expect(lightboxImage).toHaveAttribute(
            "src",
            new RegExp(`${image.path}$`),
          );

          if (image.displaySources) {
            await expect.poll(() => requestedImages.has(image.path)).toBe(true);
            await releaseImage(image.path);
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
          }

          await expect(page.locator("#lightboxClose")).toBeFocused();

          if (image === worksImages[1]) {
            await page.keyboard.press("Escape");
          } else {
            await page.locator("#lightboxClose").click();
          }

          await expect(lightbox).not.toHaveAttribute("open", "");
          await expect(trigger).toBeFocused();
        }

        await expect.poll(() => pendingReleases.size).toBe(0);
        expect(consoleErrors).toEqual([]);
        expect(pageErrors).toEqual([]);
        expect(missingLocalResources).toEqual([]);
        expect(externalRequests).toEqual([]);

        console.log(
          `[works-image-diagnostic:${worksPage.name}] ${JSON.stringify({
            firstResponsiveImage: {
              selectedPath: loadedState[0].currentPath,
              requestedPaths: displayPathsFor(worksImages[0]).filter(
                (imagePath) => requestedImagesBeforeLightbox.has(imagePath),
              ),
            },
            targetImage: targetImage.path,
            targetImageTop,
            requestedBeforeTargetScroll,
            requestedImagesBeforeTargetScroll,
          })}`,
        );
      } finally {
        for (const [imagePath, releases] of pendingReleases) {
          releasedImages.add(imagePath);
          for (const release of releases) release();
        }

        await Promise.all([...inFlightRouteHandlers]);
        await page.unroute(worksImageRoutePattern, routeWorksImage);
        page.off("request", observeRequest);
        page.off("response", observeResponse);
        page.off("console", observeConsole);
        page.off("pageerror", observePageError);
      }
    });
  }
});
