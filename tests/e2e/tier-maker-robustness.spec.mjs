import { expect, test } from "@playwright/test";

const html2canvasUrl =
  "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/+esm";
const maxFileSize = 10 * 1024 * 1024;

const localizedSummaries = [
  {
    route: "/tools/tier-maker/",
    expected:
      "已新增 1 張圖片。 <img src=x onerror=alert(1)>.png 未新增：無法讀取這個圖片檔案。",
  },
  {
    route: "/en/tools/tier-maker/",
    expected:
      "Images added: 1. <img src=x onerror=alert(1)>.png was not added because it is not a readable image.",
  },
  {
    route: "/ja/tools/tier-maker/",
    expected:
      "1枚の画像を追加しました。 <img src=x onerror=alert(1)>.png は追加されませんでした。画像ファイルを読み込めません。",
  },
];

function svgFile(name, width = 16, height = 16, color = "#4f8cff") {
  return {
    name,
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${color}"/></svg>`,
    ),
  };
}

function invalidImage(name = "broken.png") {
  return {
    name,
    mimeType: "image/png",
    buffer: Buffer.from("not an image"),
  };
}

function pngFileWithoutMimeType(name = "mime-less.png") {
  return {
    name,
    mimeType: "",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Avz3AAAAAElFTkSuQmCC",
      "base64",
    ),
  };
}

async function loadTierMaker(page, route = "/en/tools/tier-maker/") {
  const response = await page.goto(route, { waitUntil: "load" });

  expect(response?.status()).toBe(200);
}

async function uploadBatch(page, files, expectedStatus) {
  const input = page.locator("#imageUpload");

  await input.setInputFiles(files);
  await expect(page.locator("#tierStatus")).toHaveText(expectedStatus);
  await expect(input).toHaveValue("");
}

async function installObjectUrlTracking(page) {
  await page.addInitScript(() => {
    const createObjectURL = URL.createObjectURL.bind(URL);
    const revokeObjectURL = URL.revokeObjectURL.bind(URL);

    window.__objectUrlEvents = { created: [], revoked: [] };
    URL.createObjectURL = (blob) => {
      const url = createObjectURL(blob);
      window.__objectUrlEvents.created.push({
        url,
        type: blob.type,
        size: blob.size,
      });
      return url;
    };
    URL.revokeObjectURL = (url) => {
      window.__objectUrlEvents.revoked.push(url);
      revokeObjectURL(url);
    };
  });
}

async function mockHtml2canvas(page, moduleBody) {
  await page.route(html2canvasUrl, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      headers: { "access-control-allow-origin": "*" },
      body: moduleBody,
    });
  });
}

async function installDownloadSpy(page) {
  await page.addInitScript(() => {
    HTMLAnchorElement.prototype.click = function click() {
      window.__tierDownload = {
        download: this.download,
        href: this.href,
      };
    };
  });
}

for (const locale of localizedSummaries) {
  test(`${locale.route} reports one localized plain-text batch summary`, async ({
    page,
  }) => {
    await loadTierMaker(page, locale.route);

    await uploadBatch(
      page,
      [
        svgFile("valid.svg"),
        invalidImage("<img src=x onerror=alert(1)>.png"),
      ],
      locale.expected,
    );

    await expect(page.locator("#poolContent > .tier-item")).toHaveCount(1);
    await expect(page.locator('img[src="x"]')).toHaveCount(0);
  });
}

test("file limits reject invalid inputs while valid thumbnails retain selection order", async ({
  page,
}) => {
  await loadTierMaker(page);

  await uploadBatch(
    page,
    [
      svgFile("zeta.svg", 32, 16, "#ff0000"),
      {
        name: "large.png",
        mimeType: "image/png",
        buffer: Buffer.alloc(maxFileSize + 1),
      },
      svgFile("alpha.svg", 16, 32, "#00ff00"),
      svgFile("wide.svg", 4097, 1),
      invalidImage(),
    ],
    "Images added: 2. large.png was not added because it exceeds 10 MiB. wide.svg was not added because its dimensions exceed 4096 × 4096 pixels. broken.png was not added because it is not a readable image.",
  );

  const itemNames = await page
    .locator("#poolContent > .tier-item")
    .evaluateAll((items) => items.map((item) => item.alt));

  expect(itemNames).toEqual(["zeta.svg", "alpha.svg"]);
});

test("invalid files do not consume the 50-image allowance", async ({ page }) => {
  await loadTierMaker(page);
  await page.locator("#poolContent").evaluate((pool) => {
    for (let index = 0; index < 49; index += 1) {
      const item = document.createElement("img");
      item.className = "tier-item";
      item.alt = `existing-${index + 1}`;
      pool.appendChild(item);
    }
  });

  await uploadBatch(
    page,
    [invalidImage(), svgFile("fifty.svg"), svgFile("extra.svg")],
    "Images added: 1. broken.png was not added because it is not a readable image. The 50-image limit was reached. Extra files were not added.",
  );

  await expect(page.locator("#poolContent > .tier-item")).toHaveCount(50);
  await expect(page.locator('.tier-item[alt="fifty.svg"]')).toHaveCount(1);
  await expect(page.locator('.tier-item[alt="extra.svg"]')).toHaveCount(0);
});

