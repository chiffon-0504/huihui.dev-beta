import { expect, test } from "@playwright/test";

const localOrigin = "http://127.0.0.1:4173";
const worksImages = [
  {
    id: "2001",
    original: "/images/2001_w.webp",
    width: 3024,
    height: 1859,
    sources: [
      { path: "/images/2001_w-900.webp", width: 900, height: 553 },
      { path: "/images/2001_w-1600.webp", width: 1600, height: 984 },
      { path: "/images/2001_w-2400.webp", width: 2400, height: 1475 },
    ],
  },
  {
    id: "2002",
    original: "/images/2002_w.webp",
    width: 3024,
    height: 3078,
    sources: [
      { path: "/images/2002_w-900.webp", width: 900, height: 916 },
      { path: "/images/2002_w-1600.webp", width: 1600, height: 1629 },
      { path: "/images/2002_w-1800.webp", width: 1800, height: 1832 },
    ],
  },
  {
    id: "2003",
    original: "/images/2003_w.webp",
    width: 4615,
    height: 2660,
    sources: [
      { path: "/images/2003_w-900.webp", width: 900, height: 519 },
      { path: "/images/2003_w-1600.webp", width: 1600, height: 922 },
      { path: "/images/2003_w-2400.webp", width: 2400, height: 1383 },
    ],
  },
  {
    id: "2004",
    original: "/images/2004_w.webp",
    width: 5043,
    height: 3538,
    sources: [
      { path: "/images/2004_w-900.webp", width: 900, height: 631 },
      { path: "/images/2004_w-1600.webp", width: 1600, height: 1123 },
      { path: "/images/2004_w-1800.webp", width: 1800, height: 1263 },
    ],
  },
];
const viewportWidths = [
  { name: "mobile-390", width: 390, height: 844 },
  { name: "breakpoint-900", width: 900, height: 900 },
  { name: "breakpoint-901", width: 901, height: 900 },
  { name: "desktop-1200", width: 1200, height: 900 },
  { name: "desktop-1280", width: 1280, height: 900 },
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "desktop-1728", width: 1728, height: 900 },
];
const deviceScaleFactors = [1, 1.25, 1.5, 1.75, 2];
const borderSides = ["left", "right", "top", "bottom"];
const geometrySlack = 1 / 32;
const boundaryViewportWidths = [
  { name: "portrait-cover-floor-316", width: 316, height: 844 },
  { name: "portrait-fluid-317", width: 317, height: 844 },
  { name: "landscape-cover-floor-526", width: 526, height: 844 },
  { name: "landscape-fluid-527", width: 527, height: 844 },
  { name: "portrait-floor-942", width: 942, height: 900 },
  { name: "portrait-fluid-943", width: 943, height: 900 },
  { name: "desktop-offset-1201", width: 1201, height: 900 },
  { name: "shell-unsaturated-1435", width: 1435, height: 900 },
  { name: "shell-saturated-1436", width: 1436, height: 900 },
];
const viewportCases = [
  ...viewportWidths.flatMap((viewport) =>
    deviceScaleFactors.map((deviceScaleFactor) => ({
      ...viewport,
      name: `${viewport.name}-${deviceScaleFactor}x`,
      deviceScaleFactor,
    })),
  ),
  ...boundaryViewportWidths.map((viewport) => ({
    ...viewport,
    name: `${viewport.name}-1.5x`,
    deviceScaleFactor: 1.5,
  })),
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
          .toMatchObject({ complete: true });

        const currentPath = await locator.evaluate(
          (element) => new URL(element.currentSrc).pathname,
        );

        expect(image.sources.map((source) => source.path)).toContain(
          currentPath,
        );
        expect(requestedPaths.has(currentPath), currentPath).toBe(true);
      }

      const normalState = await Promise.all(
        imageLocators.map((locator) =>
          locator.evaluate((element) => {
            const imageRect = element.getBoundingClientRect();
            const card = element.closest(".showcase-card");
            const cardRect = card.getBoundingClientRect();
            const cardStyle = getComputedStyle(card);
            const authoredCardRule = Array.from(document.styleSheets)
              .flatMap((sheet) => Array.from(sheet.cssRules))
              .find((rule) => rule.selectorText === ".showcase-card");

            return {
              currentPath: new URL(element.currentSrc).pathname,
              displayedWidth: imageRect.width,
              displayedHeight: imageRect.height,
              cardWidth: cardRect.width,
              cardHeight: cardRect.height,
              edgeInsets: {
                left: imageRect.left - cardRect.left,
                right: cardRect.right - imageRect.right,
                top: imageRect.top - cardRect.top,
                bottom: cardRect.bottom - imageRect.bottom,
              },
              borderWidths: {
                left: parseFloat(cardStyle.borderLeftWidth),
                right: parseFloat(cardStyle.borderRightWidth),
                top: parseFloat(cardStyle.borderTopWidth),
                bottom: parseFloat(cardStyle.borderBottomWidth),
              },
              authoredBorderWidths: {
                left: authoredCardRule.style.borderLeftWidth,
                right: authoredCardRule.style.borderRightWidth,
                top: authoredCardRule.style.borderTopWidth,
                bottom: authoredCardRule.style.borderBottomWidth,
              },
              objectFit: getComputedStyle(element).objectFit,
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

      const coverAudits = worksImages.map((image, index) => {
        const state = normalState[index];
        const selectedSource = image.sources.find(
          (source) => source.path === state.currentPath,
        );
        const aspectRatio = image.width / image.height;
        const coverCssWidth = Math.max(
          state.displayedWidth,
          state.displayedHeight * aspectRatio,
        );
        const coverCssHeight = Math.max(
          state.displayedHeight,
          state.displayedWidth / aspectRatio,
        );
        const requirement = {
          width: Math.ceil(coverCssWidth * viewport.deviceScaleFactor),
          height: Math.ceil(coverCssHeight * viewport.deviceScaleFactor),
        };
        const smallestAdequateSource = image.sources.find(
          (source) =>
            source.width >= requirement.width &&
            source.height >= requirement.height,
        );

        return {
          id: image.id,
          intrinsic: { width: image.width, height: image.height },
          aspectRatio,
          objectFit: state.objectFit,
          renderedBox: {
            width: state.displayedWidth,
            height: state.displayedHeight,
          },
          cardBox: { width: state.cardWidth, height: state.cardHeight },
          edgeInsets: state.edgeInsets,
          borderWidths: state.borderWidths,
          authoredBorderWidths: state.authoredBorderWidths,
          coverCss: { width: coverCssWidth, height: coverCssHeight },
          requirement,
          selectedSource,
          smallestAdequateSource,
          sufficient:
            Boolean(selectedSource) &&
            selectedSource.width >= requirement.width &&
            selectedSource.height >= requirement.height,
        };
      });

      console.log(
        `[works-responsive-audit:${viewport.name}] ${JSON.stringify({
          viewport: {
            width: viewport.width,
            height: viewport.height,
            deviceScaleFactor: viewport.deviceScaleFactor,
          },
          images: coverAudits,
        })}`,
      );

      for (const [index, audit] of coverAudits.entries()) {
        expect(audit.objectFit).toBe("cover");
        expect(audit.selectedSource, worksImages[index].original).toBeTruthy();
        expect(audit.selectedSource).toEqual(audit.smallestAdequateSource);
        expect(audit.selectedSource.width).toBeGreaterThanOrEqual(
          audit.requirement.width,
        );
        expect(audit.selectedSource.height).toBeGreaterThanOrEqual(
          audit.requirement.height,
        );
        expect(audit.renderedBox.width).toBeLessThanOrEqual(
          audit.cardBox.width,
        );
        expect(audit.renderedBox.height).toBeLessThanOrEqual(
          audit.cardBox.height,
        );

        for (const side of borderSides) {
          const borderWidth = audit.borderWidths[side];
          const edgeInset = audit.edgeInsets[side];

          expect(audit.authoredBorderWidths[side]).toBe("1px");
          expect(borderWidth).toBeGreaterThan(0);
          expect(borderWidth).toBeLessThanOrEqual(1 + geometrySlack);
          expect(
            borderWidth * viewport.deviceScaleFactor,
          ).toBeGreaterThanOrEqual(1 - geometrySlack);
          expect(edgeInset).toBeGreaterThan(0);
          expect(edgeInset).toBeLessThanOrEqual(1 + geometrySlack);
          expect(Math.abs(edgeInset - borderWidth)).toBeLessThanOrEqual(
            geometrySlack,
          );
          expect(
            edgeInset * viewport.deviceScaleFactor,
          ).toBeGreaterThanOrEqual(1 - geometrySlack);
        }
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
          coverAudits,
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
