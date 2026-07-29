import { expect, test } from "@playwright/test";

const worksPages = [
  { route: "/works/", lang: "zh-Hant" },
  { route: "/en/works/", lang: "en" },
  { route: "/ja/works/", lang: "ja" },
];

const worksImages = [
  { path: "/images/2001_w.webp", width: 3024, height: 1859, lazy: false },
  { path: "/images/2002_w.webp", width: 3024, height: 3078, lazy: true },
  { path: "/images/2003_w.webp", width: 4615, height: 2660, lazy: true },
  { path: "/images/2004_w.webp", width: 5043, height: 3538, lazy: true },
  { path: "/images/2005_w.webp", width: 745, height: 487, lazy: true },
  { path: "/images/2006_w.webp", width: 1105, height: 1767, lazy: true },
];

function localImagePath(url) {
  const parsedUrl = new URL(url);
  return parsedUrl.origin === "http://127.0.0.1:4173" &&
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

test("localized Works images keep stable geometry while loading on demand", async ({
  browser,
}) => {
  for (const worksPage of worksPages) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    const networkSession = await context.newCDPSession(page);

    await networkSession.send("Network.enable");
    await networkSession.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 20,
      downloadThroughput: 1_250_000,
      uploadThroughput: 625_000,
      connectionType: "wifi",
    });

    const requestedImages = new Set();
    const externalRequests = [];

    page.on("request", (request) => {
      const imagePath = localImagePath(request.url());

      if (imagePath) {
        requestedImages.add(imagePath);
      } else if (new URL(request.url()).origin !== "http://127.0.0.1:4173") {
        externalRequests.push(request.url());
      }
    });

    const response = await page.goto(worksPage.route, { waitUntil: "load" });
    await settleLazyLoading(page);
    const initialRequestedImages = new Set(requestedImages);
    const imageLocator = page.locator(".works-showcase-grid img.zoomable");

    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", worksPage.lang);
    await expect(imageLocator).toHaveCount(worksImages.length);

    const initialState = await imageLocator.evaluateAll((images) =>
      images.map((image) => {
        const rect = image.getBoundingClientRect();

        return {
          path: new URL(image.currentSrc || image.src).pathname,
          loading: image.getAttribute("loading"),
          decoding: image.getAttribute("decoding"),
          width: image.getAttribute("width"),
          height: image.getAttribute("height"),
          aboveFold: rect.top < window.innerHeight && rect.bottom > 0,
        };
      }),
    );

    expect(initialState).toEqual(
      worksImages.map((image, index) => ({
        path: image.path,
        loading: image.lazy ? "lazy" : null,
        decoding: image.lazy ? "async" : null,
        width: String(image.width),
        height: String(image.height),
        aboveFold: index === 0,
      })),
    );
    expect(initialRequestedImages.has(worksImages[0].path)).toBe(true);
    expect(initialRequestedImages.size).toBeLessThan(worksImages.length);
    expect(externalRequests).toEqual([]);

    const initialCardGeometry = await page
      .locator(".works-showcase-grid > .showcase-card")
      .evaluateAll((cards) =>
        cards.map((card) => {
          const rect = card.getBoundingClientRect();

          return { width: rect.width, height: rect.height };
        }),
      );

    for (const image of worksImages.slice(1)) {
      const locator = page.locator(`img.zoomable[src$="${image.path}"]`);

      await locator.scrollIntoViewIfNeeded();
      await expect.poll(() => requestedImages.has(image.path)).toBe(true);
      await expect
        .poll(() =>
          locator.evaluate(
            (element) =>
              element.complete &&
              element.naturalWidth > 0 &&
              element.naturalHeight > 0,
          ),
        )
        .toBe(true);
    }

    expect([...requestedImages].sort()).toEqual(
      worksImages.map((image) => image.path).sort(),
    );

    const loadedState = await imageLocator.evaluateAll((images) =>
      images.map((image) => ({
        path: new URL(image.currentSrc || image.src).pathname,
        complete: image.complete,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        width: Number(image.getAttribute("width")),
        height: Number(image.getAttribute("height")),
      })),
    );

    expect(loadedState).toEqual(
      worksImages.map((image) => ({
        path: image.path,
        complete: true,
        naturalWidth: image.width,
        naturalHeight: image.height,
        width: image.width,
        height: image.height,
      })),
    );

    const loadedCardGeometry = await page
      .locator(".works-showcase-grid > .showcase-card")
      .evaluateAll((cards) =>
        cards.map((card) => {
          const rect = card.getBoundingClientRect();

          return { width: rect.width, height: rect.height };
        }),
      );

    expect(loadedCardGeometry).toEqual(initialCardGeometry);
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

    await context.close();
  }
});