test("resetting the file input allows the same file in a later batch", async ({
  page,
}) => {
  await loadTierMaker(page);
  const repeatedFile = svgFile("repeat.svg");

  await uploadBatch(page, [repeatedFile], "Images added: 1.");
  await uploadBatch(page, [repeatedFile], "Images added: 1.");

  await expect(page.locator('.tier-item[alt="repeat.svg"]')).toHaveCount(2);
});

test("readable images with an empty MIME type use decode validation", async ({
  page,
}) => {
  await loadTierMaker(page);

  await uploadBatch(
    page,
    [pngFileWithoutMimeType()],
    "Images added: 1.",
  );

  await expect(page.locator('.tier-item[alt="mime-less.png"]')).toHaveCount(1);
});

test("object URLs and PNG thumbnails follow the managed lifecycle", async ({ page }) => {
  await installObjectUrlTracking(page);
  await loadTierMaker(page);

  await uploadBatch(
    page,
    [svgFile("large-source.svg", 2048, 1024), invalidImage()],
    "Images added: 1. broken.png was not added because it is not a readable image.",
  );

  const item = page.locator('.tier-item[alt="large-source.svg"]');
  await expect
    .poll(() =>
      item.evaluate((image) => [image.naturalWidth, image.naturalHeight]),
    )
    .toEqual([1024, 512]);

  const thumbnailUrl = await item.getAttribute("data-thumbnail-url");
  const events = await page.evaluate(() => window.__objectUrlEvents);

  expect(thumbnailUrl).toBeTruthy();
  expect(events.created).toHaveLength(3);
  expect(events.created.find((entry) => entry.url === thumbnailUrl)?.type).toBe(
    "image/png",
  );
  expect(events.revoked).toEqual(
    expect.arrayContaining(
      events.created
        .filter((entry) => entry.url !== thumbnailUrl)
        .map((entry) => entry.url),
    ),
  );
  expect(events.revoked).not.toContain(thumbnailUrl);

  await item.focus();
  await page.keyboard.press("ArrowUp");
  await page
    .locator('.tier-content[aria-label="B tier"]')
    .locator("..")
    .locator(".delete-tier")
    .click();

  await expect(item).toHaveCount(0);
  expect(
    await page.evaluate(() => window.__objectUrlEvents.revoked),
  ).toContain(thumbnailUrl);

  await uploadBatch(page, [svgFile("pagehide.svg")], "Images added: 1.");
  const pagehideUrl = await page
    .locator('.tier-item[alt="pagehide.svg"]')
    .getAttribute("data-thumbnail-url");

  await page.evaluate(() => {
    const event = new Event("pagehide");
    Object.defineProperty(event, "persisted", { value: true });
    window.dispatchEvent(event);
  });
  expect(
    await page.evaluate(() => window.__objectUrlEvents.revoked),
  ).not.toContain(pagehideUrl);

  await page.evaluate(() => {
    const event = new Event("pagehide");
    Object.defineProperty(event, "persisted", { value: false });
    window.dispatchEvent(event);
  });
  expect(
    await page.evaluate(() => window.__objectUrlEvents.revoked),
  ).toContain(pagehideUrl);
});

