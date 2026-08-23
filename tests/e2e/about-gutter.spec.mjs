import { expect, test } from "@playwright/test";

function expectCssPixels(actual, expected) {
  const tolerance = 0.001;
  const floatingPointSlack =
    Number.EPSILON * Math.max(1, Math.abs(actual), Math.abs(expected));

  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(
    tolerance + floatingPointSlack,
  );
}

test("CSS pixel tolerance preserves its floating-point boundary", () => {
  expectCssPixels(70.399, 70.4);
  expect(() => expectCssPixels(70.3989, 70.4)).toThrow();
});

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
    const editor = wrapper.querySelector(".vscode-editor-scroll");
    const gutter = wrapper.querySelector(
      ".vscode-editor-scroll > .custom-line-numbers",
    );
    const preStyle = getComputedStyle(pre);
    const editorStyle = getComputedStyle(editor);
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
      editorOverflowX: editorStyle.overflowX,
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
      preOverflowX: preStyle.overflowX,
      prePaddingLeft: Number.parseFloat(preStyle.paddingLeft),
      wrapperPosition: wrapperStyle.position,
    };
  });
}

test("desktop About code gutter preserves its geometry and line alignment", async ({
  browserName,
  page,
}) => {
  await loadAbout(page, 1440, 900);

  const geometry = await getGutterGeometry(page);
  expect(geometry).toMatchObject({
    codeStartsAfterGutter: true,
    editorOverflowX: "auto",
    gutterLeft: 8,
    gutterPaddingRight: 10,
    gutterTop: 4,
    lineHeightsMatch: true,
    preOverflowX: "visible",
    wrapperPosition: "sticky",
  });
  expectCssPixels(
    geometry.gutterWidth,
    browserName === "firefox" ? 42.4 : 42.3906,
  );
  expectCssPixels(geometry.prePaddingLeft, 68);
  expect(geometry.lineCount).toBe(geometry.expectedLineCount);
});

test("mobile About code gutter preserves its compact geometry and line alignment", async ({
  browserName,
  page,
}) => {
  await loadAbout(page, 390, 844);

  const geometry = await getGutterGeometry(page);
  expect(geometry).toMatchObject({
    codeStartsAfterGutter: true,
    editorOverflowX: "auto",
    gutterLeft: 5.6,
    gutterPaddingRight: 8,
    lineHeightsMatch: true,
    preOverflowX: "visible",
    wrapperPosition: "sticky",
  });
  expectCssPixels(
    geometry.gutterWidth,
    browserName === "firefox" ? 37.6 : 37.5938,
  );
  expectCssPixels(geometry.gutterTop, 12);
  expectCssPixels(geometry.prePaddingLeft, 53.6);
  expect(geometry.lineCount).toBe(geometry.expectedLineCount);
});
