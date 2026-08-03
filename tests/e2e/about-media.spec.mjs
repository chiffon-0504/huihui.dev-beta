import { expect, test } from "@playwright/test";

const localOrigin = "http://127.0.0.1:4173";
const steamApiUrl = "https://api.huihui.dev/api/steam-library";
const locales = [
  { id: "zh", path: "/about/", htmlLang: "zh-Hant" },
  { id: "en", path: "/en/about/", htmlLang: "en" },
  { id: "ja", path: "/ja/about/", htmlLang: "ja" },
];
const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];
const localImages = [
  { path: "/images/1001_am.webp", width: 1624, height: 689 },
  { path: "/images/1002_amf.webp", width: 800, height: 800 },
  { path: "/images/1003_amb.webp", width: 400, height: 400 },
  { path: "/images/1014_aa.webp", width: 837, height: 337 },
  { path: "/images/1005_aaf.webp", width: 747, height: 747 },
  { path: "/images/1006_aab.webp", width: 800, height: 677 },
  {
    path: "/images/games/summer-pockets-rb-wide.webp",
    width: 1232,
    height: 706,
  },
];
const profileImages = [localImages[0], localImages[3]];
const deepImage = localImages.at(-1);

function getLocalAboutImagePath(url) {
  const parsedUrl = new URL(url);

  return parsedUrl.origin === localOrigin &&
    localImages.some((image) => image.path === parsedUrl.pathname)
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

for (const locale of locales) {
  for (const viewport of viewports) {
    test(`${locale.id} About media preserves geometry and loads on demand at ${viewport.name}`, async ({
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
      const unexpectedExternalRequests = [];

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

        if (url.origin !== localOrigin && request.url() !== steamApiUrl) {
          unexpectedExternalRequests.push(request.url());
        }
      });
      page.on("response", (response) => {
        const url = new URL(response.url());

        if (url.origin === localOrigin && response.status() === 404) {
          missingLocalResources.push(url.pathname);
        }
      });

      await page.route(steamApiUrl, (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        }),
      );
      await page.route("**/*.webp", async (route) => {
        const imagePath = getLocalAboutImagePath(route.request().url());

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
        const response = await page.goto(`${localOrigin}${locale.path}`, {
          waitUntil: "domcontentloaded",
        });
        const imageLocator = page.locator("#aboutPage img");

        expect(response?.status()).toBe(200);
        await expect(page.locator("html")).toHaveAttribute("lang", locale.htmlLang);
        await expect(page.locator("#steamFavorites > .steam-error")).toHaveCount(1);
        await expect(imageLocator).toHaveCount(localImages.length);
        await settleLazyLoading(page);

        const initialState = await imageLocator.evaluateAll((images) =>
          images.map((image) => {
            const rect = image.getBoundingClientRect();

            return {
              path: new URL(image.src).pathname,
              alt: image.alt,
              width: image.getAttribute("width"),
              height: image.getAttribute("height"),
              loading: image.getAttribute("loading"),
              decoding: image.getAttribute("decoding"),
              naturalWidth: image.naturalWidth,
              naturalHeight: image.naturalHeight,
              renderedWidth: rect.width,
              renderedHeight: rect.height,
              top: rect.top,
            };
          }),
        );

        for (const [index, image] of localImages.entries()) {
          const state = initialState[index];

          expect(state.path).toBe(image.path);
          expect(state.alt, image.path).toBeTruthy();
          expect(state.width).toBe(String(image.width));
          expect(state.height).toBe(String(image.height));
          expect(state.loading).toBe("lazy");
          expect(state.decoding).toBe("async");
          expect(state.top, `${image.path} should start below the fold`).toBeGreaterThan(
            viewport.height,
          );
        }

        for (const profile of profileImages) {
          const state = initialState.find((image) => image.path === profile.path);

          expect(state.naturalWidth).toBe(0);
          expect(state.naturalHeight).toBe(0);
          expect(state.renderedWidth).toBeGreaterThan(0);
          expect(state.renderedHeight).toBeGreaterThan(0);
          expect(state.renderedWidth / state.renderedHeight).toBeCloseTo(
            profile.width / profile.height,
            3,
          );
        }

        const initialScrollHeight = await page.evaluate(
          () => document.documentElement.scrollHeight,
        );
        const initialRequestedImages = [...requestedImages].sort();
        const deepImageLocator = page.locator(`img[src$="${deepImage.path}"]`);
        const deepImageTop = await deepImageLocator.evaluate(
          (image) => image.getBoundingClientRect().top,
        );

        expect(deepImageTop).toBeGreaterThan(viewport.height * 2);
        expect(requestedImages.has(deepImage.path)).toBe(false);

        await deepImageLocator.scrollIntoViewIfNeeded();
        await expect.poll(() => requestedImages.has(deepImage.path)).toBe(true);
        releaseImage(deepImage.path);
        await expect
          .poll(() =>
            deepImageLocator.evaluate((image) => ({
              complete: image.complete,
              naturalWidth: image.naturalWidth,
              naturalHeight: image.naturalHeight,
            })),
          )
          .toEqual({
            complete: true,
            naturalWidth: deepImage.width,
            naturalHeight: deepImage.height,
          });

        for (const image of localImages.slice(0, -1)) {
          const locator = page.locator(`img[src$="${image.path}"]`);

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
              renderedWidth: rect.width,
              renderedHeight: rect.height,
            };
          }),
        );

        expect(Math.abs(loadedScrollHeight - initialScrollHeight)).toBeLessThanOrEqual(
          1,
        );
        expect([...requestedImages].sort()).toEqual(
          localImages.map((image) => image.path).sort(),
        );

        for (const [index, image] of localImages.entries()) {
          expect(loadedState[index]).toMatchObject({
            path: image.path,
            naturalWidth: image.width,
            naturalHeight: image.height,
          });
        }

        for (const profile of profileImages) {
          const before = initialState.find((image) => image.path === profile.path);
          const after = loadedState.find((image) => image.path === profile.path);

          expect(Math.abs(after.renderedHeight - before.renderedHeight)).toBeLessThanOrEqual(
            1,
          );
          expect(after.renderedWidth / after.renderedHeight).toBeCloseTo(
            profile.width / profile.height,
            3,
          );
        }

        expect(
          await page.evaluate(
            () =>
              document.documentElement.scrollWidth <=
              document.documentElement.clientWidth,
          ),
        ).toBe(true);

        const lightboxTrigger = page.locator(
          `img.zoomable[src$="${profileImages[0].path}"]`,
        );
        await lightboxTrigger.scrollIntoViewIfNeeded();
        await expect(lightboxTrigger).toHaveAttribute("tabindex", "0");
        await expect(lightboxTrigger).toHaveAttribute("role", "button");
        await lightboxTrigger.click();
        await expect(page.locator("#lightbox")).toHaveAttribute("open", "");
        await expect(page.locator("#lightboxImg")).toHaveAttribute(
          "src",
          new RegExp(`${profileImages[0].path}$`),
        );
        await expect(page.locator("#lightboxClose")).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(page.locator("#lightbox")).not.toHaveAttribute("open", "");
        await expect(lightboxTrigger).toBeFocused();

        expect(consoleErrors).toEqual([]);
        expect(pageErrors).toEqual([]);
        expect(missingLocalResources).toEqual([]);
        expect(unexpectedExternalRequests).toEqual([]);

        console.log(
          `[about-media:${locale.id}:${viewport.name}] ${JSON.stringify({
            initialScrollHeight,
            loadedScrollHeight,
            initialRequestedImages,
            deepImageRequestedInitially: false,
            deepImageRequestedAfterScroll: true,
            profiles: profileImages.map((profile) => {
              const before = initialState.find(
                (image) => image.path === profile.path,
              );
              const after = loadedState.find(
                (image) => image.path === profile.path,
              );

              return {
                path: profile.path,
                blockedHeight: before.renderedHeight,
                loadedHeight: after.renderedHeight,
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
}
