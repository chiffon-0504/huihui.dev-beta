import { expect, test } from "@playwright/test";

const imageBuffer = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

const locales = [
  {
    route: "/tools/tier-maker/",
    upload: "上傳照片",
    toolbar: "分級表製作器控制項",
    imageSize: "圖片大小",
    tierName: "等級名稱",
    tierColor: "等級顏色",
    pool: "待排序",
    instructions:
      "使用左右方向鍵調整圖片在目前區域中的順序，使用上下方向鍵在各等級與待排序區之間移動。",
    tierLabel: (name) => `${name} 等級`,
    deleteLabel: (name) => `刪除 ${name} 等級`,
    newTier: "新等級",
    announcement: "sample.png 已移至 B 等級，位置 1 / 1。",
  },
  {
    route: "/en/tools/tier-maker/",
    upload: "Upload Images",
    toolbar: "Tier Maker controls",
    imageSize: "Image Size",
    tierName: "Tier name",
    tierColor: "Tier color",
    pool: "Unsorted",
    instructions:
      "Use Left and Right Arrow to reorder this image. Use Up and Down Arrow to move it between tiers and Unsorted.",
    tierLabel: (name) => `${name} tier`,
    deleteLabel: (name) => `Delete ${name} tier`,
    newTier: "NEW",
    announcement: "sample.png moved to B tier, position 1 of 1.",
  },
  {
    route: "/ja/tools/tier-maker/",
    upload: "画像をアップロード",
    toolbar: "Tier Maker コントロール",
    imageSize: "画像サイズ",
    tierName: "ランク名",
    tierColor: "ランク色",
    pool: "未分類",
    instructions:
      "左右の矢印キーで現在の領域内の順序を変更し、上下の矢印キーで各ランクと未分類の間を移動します。",
    tierLabel: (name) => `${name} ランク`,
    deleteLabel: (name) => `${name} ランクを削除`,
    newTier: "新規",
    announcement: "sample.png を B ランク に移動しました。位置 1 / 1。",
  },
];

async function loadTierMaker(page, route = "/en/tools/tier-maker/") {
  const response = await page.goto(route, { waitUntil: "load" });

  expect(response?.status()).toBe(200);
}

async function uploadImage(page, name) {
  await page.locator("#imageUpload").setInputFiles({
    name,
    mimeType: "image/png",
    buffer: imageBuffer,
  });

  const item = page.locator(`.tier-item[alt="${name}"]`);
  await expect(item).toHaveCount(1);
  return item;
}

for (const locale of locales) {
  test(`${locale.route} exposes localized controls and keyboard movement`, async ({
    page,
  }) => {
    await loadTierMaker(page, locale.route);

    const uploadButton = page.getByRole("button", { name: locale.upload });
    const firstRow = page.locator(".tier-row").first();

    await expect(uploadButton).toHaveAttribute("id", "uploadBtn");
    await uploadButton.focus();
    await expect(uploadButton).toBeFocused();
    await expect(page.locator(".tier-toolbar")).toHaveAttribute(
      "aria-label",
      locale.toolbar,
    );
    await expect(page.locator("#sizeSlider")).toHaveAttribute(
      "aria-label",
      locale.imageSize,
    );
    await expect(firstRow.locator(".tier-label")).toHaveAttribute(
      "aria-label",
      locale.tierName,
    );
    await expect(firstRow.locator(".tier-color")).toHaveAttribute(
      "aria-label",
      locale.tierColor,
    );
    await expect(firstRow.locator(".tier-content")).toHaveAttribute(
      "aria-label",
      locale.tierLabel("S"),
    );
    await expect(firstRow.locator(".delete-tier")).toHaveAttribute(
      "aria-label",
      locale.deleteLabel("S"),
    );
    await expect(page.locator("#poolContent")).toHaveAttribute(
      "aria-label",
      locale.pool,
    );
    await expect(page.locator("#tierKeyboardInstructions")).toHaveText(
      locale.instructions,
    );

    const fileChooserPromise = page.waitForEvent("filechooser");
    await uploadButton.press("Enter");
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: "sample.png",
      mimeType: "image/png",
      buffer: imageBuffer,
    });
    const item = page.locator('.tier-item[alt="sample.png"]');
    await expect(item).toHaveCount(1);

    await expect(item).toHaveAttribute("role", "listitem");
    await expect(item).toHaveAttribute("tabindex", "0");
    await expect(item).toHaveAttribute(
      "aria-describedby",
      "tierKeyboardInstructions",
    );
    await expect(item).toHaveAttribute(
      "aria-keyshortcuts",
      "ArrowLeft ArrowRight ArrowUp ArrowDown",
    );

    await item.focus();
    await page.keyboard.press("ArrowUp");

    await expect(item).toBeFocused();
    expect(
      await item.evaluate((element) =>
        element.parentElement?.getAttribute("aria-label"),
      ),
    ).toBe(locale.tierLabel("B"));
    await expect(page.locator("#tierMoveStatus")).toHaveText(
      locale.announcement,
    );

    const tierName = firstRow.locator(".tier-label");
    await tierName.fill("Top");
    await expect(firstRow.locator(".tier-content")).toHaveAttribute(
      "aria-label",
      locale.tierLabel("Top"),
    );
    await expect(firstRow.locator(".delete-tier")).toHaveAttribute(
      "aria-label",
      locale.deleteLabel("Top"),
    );

    await page.locator("#addTierBtn").click();
    const newRow = page.locator(".tier-row").last();
    await expect(newRow.locator(".tier-label")).toHaveValue(locale.newTier);
    await expect(newRow.locator(".tier-content")).toHaveAttribute(
      "aria-label",
      locale.tierLabel(locale.newTier),
    );
    await expect(newRow.locator(".delete-tier")).toHaveAttribute(
      "aria-label",
      locale.deleteLabel(locale.newTier),
    );
  });
}

