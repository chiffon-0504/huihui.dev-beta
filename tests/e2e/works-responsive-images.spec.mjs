import { expect, test } from "@playwright/test";

const localOrigin = "http://127.0.0.1:4173";
const worksImages = [
  {
    id: "2001",
    original: "/images/2001_w.webp",
    width: 3024,
    height: 1859,
  },
  {
    id: "2002",
    original: "/images/2002_w.webp",
    width: 3024,
    height: 3078,
  },
  {
    id: "2003",
    original: "/images/2003_w.webp",
    width: 4615,
    height: 2660,
  },
  {
    id: "2004",
    original: "/images/2004_w.webp",
    width: 5043,
    height: 3538,
  },
];
const viewportCases = [
  {
    name: "mobile-1x",
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    expectedWidths: [900, 900, 900, 900],
  },
  {
    name: "desktop-1x",
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    expectedWidths: [900, 900, 900, 900],
  },
  {
    name: "desktop-2x",
    width: 1280,
    height: 800,
    deviceScaleFactor: 2,
    expectedWidths: [1600, 1600, 900, 900],
  },
];

for (const viewport of viewportCases) {
  test(`Works selects responsive resources at ${viewport.name}`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.deviceScaleFactor,
    });
    const page = await context.newPage();
    const requestedPaths = new Set();
    const missingLocalResources = [];

    page.on("request", (request) => {
      const url = new URL(request.url());

      if (url.origin === localOrigin) requestedPaths.add(url.pathname);
    });
    page.on("response", (response) => {
      const url = new URL(response.url());

      if (url.origin === localOrigin && response.status() === 404) {
        missingLocalResources.push(url.pathname);
      }
    });

    try {
      const response = await page.goto("/works/", {
        waitUntil: "domcontentloaded",
      });
      const imageLocators = worksImages.map((image) =>
        page.locator(`img.zoomable[src$="${image.original}"]`),
      );

      expect(response?.status()).toBe(200);

      for (const [index, locator] of imageLocators.entries()) {
        const image = worksImages[index];
        const selectedWidth = viewport.expectedWidths[index];
        const expectedPath = `/images/${image.id}_w-${selectedWidth}.webp`;

        await locator.scrollIntoViewIfNeeded();
        await expect
          .poll(() =>
            locator.evaluate((element) => ({
              complete: element.complete,
              currentPath: element.currentSrc
                ? new URL(element.currentSrc).pathname
                : "",
            })),
          )
          .toEqual({
            complete: true,
            currentPath: expectedPath,
          });
        expect(requestedPaths.has(expectedPath), expectedPath).toBe(true);
      }

      const normalState = await Promise.all(
        imageLocators.map((locator) =>
          locator.evaluate((element) => {
            const rect = element.getBoundingClientRect();

            return {
              currentPath: new URL(element.currentSrc).pathname,
              displayedWidth: rect.width,
              displayedHeight: rect.height,
              sizes: element.sizes,
              fullSrc: element.dataset.fullSrc,
            };
          }),
        ),
      );

      for (const [index, image] of worksImages.entries()) {
        expect(normalState[index].sizes).toBeTruthy();
        expect(normalState[index].fullSrc).toBe(image.original);
        expect(normalState[index].currentPath).not.toBe(image.original);
        expect(requestedPaths.has(image.original), image.original).toBe(false);
      }
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      ).toBe(true);

      const lightbox = page.locator("#lightbox");
      const lightboxImage = page.locator("#lightboxImg");
      const closeButton = page.locator("#lightboxClose");

      for (const [index, trigger] of imageLocators.entries()) {
        const image = worksImages[index];

        await trigger.click();
        await expect(lightbox).toHaveAttribute("open", "");
        await expect(lightboxImage).toHaveAttribute(
          "src",
          new RegExp(`${image.original}$`),
        );
        await expect.poll(() => requestedPaths.has(image.original)).toBe(true);
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
        await closeButton.click();
        await expect(lightbox).not.toHaveAttribute("open", "");
        await expect(trigger).toBeFocused();
      }

      expect(missingLocalResources).toEqual([]);
      console.log(
        `[works-responsive:${viewport.name}] ${JSON.stringify({
          viewport: {
            width: viewport.width,
            height: viewport.height,
            deviceScaleFactor: viewport.deviceScaleFactor,
          },
          images: normalState,
          originalRequestedBeforeLightbox: false,
          originalRequestedAfterLightbox: true,
          horizontalOverflow: false,
        })}`,
      );
    } finally {
      await context.close();
    }
  });
}
