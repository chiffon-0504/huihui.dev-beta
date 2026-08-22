import { expect, test } from "@playwright/test";
import { installClipboardStub } from "../support/clipboard-stub.mjs";

const localOrigin = "http://127.0.0.1:4173";
const steamApiUrl = "https://api.huihui.dev/api/steam-library";
const locales = [
  {
    id: "zh",
    path: "/about/",
    editorLabel: "huihuidev.py 原始碼",
    workspaceLabel: "huihuidev.py 個人檔案程式碼工作區",
    copy: {
      label: "複製程式碼",
      success: "已複製程式碼",
      failure: "複製失敗，請手動選取並複製",
    },
    headings: [
      [1, "關於我"],
      [2, "興趣"],
      [3, "maimai DX"],
      [4, "最愛"],
      [4, "最佳成績"],
      [3, "Arcaea"],
      [4, "最愛"],
      [4, "最佳成績"],
      [3, "Galgame"],
    ],
  },
  {
    id: "en",
    path: "/en/about/",
    editorLabel: "huihuidev.py source code",
    workspaceLabel: "huihuidev.py profile code workspace",
    copy: {
      label: "Copy code",
      success: "Code copied",
      failure: "Could not copy code. Select and copy it manually.",
    },
    headings: [
      [1, "About Me"],
      [2, "Interests"],
      [3, "maimai DX"],
      [4, "Favorite"],
      [4, "Best"],
      [3, "Arcaea"],
      [4, "Favorite"],
      [4, "Best"],
      [3, "Galgame"],
    ],
  },
  {
    id: "ja",
    path: "/ja/about/",
    editorLabel: "huihuidev.py ソースコード",
    workspaceLabel: "huihuidev.py プロフィールコードのワークスペース",
    copy: {
      label: "コードをコピー",
      success: "コードをコピーしました",
      failure: "コードをコピーできませんでした。手動で選択してコピーしてください。",
    },
    headings: [
      [1, "私について"],
      [2, "趣味"],
      [3, "maimai でらっくす"],
      [4, "お気に入り"],
      [4, "ベスト"],
      [3, "Arcaea"],
      [4, "お気に入り"],
      [4, "ベスト"],
      [3, "美少女ゲーム"],
    ],
  },
];
const expectedHeadingStyles = {
  desktop: {
    card: {
      color: "rgba(10, 15, 25, 0.94)",
      fontSize: "43.2px",
      fontWeight: "700",
      letterSpacing: "-0.16px",
      lineHeight: "46.656px",
      marginBottom: "18px",
      marginLeft: "0px",
      marginRight: "0px",
      marginTop: "0px",
    },
    child: {
      color: "rgba(10, 15, 25, 0.94)",
      fontSize: "16px",
      fontWeight: "700",
      letterSpacing: "-0.16px",
      lineHeight: "normal",
      marginBottom: "0px",
      marginLeft: "0px",
      marginRight: "0px",
      marginTop: "0px",
    },
  },
  mobile: {
    card: {
      color: "rgba(10, 15, 25, 0.94)",
      fontSize: "32px",
      fontWeight: "700",
      letterSpacing: "-0.16px",
      lineHeight: "34.56px",
      marginBottom: "18px",
      marginLeft: "0px",
      marginRight: "0px",
      marginTop: "0px",
    },
    child: {
      color: "rgba(10, 15, 25, 0.94)",
      fontSize: "16px",
      fontWeight: "700",
      letterSpacing: "-0.16px",
      lineHeight: "normal",
      marginBottom: "0px",
      marginLeft: "0px",
      marginRight: "0px",
      marginTop: "0px",
    },
  },
};
const cardStyleTolerances = {
  fontSize: 0.001,
  lineHeight: 0.01,
};
const cssPixelStringPattern = /^-?(?:\d+(?:\.\d+)?|\.\d+)px$/;

function expectCssPixelString(actual, expected, tolerance) {
  expect(actual).toMatch(cssPixelStringPattern);
  expect(expected).toMatch(cssPixelStringPattern);

  const actualPixels = Number.parseFloat(actual);
  const expectedPixels = Number.parseFloat(expected);
  const floatingPointSlack =
    Number.EPSILON * Math.max(1, Math.abs(actualPixels), Math.abs(expectedPixels));

  expect(Math.abs(actualPixels - expectedPixels)).toBeLessThanOrEqual(
    tolerance + floatingPointSlack,
  );
}