test("arrow keys reorder items and move through tier zones without losing focus", async ({
  page,
}) => {
  await loadTierMaker(page);
  const alpha = await uploadImage(page, "alpha.png");
  const beta = await uploadImage(page, "beta.png");
  const poolItems = page.locator("#poolContent > .tier-item");

  await beta.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(poolItems.nth(0)).toHaveAttribute("alt", "beta.png");
  await expect(beta).toBeFocused();
  await expect(page.locator("#tierMoveStatus")).toHaveText(
    "beta.png moved to Unsorted, position 1 of 2.",
  );

  await page.keyboard.press("ArrowRight");
  await expect(poolItems.nth(1)).toHaveAttribute("alt", "beta.png");
  await expect(beta).toBeFocused();

  for (const expectedTier of ["B tier", "A tier", "S tier"]) {
    await page.keyboard.press("ArrowUp");
    expect(
      await beta.evaluate((element) =>
        element.parentElement?.getAttribute("aria-label"),
      ),
    ).toBe(expectedTier);
    await expect(beta).toBeFocused();
  }

  await page.keyboard.press("ArrowUp");
  expect(
    await beta.evaluate((element) =>
      element.parentElement?.getAttribute("aria-label"),
    ),
  ).toBe("S tier");
  await expect(beta).toBeFocused();

  await page.keyboard.press("ArrowDown");
  expect(
    await beta.evaluate((element) =>
      element.parentElement?.getAttribute("aria-label"),
    ),
  ).toBe("A tier");
  await expect(alpha).toHaveAttribute("alt", "alpha.png");
});

test("Tier Maker controls and items expose visible keyboard focus", async ({ page }) => {
  await loadTierMaker(page);
  const item = await uploadImage(page, "focus.png");
  const controls = [
    page.locator("#saveBtn"),
    page.locator("#addTierBtn"),
    page.locator("#uploadBtn"),
    page.locator("#sizeSlider"),
    page.locator(".tier-label").first(),
    page.locator(".delete-tier").first(),
    item,
  ];

  for (const control of controls) {
    await control.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(control).toBeFocused();
    expect(await control.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe(
      "none",
    );
  }

  const colorInput = page.locator(".tier-color").first();
  const colorWrap = colorInput.locator("..");
  await colorInput.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(colorInput).toBeFocused();
  expect(await colorWrap.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe(
    "none",
  );
});

test("pointer drag-and-drop still moves uploaded images between zones", async ({
  page,
}) => {
  await loadTierMaker(page);
  const item = await uploadImage(page, "drag.png");
  const destination = page.locator('.tier-content[aria-label="S tier"]');

  await item.evaluate((element) => {
    element.dispatchEvent(new DragEvent("dragstart", { bubbles: true }));
  });
  await destination.evaluate((element) => {
    element.dispatchEvent(new DragEvent("drop", { bubbles: true }));
  });

  expect(
    await item.evaluate((element) =>
      element.parentElement?.getAttribute("aria-label"),
    ),
  ).toBe("S tier");
});
