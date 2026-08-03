import { expect, test } from "@playwright/test";

const localOrigin = "http://127.0.0.1:4173";
const worksImageRoutePattern =
  /^http:\/\/127\.0\.0\.1:4173\/images\/200[1-6]_w\.webp(?:\?.*)?$/;
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
  { path: "/images/2001_w.webp", width: 3024, height: 1859, lazy: false },
  { path: "/images/2002_w.webp", width: 3024, height: 3078, lazy: true },
  { path: "/images/2003_w.webp", width: 4615, height: 2660, lazy: true },
  { path: "/images/2004_w.webp", width: 5043, height: 3538, lazy: true },
  { path: "/images/2005_w.webp", width: 745, height: 487, lazy: true },
  { path: "/images/2006_w.webp", width: 1105, height: 1767, lazy: true },
];
const targetImage = worksImages.at(-1);

function localImagePath(url) {
  const parsedUrl = new URL(url);
  return parsedUrl.origin === localOrigin &&
    /^\/images\/200[1-6]_w\.webp$/.test(parsedUrl.pathname)
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
      const waitForLoadedImage = async (image) => {
        const locator = page.locator(`img.zoomable[src$="${image.path}"]`);

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
        const firstLightboxTrigger = page
          .locator(".showcase-photo-card img.zoomable")
          .first();

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
        await expect.poll(() => requestedImages.has(worksImages[0].path)).toBe(
          true,
        );
        await expect
          .poll(
            () =>
              (pendingReleases.get(worksImages[0].path)?.size || 0) > 0,
          )
          .toBe(true);
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
              path: new URL(image.currentSrc || image.src).pathname,
              alt: image.alt,
              loading: image.getAttribute("loading"),
              decoding: image.getAttribute("decoding"),
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
              ...imageState
            }) => imageState,
          ),
        ).toEqual(
          worksImages.map((image, index) => ({
            path: image.path,
            alt: worksPage.alts[index],
            loading: image.lazy ? "lazy" : null,
            decoding: image.lazy ? "async" : null,
            width: String(image.width),
            height: String(image.height),
            naturalWidth: 0,
            naturalHeight: 0,
            aboveFold: index === 0,
          })),
        );
        for (const imageState of blockedState) {
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

        await releaseImage(targetImage.path);
        await waitForLoadedImage(targetImage);

        for (const image of worksImages.filter(
          (candidate) => candidate !== targetImage,
        )) {
          const locator = page.locator(`img.zoomable[src$="${image.path}"]`);

          await locator.scrollIntoViewIfNeeded();
          await expect.poll(() => requestedImages.has(image.path)).toBe(true);
          await releaseImage(image.path);
          await waitForLoadedImage(image);
        }

        expect([...requestedImages].sort()).toEqual(
          worksImages.map((image) => image.path).sort(),
        );

        const loadedState = await imageLocator.evaluateAll((images) =>
          images.map((image) => {
            const rect = image.getBoundingClientRect();

            return {
              path: new URL(image.currentSrc || image.src).pathname,
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
            ({ renderedWidth, renderedHeight, renderedRatio, ...imageState }) =>
              imageState,
          ),
        ).toEqual(
          worksImages.map((image, index) => ({
            path: image.path,
            alt: worksPage.alts[index],
            complete: true,
            naturalWidth: image.width,
            naturalHeight: image.height,
            width: image.width,
            height: image.height,
          })),
        );
        expect(
          loadedState.map((image) => ({
            width: image.renderedWidth,
            height: image.renderedHeight,
            ratio: image.renderedRatio,
          })),
        ).toEqual(blockedImageGeometry);
        expect(
          await cardLocator.evaluateAll((cards) =>
            cards.map((card) => {
              const rect = card.getBoundingClientRect();

              return { width: rect.width, height: rect.height };
            }),
          ),
        ).toEqual(blockedCardGeometry);
        expect(
          await page.evaluate(
            () =>
              document.documentElement.scrollWidth <=
              document.documentElement.clientWidth,
          ),
        ).toBe(true);

        for (const image of worksImages.slice(1)) {
          const trigger = page.locator(`img.zoomable[src$="${image.path}"]`);
          const lightbox = page.locator("#lightbox");

          await trigger.click();
          await expect(lightbox).toHaveAttribute("open", "");
          await expect(lightbox).toHaveClass(/\bshow\b/);
          await expect(page.locator("#lightboxImg")).toHaveAttribute(
            "src",
            new RegExp(`${image.path}$`),
          );
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