test("About card CSS pixel tolerances stay narrow and reject non-px values", () => {
  expectCssPixelString("43.199997px", "43.2px", cardStyleTolerances.fontSize);
  expectCssPixelString("43.199px", "43.2px", cardStyleTolerances.fontSize);
  expect(() =>
    expectCssPixelString("43.198px", "43.2px", cardStyleTolerances.fontSize),
  ).toThrow();

  expectCssPixelString("46.65px", "46.656px", cardStyleTolerances.lineHeight);
  expectCssPixelString("46.646px", "46.656px", cardStyleTolerances.lineHeight);
  expectCssPixelString("34.5667px", "34.56px", cardStyleTolerances.lineHeight);
  expect(() =>
    expectCssPixelString("46.645px", "46.656px", cardStyleTolerances.lineHeight),
  ).toThrow();

  for (const invalidValue of ["43.2%", "2.7em", "2.7rem", "normal", "43.2"])
    expect(() =>
      expectCssPixelString(
        invalidValue,
        "43.2px",
        cardStyleTolerances.fontSize,
      ),
    ).toThrow();
});

function watchPage(page) {
  const diagnostics = {
    consoleErrors: [],
    dialogs: [],
    missingLocalResources: [],
    pageErrors: [],
    unexpectedExternalRequests: [],
  };

  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.consoleErrors.push(message.text());
  });
  page.on("dialog", async (dialog) => {
    diagnostics.dialogs.push(`${dialog.type()}: ${dialog.message()}`);
    await dialog.dismiss();
  });
  page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());

    if (url.origin !== localOrigin && request.url() !== steamApiUrl) {
      diagnostics.unexpectedExternalRequests.push(request.url());
    }
  });
  page.on("response", (response) => {
    const url = new URL(response.url());

    if (url.origin === localOrigin && response.status() === 404) {
      diagnostics.missingLocalResources.push(url.pathname);
    }
  });

  return diagnostics;
}

async function loadAbout(page, locale, clipboardMode = "resolve") {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installClipboardStub(page, clipboardMode);
  await page.route(steamApiUrl, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "[]",
    }),
  );
  const diagnostics = watchPage(page);
  const response = await page.goto(locale.path, { waitUntil: "load" });

  expect(response?.status()).toBe(200);
  await expect(page.locator("#aboutPage .code-block")).toHaveCount(1);
  await expect(page.locator("#steamFavorites > .steam-empty")).toHaveCount(1);

  return diagnostics;
}

function getStatus(button) {
  return button.locator("xpath=../span[contains(@class, 'code-copy-status')]");
}

async function expectNoDiagnostics(diagnostics) {
  expect(diagnostics.consoleErrors).toEqual([]);
  expect(diagnostics.dialogs).toEqual([]);
  expect(diagnostics.missingLocalResources).toEqual([]);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(diagnostics.unexpectedExternalRequests).toEqual([]);
}

async function getHeadingStyles(page) {
  return page.evaluate(() => {
    const readStyles = (selector) => {
      const element = document.querySelector(selector);
      const style = getComputedStyle(element);

      return {
        color: style.color,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        letterSpacing: style.letterSpacing,
        lineHeight: style.lineHeight,
        marginBottom: style.marginBottom,
        marginLeft: style.marginLeft,
        marginRight: style.marginRight,
        marginTop: style.marginTop,
      };
    };

    return {
      card: readStyles(".interest-card > h3"),
      child: readStyles(".rhythm-record-text h4"),
    };
  });
}

