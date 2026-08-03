import { expect, test } from "@playwright/test";

const localOrigin = "http://127.0.0.1:4173";
const steamApiUrl = "https://api.huihui.dev/api/steam-library";
const locales = [
  {
    id: "zh",
    path: "/about/",
    copy: {
      label: "複製程式碼",
      success: "已複製程式碼",
      failure: "複製失敗，請手動選取並複製",
    },
    headings: [
      [1, "關於我"],
      [2, "興趣"],
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
    id: "en",
    path: "/en/about/",
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
    copy: {
      label: "コードをコピー",
      success: "コードをコピーしました",
      failure: "コードをコピーできませんでした。手動で選択してコピーしてください。",
    },
    headings: [
      [1, "私について"],
      [2, "趣味"],
      [3, "maimai でらっくす"],
      [4, "Favorite"],
      [4, "Best"],
      [3, "Arcaea"],
      [4, "Favorite"],
      [4, "Best"],
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

async function installClipboardStub(page, mode) {
  await page.addInitScript((initialMode) => {
    const state = {
      mode: initialMode,
      pending: [],
      writes: [],
    };

    Object.defineProperty(window, "__copyClipboard", {
      configurable: true,
      value: state,
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText(text) {
          state.writes.push(text);

          if (state.mode === "reject") {
            return Promise.reject(new DOMException("Fixture rejection", "NotAllowedError"));
          }

          if (state.mode === "pending") {
            return new Promise((resolve, reject) => {
              state.pending.push({ reject, resolve });
            });
          }

          return Promise.resolve();
        },
      },
    });
  }, mode);
}

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
  await expect(page.locator("#steamFavorites > .steam-error")).toHaveCount(1);

  return diagnostics;
}

async function focusWithTab(page, button) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    window.scrollTo(0, 0);
  });

  for (let index = 0; index < 30; index += 1) {
    await page.keyboard.press("Tab");

    if (await button.evaluate((element) => document.activeElement === element)) {
      return;
    }
  }

  throw new Error("Copy button was not reached with keyboard Tab navigation");
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
    test("copy success uses keyboard, localized name, status, and exact code", async ({
      page,
    }) => {
      const diagnostics = await loadAbout(page, locale);
      const button = page.getByRole("button", { name: locale.copy.label });
      const status = getStatus(button);
      const codeText = await page.locator("#profileCode").evaluate((code) => code.innerText);

      await expect(button).toHaveCount(1);
      await expect(button).toHaveAttribute("aria-label", locale.copy.label);
      await expect(status).toHaveAttribute("role", "status");
      await expect(status).toHaveAttribute("aria-live", "polite");
      await expect(status).toHaveAttribute("aria-atomic", "true");
      await expect(status).not.toHaveAttribute("hidden", "");
      expect(
        await status.evaluate((element) => ({
          display: getComputedStyle(element).display,
          height: getComputedStyle(element).height,
          visibility: getComputedStyle(element).visibility,
          width: getComputedStyle(element).width,
        })),
      ).toEqual({
        display: "block",
        height: "1px",
        visibility: "visible",
        width: "1px",
      });

      await focusWithTab(page, button);
      await expect(button).toBeFocused();
      await page.keyboard.press("Enter");

      await expect(status).toHaveText(locale.copy.success);
      expect(
        await page.evaluate(() => window.__copyClipboard.writes.at(-1)),
      ).toBe(codeText);
      await expect(button).toBeFocused();
      await expect(button).toHaveAccessibleName(locale.copy.label);
      await expectNoDiagnostics(diagnostics);
    });

    test("copy rejection is localized, non-blocking, focus-safe, and clears stale state", async ({
      page,
    }) => {
      const diagnostics = await loadAbout(page, locale, "reject");
      const button = page.getByRole("button", { name: locale.copy.label });
      const status = getStatus(button);

      await button.focus();
      await page.keyboard.press("Enter");
      await expect(status).toHaveText(locale.copy.failure);
      await expect(button).toBeFocused();
      await expect(button).toHaveAccessibleName(locale.copy.label);

      await page.evaluate(() => {
        window.__copyClipboard.mode = "pending";
      });
      await page.keyboard.press("Enter");
      await expect(status).toHaveText("");
      await expect
        .poll(() => page.evaluate(() => window.__copyClipboard.pending.length))
        .toBe(1);
      await page.evaluate(() => {
        window.__copyClipboard.pending.shift().resolve();
      });
      await expect(status).toHaveText(locale.copy.success);
      await expect(button).toBeFocused();
      await expectNoDiagnostics(diagnostics);
    });

    test("multiple controls keep local status, headings, styles, and viewport containment", async ({
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
      const firstStatus = getStatus(buttons.nth(0));
      const secondStatus = getStatus(buttons.nth(1));
      await expect(buttons).toHaveCount(2);
      await buttons.nth(1).click();
      await expect(secondStatus).toHaveText(locale.copy.success);
      await expect(firstStatus).toHaveText("");
      expect(
        await page.evaluate(() => window.__copyClipboard.writes.at(-1)),
      ).toBe('print("second block")');

      await buttons.nth(0).click();
      await expect(firstStatus).toHaveText(locale.copy.success);
      await expect(secondStatus).toHaveText(locale.copy.success);

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

      expect(await getHeadingStyles(page)).toEqual(expectedHeadingStyles.desktop);
      await expectNoHorizontalOverflow(page);

      await page.setViewportSize({ width: 390, height: 844 });
      expect(await getHeadingStyles(page)).toEqual(expectedHeadingStyles.mobile);
      await expectNoHorizontalOverflow(page);
      await expectNoDiagnostics(diagnostics);
    });
  });
}