test("drag and touch endings always clear transient state", async ({ page }) => {
  await loadTierMaker(page);
  await uploadBatch(page, [svgFile("move.svg")], "Images added: 1.");

  const item = page.locator('.tier-item:not(.touch-ghost)[alt="move.svg"]');
  const destination = page.locator('.tier-content[aria-label="S tier"]');

  await item.evaluate((element) => {
    element.dispatchEvent(new DragEvent("dragstart", { bubbles: true }));
    element.dispatchEvent(new DragEvent("dragend", { bubbles: true }));
  });
  await destination.evaluate((element) => {
    element.dispatchEvent(new DragEvent("drop", { bubbles: true }));
  });
  expect(await item.evaluate((element) => element.parentElement?.id)).toBe(
    "poolContent",
  );

  await item.evaluate((element) => {
    element.dispatchEvent(new DragEvent("dragstart", { bubbles: true }));
  });
  await page.locator("body").evaluate((element) => {
    element.dispatchEvent(new DragEvent("drop", { bubbles: true }));
  });
  await destination.evaluate((element) => {
    element.dispatchEvent(new DragEvent("drop", { bubbles: true }));
  });
  expect(await item.evaluate((element) => element.parentElement?.id)).toBe(
    "poolContent",
  );

  await item.evaluate((element) => {
    const event = new Event("touchstart", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, "touches", {
      value: [{ clientX: 10, clientY: 10 }],
    });
    element.dispatchEvent(event);
  });

  const ghost = page.locator(".touch-ghost");
  await expect(ghost).toHaveAttribute("tabindex", "-1");
  await expect(ghost).toHaveAttribute("aria-hidden", "true");
  await expect(ghost).toHaveAttribute("draggable", "false");
  await expect(ghost).not.toHaveAttribute("role");

  await item.evaluate((element) => {
    element.dispatchEvent(new Event("touchcancel", { bubbles: true }));
  });
  await expect(ghost).toHaveCount(0);
  await expect(item).not.toHaveClass(/\bis-dragging\b/);

  await item.evaluate((element) => {
    const start = new Event("touchstart", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(start, "touches", {
      value: [{ clientX: 10, clientY: 10 }],
    });
    element.dispatchEvent(start);

    const end = new Event("touchend", { bubbles: true });
    Object.defineProperty(end, "changedTouches", { value: [] });
    element.dispatchEvent(end);
  });
  await expect(ghost).toHaveCount(0);
  await expect(item).not.toHaveClass(/\bis-dragging\b/);

  await item.evaluate((element) => {
    const start = new Event("touchstart", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(start, "touches", {
      value: [{ clientX: 10, clientY: 10 }],
    });
    element.dispatchEvent(start);

    const originalElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = () =>
      document.querySelector('.tier-content[aria-label="S tier"]');

    const end = new Event("touchend", { bubbles: true });
    Object.defineProperty(end, "changedTouches", {
      value: [{ clientX: 10, clientY: 10 }],
    });
    element.dispatchEvent(end);
    document.elementFromPoint = originalElementFromPoint;
  });
  expect(
    await item.evaluate((element) =>
      element.parentElement?.getAttribute("aria-label"),
    ),
  ).toBe("S tier");
  await expect(ghost).toHaveCount(0);
});

test("export is guarded and restores all temporary state after success", async ({
  page,
}) => {
  await installDownloadSpy(page);
  await mockHtml2canvas(
    page,
    `export default async function html2canvas(element, options) {
      window.__exportCalls = (window.__exportCalls || 0) + 1;
      const bounds = element.getBoundingClientRect();
      window.__exportCall = {
        elementId: element.id,
        backgroundColor: options.backgroundColor,
        optionKeys: Object.keys(options),
        width: bounds.width,
        height: bounds.height
      };
      await new Promise((resolve) => { window.__resolveExport = resolve; });
      return {
        toDataURL() {
          window.__serializedExport = true;
          return "data:image/png;base64,iVBORw0KGgo=";
        }
      };
    }`,
  );
  await loadTierMaker(page);

  const saveButton = page.locator("#saveBtn");
  const board = page.locator("#tierBoard");

  await saveButton.click();
  await expect(saveButton).toBeDisabled();
  await expect(saveButton).toHaveAttribute("aria-busy", "true");
  await expect(board).toHaveClass(/\bexporting\b/);
  await expect(page.locator(".tier-label-export")).toHaveCount(3);
  await expect
    .poll(() => page.evaluate(() => window.__exportCalls || 0))
    .toBe(1);

  await saveButton.evaluate((button) => button.click());
  expect(await page.evaluate(() => window.__exportCalls)).toBe(1);

  await page.evaluate(() => window.__resolveExport());
  await expect(page.locator("#tierStatus")).toHaveText(
    "PNG download started.",
  );

  await expect(saveButton).toBeEnabled();
  await expect(saveButton).not.toHaveAttribute("aria-busy");
  await expect(board).not.toHaveClass(/\bexporting\b/);
  await expect(page.locator(".tier-label-export")).toHaveCount(0);

  const exportCall = await page.evaluate(() => window.__exportCall);
  expect(exportCall).toMatchObject({
    elementId: "tierBoard",
    backgroundColor: "#000",
    optionKeys: ["backgroundColor"],
  });
  expect(exportCall.width).toBeGreaterThan(0);
  expect(exportCall.height).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__serializedExport)).toBe(true);
  expect(await page.evaluate(() => window.__tierDownload)).toEqual({
    download: "tier-list.png",
    href: "data:image/png;base64,iVBORw0KGgo=",
  });
});

const exportFailures = [
  {
    name: "module import",
    moduleBody:
      'throw new Error("import failed"); export default function html2canvas() {}',
  },
  {
    name: "canvas render",
    moduleBody:
      'export default async function html2canvas() { throw new Error("render failed"); }',
  },
  {
    name: "PNG serialization",
    moduleBody:
      'export default async function html2canvas() { return { toDataURL() { throw new Error("serialization failed"); } }; }',
  },
];

for (const failure of exportFailures) {
  test(`${failure.name} failure restores export state and reports the error`, async ({
    page,
  }) => {
    await mockHtml2canvas(page, failure.moduleBody);
    await loadTierMaker(page);

    const saveButton = page.locator("#saveBtn");
    const board = page.locator("#tierBoard");

    await saveButton.click();
    await expect(page.locator("#tierStatus")).toHaveText(
      "The PNG could not be created. Please try again.",
    );
    await expect(saveButton).toBeEnabled();
    await expect(saveButton).not.toHaveAttribute("aria-busy");
    await expect(board).not.toHaveClass(/\bexporting\b/);
    await expect(page.locator(".tier-label-export")).toHaveCount(0);
  });
}