async function expectNoHorizontalOverflow(page) {
  const geometry = await page.evaluate(() => ({
    bodyScrollWidth: document.body.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    mainRight: document.querySelector("main").getBoundingClientRect().right,
  }));

  expect(geometry.documentScrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
  expect(geometry.bodyScrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
  expect(geometry.mainRight).toBeLessThanOrEqual(geometry.clientWidth + 1);
}

for (const locale of locales) {
  test.describe(`${locale.id} About accessibility`, () => {
    test("workspace exposes localized regions and selectable profile text", async ({
      page,
    }) => {
      const diagnostics = await loadAbout(page, locale);
      const workspace = page.getByRole("region", { name: locale.workspaceLabel });
      const editor = page.getByRole("region", { name: locale.editorLabel });
      const code = page.locator("#profileCode");

      await expect(workspace).toHaveAttribute("data-vscode-ready", "true");
      await expect(editor).toHaveCount(1);
      await expect(code).toContainText("class HuiHui");
      expect(
        await code.evaluate((element) => {
          const range = document.createRange();
          const selection = window.getSelection();

          range.selectNodeContents(element);
          selection.removeAllRanges();
          selection.addRange(range);
          const selectedText = selection.toString().trim();
          selection.removeAllRanges();

          return selectedText.length;
        }),
      ).toBeGreaterThan(0);
      await expect(
        page.getByRole("button", { name: locale.copy.label }),
      ).toHaveCount(0);
      await expectNoDiagnostics(diagnostics);
    });

    test("an added shared code block keeps copy behavior, headings, styles, and containment", async ({
      page,
    }) => {
      const diagnostics = await loadAbout(page, locale);

      await page.evaluate(() => {
        const pre = document.createElement("pre");
        const code = document.createElement("code");
        pre.className = "code-auto";
        code.className = "language-python";
        code.textContent = 'print("second block")';
        pre.append(code);
        document.querySelector("#aboutPage .page-body section").before(pre);
        initCodeBlocks();
        rebuildAboutCodeLineNumbers();
      });

      const buttons = page.getByRole("button", { name: locale.copy.label });
      const status = getStatus(buttons.first());
      const workspaceCopyButton = page.locator(".vscode-window .copy-btn");

      await expect(buttons).toHaveCount(1);
      await expect(workspaceCopyButton).toHaveAttribute("aria-hidden", "true");
      await expect(workspaceCopyButton).toHaveAttribute("tabindex", "-1");
      await expect(workspaceCopyButton).toBeHidden();
      await buttons.click();
      await expect(status).toHaveText(locale.copy.success);
      expect(
        await page.evaluate(() => window.__copyClipboard.writes.at(-1)),
      ).toBe('print("second block")');

      const headings = await page.locator("#aboutPage h1, #aboutPage h2, #aboutPage h3, #aboutPage h4, #aboutPage h5, #aboutPage h6").evaluateAll(
        (elements) =>
          elements.map((element) => [
            Number(element.tagName.slice(1)),
            element.textContent.trim(),
          ]),
      );
      expect(headings).toEqual(locale.headings);
      expect(
        headings.every(
          ([level], index) => index === 0 || level - headings[index - 1][0] <= 1,
        ),
      ).toBe(true);
      await expect(page.locator("#aboutPage h1[data-i18n='about.title']")).toHaveCount(1);
      await expect(page.locator("#aboutPage h2[data-i18n='about.interests']")).toHaveCount(1);
      await expect(page.locator("#aboutPage .interest-card > h3")).toHaveCount(3);
      await expect(page.locator("#aboutPage .rhythm-record-text > h4")).toHaveCount(4);
      await expect(page.locator("#aboutPage .rhythm-title-link")).toHaveText(
        locale.headings[2][1],
      );
      await expect(page.locator("#aboutPage .arcaea-title-link")).toHaveText("Arcaea");

      const desktopStyles = await getHeadingStyles(page);
      const {
        fontSize: desktopCardFontSize,
        lineHeight: desktopCardLineHeight,
        ...desktopCardStrictStyles
      } = desktopStyles.card;
      const {
        fontSize: expectedDesktopCardFontSize,
        lineHeight: expectedDesktopCardLineHeight,
        ...expectedDesktopCardStrictStyles
      } = expectedHeadingStyles.desktop.card;

      expect(desktopCardStrictStyles).toEqual(expectedDesktopCardStrictStyles);
      expect(desktopStyles.child).toEqual(expectedHeadingStyles.desktop.child);
      expectCssPixelString(
        desktopCardFontSize,
        expectedDesktopCardFontSize,
        cardStyleTolerances.fontSize,
      );
      expectCssPixelString(
        desktopCardLineHeight,
        expectedDesktopCardLineHeight,
        cardStyleTolerances.lineHeight,
      );
      await expectNoHorizontalOverflow(page);

      await page.setViewportSize({ width: 390, height: 844 });
      const mobileStyles = await getHeadingStyles(page);
      const {
        lineHeight: mobileCardLineHeight,
        ...mobileCardStrictStyles
      } = mobileStyles.card;
      const {
        lineHeight: expectedMobileCardLineHeight,
        ...expectedMobileCardStrictStyles
      } = expectedHeadingStyles.mobile.card;

      expect(mobileCardStrictStyles).toEqual(expectedMobileCardStrictStyles);
      expect(mobileStyles.child).toEqual(expectedHeadingStyles.mobile.child);
      expectCssPixelString(
        mobileCardLineHeight,
        expectedMobileCardLineHeight,
        cardStyleTolerances.lineHeight,
      );
      await expectNoHorizontalOverflow(page);
      await expectNoDiagnostics(diagnostics);
    });
  });
}
