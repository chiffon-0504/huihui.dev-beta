import { expect, test } from "@playwright/test";

async function stubAboutDependencies(page) {
  await page.route("https://api.huihui.dev/api/steam-library", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, games: [] }),
    }),
  );
}

async function loadAbout(page, width, height) {
  await page.setViewportSize({ width, height });
  await stubAboutDependencies(page);
  const response = await page.goto("/en/about/", { waitUntil: "load" });

  expect(response?.status()).toBe(200);
  await expect(page.locator(".code-block.code-block-with-gutter")).toHaveCount(1);
  await expect(page.locator(".custom-line-numbers")).toBeVisible();
}

async function getGutterGeometry(page) {
  return page.locator(".code-block.code-block-with-gutter").evaluate((wrapper) => {
    const pre = wrapper.querySelector('pre[class*="language-"]');
    const code = pre?.querySelector('code[class*="language-"]');
    const gutter = wrapper.querySelector(":scope > .custom-line-numbers");
    const preStyle = getComputedStyle(pre);
    const gutterStyle = getComputedStyle(gutter);
    const wrapperStyle = getComputedStyle(wrapper);
    const codeRect = code.getBoundingClientRect();
    const gutterRect = gutter.getBoundingClientRect();
    const expectedLineCount = Math.max(
      code.textContent.replace(/\n$/, "").split("\n").length,
      1,
    );

    return {
      codeStartsAfterGutter: codeRect.left > gutterRect.right,
      expectedLineCount,
      gutterLeft: Number.parseFloat(gutterStyle.left),
      gutterPaddingRight: Number.parseFloat(gutterStyle.paddingRight),
      gutterTop: Number.parseFloat(gutterStyle.top),
      gutterWidth: Number.parseFloat(gutterStyle.width),
      lineCount: gutter.children.length,
      lineHeightsMatch:
        Math.abs(
          Number.parseFloat(getComputedStyle(code).lineHeight) -
            Number.parseFloat(gutterStyle.lineHeight),
        ) < 0.05,
      overflowX: preStyle.overflowX,
      prePaddingLeft: Number.parseFloat(preStyle.paddingLeft),
      wrapperPosition: wrapperStyle.position,
    };
  });
}

test("desktop About code gutter preserves its geometry and line alignment", async ({
  page,
}) => {
  await loadAbout(page, 1440, 900);

  const geometry = await getGutterGeometry(page);
  expect(geometry).toMatchObject({
    codeStartsAfterGutter: true,
    gutterLeft: 21.6,
    gutterPaddingRight: 13.6,
    gutterTop: 100,
    gutterWidth: 40,
    lineHeightsMatch: true,
    overflowX: "auto",
    prePaddingLeft: 70.4,
    wrapperPosition: "relative",
  });
  expect(geometry.lineCount).toBe(geometry.expectedLineCount);
});

test("mobile About code gutter preserves its compact geometry and line alignment", async ({
  page,
}) => {
  await loadAbout(page, 390, 844);

  const geometry = await getGutterGeometry(page);
  expect(geometry).toMatchObject({
    codeStartsAfterGutter: true,
    gutterLeft: 12.8,
    gutterPaddingRight: 8,
    gutterTop: 80.8,
    gutterWidth: 28,
    lineHeightsMatch: true,
    overflowX: "auto",
    prePaddingLeft: 50.4,
    wrapperPosition: "relative",
  });
  expect(geometry.lineCount).toBe(geometry.expectedLineCount);
});
