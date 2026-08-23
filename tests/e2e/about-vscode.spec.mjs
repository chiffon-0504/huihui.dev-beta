import { expect, test } from "@playwright/test";

const STEAM_API_URL = "https://api.huihui.dev/api/steam-library";
const CUSTOM_PROFILE_COLORS = {
  "kw-blue": "rgb(51, 170, 255)",
  "kw-red": "rgb(255, 95, 86)",
  "kw-reddishpurple": "rgb(136, 17, 68)",
  "kw-togeari-eari": "rgb(238, 218, 1)",
  "kw-togeari-tog": "rgb(227, 77, 141)",
  "kw-togenashi-ena": "rgb(133, 201, 220)",
  "kw-togenashi-shi": "rgb(118, 189, 83)",
  "kw-togenashi-tog": "rgb(217, 14, 44)",
};
const RESPONSIVE_STICKY_VIEWPORTS = [1201, 1200, 901, 900, 899, 721, 720, 430, 390];

async function loadAbout(
  page,
  viewport = { width: 1440, height: 900 },
  route = "/en/about/",
) {
  await page.setViewportSize(viewport);
  await page.route(STEAM_API_URL, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, games: [] }),
    }),
  );
  const response = await page.goto(route, { waitUntil: "load" });

  expect(response?.status()).toBe(200);
  await expect(page.locator(".vscode-window[data-vscode-ready='true']")).toHaveCount(1);
  await expect(
    page.locator(".vscode-scroll-stage[data-scroll-stage-ready='true']"),
  ).toHaveCount(1);
  await expect(page.locator(".vscode-editor-scroll > .custom-line-numbers")).toBeVisible();
}

async function waitForStageGeometry(page) {
  await page.locator(".vscode-scroll-stage").evaluate(
    (stage) =>
      new Promise((resolve) => {
        const workspace = stage.querySelector(".vscode-window");
        const editor = stage.querySelector(".vscode-editor-scroll");
        let previousSignature = "";
        let stableFrames = 0;

        const check = () => {
          const distance = Number(stage.dataset.scrollStageDistance);
          const editorMax = editor.scrollHeight - editor.clientHeight;
          const stageHeight = stage.getBoundingClientRect().height;
          const workspaceHeight = workspace.getBoundingClientRect().height;
          const signature = [distance, editorMax, stageHeight, workspaceHeight].join("|");
          const geometryMatches =
            distance === editorMax &&
            Math.abs(stageHeight - workspaceHeight - distance) <= 1;

          stableFrames =
            geometryMatches && signature === previousSignature ? stableFrames + 1 : 0;
          previousSignature = signature;

          if (stableFrames >= 8) {
            resolve();
            return;
          }

          requestAnimationFrame(check);
        };

        requestAnimationFrame(check);
      }),
  );
}

async function getStageMetrics(page) {
  return page.evaluate(() => {
    const stage = document.querySelector(".vscode-scroll-stage");
    const workspace = document.querySelector(".vscode-window");
    const editor = document.querySelector(".vscode-editor-scroll");

    return {
      distance: Number(stage.dataset.scrollStageDistance),
      editorClientHeight: editor.clientHeight,
      editorScrollHeight: editor.scrollHeight,
      maxEditorScroll: editor.scrollHeight - editor.clientHeight,
      stageHeight: stage.getBoundingClientRect().height,
      stageStart: Number(stage.dataset.scrollStageStart),
      stickyTop: Number.parseFloat(getComputedStyle(workspace).top),
      workspaceHeight: workspace.getBoundingClientRect().height,
    };
  });
}

async function setDocumentScroll(page, scrollY) {
  await page.evaluate((nextScrollY) => {
    document.documentElement.scrollTop = nextScrollY;
  }, scrollY);
  await expect
    .poll(() => page.evaluate((expected) => Math.abs(window.scrollY - expected), scrollY))
    .toBeLessThanOrEqual(1);
}

async function expectEditorScroll(page, expected) {
  await expect
    .poll(() =>
      page
        .locator(".vscode-editor-scroll")
        .evaluate((element, target) => Math.abs(element.scrollTop - target), expected),
    )
    .toBeLessThanOrEqual(1.5);
}

async function expectEditorMatchesDocumentScroll(page, metrics) {
  await expect
    .poll(() =>
      page.evaluate(({ maxEditorScroll, stageStart }) => {
        const editor = document.querySelector(".vscode-editor-scroll");
        const expected = Math.max(
          0,
          Math.min(window.scrollY - stageStart, maxEditorScroll),
        );

        return Math.abs(editor.scrollTop - expected);
      }, metrics),
    )
    .toBeLessThanOrEqual(1.5);
}

async function waitForDocumentScrollToSettle(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        let previousScrollY = window.scrollY;
        let stableFrames = 0;

        const check = () => {
          if (Math.abs(window.scrollY - previousScrollY) <= 0.5) {
            stableFrames += 1;
          } else {
            stableFrames = 0;
            previousScrollY = window.scrollY;
          }

          if (stableFrames >= 4) {
            resolve();
            return;
          }

          requestAnimationFrame(check);
        };

        requestAnimationFrame(check);
      }),
  );
}

async function getPanelPositions(page) {
  return page.evaluate(() => {
    const selectors = [
      ".vscode-explorer",
      ".vscode-tabbar",
      ".vscode-breadcrumb",
      ".vscode-terminal",
      ".vscode-statusbar",
    ];

    return Object.fromEntries(
      selectors.map((selector) => {
        const rect = document.querySelector(selector).getBoundingClientRect();
        return [selector, { left: rect.left, top: rect.top }];
      }),
    );
  });
}

test("desktop workspace preserves complete VS Code chrome and sticky geometry", async ({
  page,
}) => {
  await loadAbout(page);

  await expect(page.locator(".vscode-explorer")).toBeVisible();
  await expect(page.locator(".vscode-tree-row")).toHaveCount(23);
  await expect(page.locator(".vscode-terminal")).toBeVisible();
  await expect(page.locator(".vscode-statusbar")).toBeVisible();
  await expect(page.locator("#profileCode .token.keyword").first()).toBeVisible();
  await expect(page.locator("#profileCode")).toContainText("class HuiHui");

  const layout = await page.evaluate(() => {
    const readRect = (selector) => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return {
        bottom: rect.bottom,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        width: rect.width,
      };
    };
    const editor = document.querySelector(".vscode-editor-scroll");
    const pre = editor.querySelector('pre[class*="language-"]');
    const explorer = document.querySelector(".vscode-explorer");
    const activity = document.querySelector(".vscode-activity-bar");
    const component = document.querySelector(".vscode-window");
    const stage = document.querySelector(".vscode-scroll-stage");

    return {
      component: readRect(".vscode-window"),
      activity: readRect(".vscode-activity-bar"),
      activeTab: readRect(".vscode-tabbar .code-left"),
      breadcrumb: readRect(".vscode-breadcrumb"),
      copyButton: readRect(".copy-btn"),
      editor: {
        ...readRect(".vscode-editor-scroll"),
        clientHeight: editor.clientHeight,
        currentLineBackground: getComputedStyle(pre, "::before").backgroundColor,
        overflowY: getComputedStyle(editor).overflowY,
        scrollHeight: editor.scrollHeight,
      },
      explorer: {
        ...readRect(".vscode-explorer"),
        backgroundColor: getComputedStyle(explorer).backgroundColor,
      },
      activityBackgroundColor: getComputedStyle(activity).backgroundColor,
      componentBackdropFilter: getComputedStyle(component).backdropFilter,
      componentBeforeContent: getComputedStyle(component, "::before").content,
      explorerFooterCount: document.querySelectorAll(".vscode-explorer-footer-row").length,
      explorerFooterRow: readRect(".vscode-explorer-footer-row"),
      explorerHeading: readRect(".vscode-explorer-heading"),
      minimapCount: document.querySelectorAll(".vscode-minimap").length,
      openedSection: readRect(".vscode-explorer-section .vscode-section-title"),
      position: getComputedStyle(component).position,
      repositorySection: readRect(
        ".vscode-repository-tree > .vscode-section-title",
      ),
      stageHeight: stage.getBoundingClientRect().height,
      statusbar: readRect(".vscode-statusbar"),
      tabbar: readRect(".vscode-tabbar"),
      terminal: readRect(".vscode-terminal"),
      titlebar: readRect(".vscode-titlebar"),
      titleLayoutCount: document.querySelectorAll(".vscode-title-tools > *").length,
      visibleToolbarItemCount: Array.from(
        document.querySelectorAll(".vscode-tab-actions > *"),
      ).filter((element) => {
        const rect = element.getBoundingClientRect();
        return getComputedStyle(element).display !== "none" && rect.width > 1 && rect.height > 1;
      }).length,
      treeRow: readRect(".vscode-tree-row"),
    };
  });

  expect(layout.position).toBe("sticky");
  expect(layout.component.bottom).toBeLessThanOrEqual(900);
  expect(layout.component.height).toBe(673);
  expect(layout.stageHeight).toBeGreaterThan(layout.component.height);
  expect(layout.titlebar.height).toBe(34);
  expect(layout.activity.width).toBe(48);
  expect(layout.explorer.width).toBe(196);
  expect(layout.explorer.backgroundColor).toBe("rgb(21, 21, 21)");
  expect(layout.activityBackgroundColor).toBe("rgb(24, 24, 24)");
  expect(layout.componentBackdropFilter).toBe("none");
  expect(layout.componentBeforeContent).toBe("none");
  expect(layout.explorerHeading.height).toBe(29);
  expect(layout.openedSection.height).toBe(26);
  expect(layout.repositorySection.height).toBe(18);
  expect(layout.treeRow.height).toBe(22);
  expect(layout.explorerFooterCount).toBe(2);
  expect(layout.explorerFooterRow.height).toBe(20);
  expect(layout.tabbar.height).toBe(35);
  expect(layout.activeTab.width).toBe(140);
  expect(layout.breadcrumb.height).toBe(24);
  expect(layout.copyButton).toMatchObject({ height: 0, width: 0 });
  expect(layout.visibleToolbarItemCount).toBe(5);
  expect(layout.titleLayoutCount).toBe(5);
  expect(layout.minimapCount).toBe(0);
  expect(layout.terminal.height).toBe(166);
  expect(layout.statusbar.height).toBe(20);
  expect(layout.editor.overflowY).toBe("hidden");
  expect(layout.editor.currentLineBackground).not.toBe("rgba(0, 0, 0, 0)");
  expect(layout.editor.scrollHeight).toBeGreaterThan(layout.editor.clientHeight);
  expect(layout.terminal.top).toBeGreaterThanOrEqual(layout.component.top);
  expect(layout.terminal.bottom).toBeLessThanOrEqual(layout.statusbar.top + 1);
  expect(layout.statusbar.bottom).toBeLessThanOrEqual(layout.component.bottom + 1);
  expect(layout.terminal.left).toBeGreaterThanOrEqual(layout.component.left);
  expect(layout.terminal.right).toBeLessThanOrEqual(layout.component.right + 1);
});

test("profile-specific custom text colors remain unchanged", async ({ page }) => {
  await loadAbout(page);

  const renderedColors = await page.evaluate(
    (expectedClassNames) =>
      Object.fromEntries(
        expectedClassNames.map((className) => {
          const element = document.querySelector(`.${className}`);
          return [className, element ? getComputedStyle(element).color : null];
        }),
      ),
    Object.keys(CUSTOM_PROFILE_COLORS),
  );

  expect(renderedColors).toEqual(CUSTOM_PROFILE_COLORS);
});

for (const locale of [
  {
    name: "zh-Hant",
    route: "/about/",
    explorer: ["檔案總管", "已開啟的編輯器", "大綱", "時間表"],
    terminal: ["問題", "輸出", "偵錯主控台", "終端機", "連接埠"],
    status: ["第 3 行，第 1 欄", "空格: 4"],
  },
  {
    name: "English",
    route: "/en/about/",
    explorer: ["Explorer", "Open Editors", "Outline", "Timeline"],
    terminal: ["Problems", "Output", "Debug Console", "Terminal", "Ports"],
    status: ["Ln 3, Col 1", "Spaces: 4"],
  },
  {
    name: "Japanese",
    route: "/ja/about/",
    explorer: ["エクスプローラー", "開いているエディター", "アウトライン", "タイムライン"],
    terminal: ["問題", "出力", "デバッグ コンソール", "ターミナル", "ポート"],
    status: ["行 3、列 1", "スペース: 4"],
  },
]) {
  test(`${locale.name} localizes the visible VS Code workspace chrome`, async ({
    page,
  }) => {
    await loadAbout(page, undefined, locale.route);

    for (const label of locale.explorer) {
      await expect(page.locator(".vscode-explorer")).toContainText(label);
    }
    for (const label of locale.terminal) {
      await expect(page.locator(".vscode-terminal-tabs")).toContainText(label);
    }
    for (const label of locale.status) {
      await expect(page.locator(".vscode-statusbar")).toContainText(label);
    }
  });
}

test("forced colors remap editor text to readable system colors", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await loadAbout(page);

  const forcedColors = await page.evaluate((customClassNames) => {
    const editor = document.querySelector(".vscode-editor-scroll");
    const selectors = [
      ".vscode-editor-scroll code",
      ".vscode-editor-scroll .token.keyword",
      ".vscode-editor-scroll .custom-line-numbers",
      ...customClassNames.map((className) => `.vscode-editor-scroll .${className}`),
    ];
    const systemText = document.createElement("span");
    systemText.style.color = "CanvasText";
    editor.append(systemText);
    const canvasText = getComputedStyle(systemText).color;
    systemText.remove();

    return {
      active: matchMedia("(forced-colors: active)").matches,
      canvasText,
      editorAdjust: getComputedStyle(editor).getPropertyValue("forced-color-adjust"),
      text: selectors.map((selector) => {
        const element = document.querySelector(selector);
        const style = getComputedStyle(element);
        return {
          color: style.color,
          forcedColorAdjust: style.getPropertyValue("forced-color-adjust"),
        };
      }),
    };
  }, Object.keys(CUSTOM_PROFILE_COLORS));

  expect(forcedColors.active).toBe(true);
  expect(forcedColors.editorAdjust).not.toBe("none");
  for (const text of forcedColors.text) {
    expect(text.color).toBe(forcedColors.canvasText);
    expect(text.forcedColorAdjust).not.toBe("none");
  }
});

test("mobile editor is the single keyboard-reachable horizontal scroller", async ({
  page,
}) => {
  await loadAbout(page, { width: 390, height: 844 });

  const editor = page.locator(".vscode-editor-scroll");
  const pre = editor.locator('pre[class*="language-"]');
  await expect(editor).toHaveAttribute("tabindex", "0");
  await expect(editor).toHaveAttribute("role", "region");
  await expect(editor).toHaveAccessibleName("huihuidev.py source code");

  const overflow = await page.evaluate(() => {
    const editorElement = document.querySelector(".vscode-editor-scroll");
    const preElement = editorElement.querySelector('pre[class*="language-"]');

    return {
      editorClientWidth: editorElement.clientWidth,
      editorOverflowX: getComputedStyle(editorElement).overflowX,
      editorScrollWidth: editorElement.scrollWidth,
      preOverflowX: getComputedStyle(preElement).overflowX,
      preTabIndex: preElement.tabIndex,
    };
  });

  expect(overflow.editorOverflowX).toBe("auto");
  expect(overflow.editorScrollWidth).toBeGreaterThan(overflow.editorClientWidth);
  expect(overflow.preOverflowX).toBe("visible");
  expect(overflow.preTabIndex).toBe(-1);

  let reachedEditor = false;
  for (let tabPress = 0; tabPress < 20; tabPress += 1) {
    await page.keyboard.press("Tab");
    reachedEditor = await editor.evaluate((element) => document.activeElement === element);
    if (reachedEditor) break;
  }
  expect(reachedEditor).toBe(true);
  await expect(editor).toBeFocused();

  const focusOutline = await editor.evaluate((element) => {
    const style = getComputedStyle(element);
    return { style: style.outlineStyle, width: style.outlineWidth };
  });
  expect(focusOutline.style).not.toBe("none");
  expect(Number.parseFloat(focusOutline.width)).toBeGreaterThan(0);

  for (let keyPress = 0; keyPress < 8; keyPress += 1) {
    await page.keyboard.press("ArrowRight");
  }
  await expect.poll(() => editor.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  const rightScroll = await editor.evaluate((element) => element.scrollLeft);

  for (let keyPress = 0; keyPress < 8; keyPress += 1) {
    await page.keyboard.press("ArrowLeft");
  }
  await expect
    .poll(() => editor.evaluate((element) => element.scrollLeft))
    .toBeLessThan(rightScroll);

  const metrics = await getStageMetrics(page);
  await setDocumentScroll(page, metrics.stageStart + metrics.distance * 0.5);
  await expectEditorMatchesDocumentScroll(page, metrics);
  expect(await pre.getAttribute("tabindex")).toBeNull();
});

test("document scroll stays native and drives the sticky editor through its full range", async ({
  page,
}) => {
  await loadAbout(page);
  const metrics = await getStageMetrics(page);

  expect(metrics.distance).toBe(metrics.maxEditorScroll);
  expect(metrics.stageHeight).toBe(metrics.workspaceHeight + metrics.distance);
  expect(metrics.distance).toBeGreaterThan(0);

  await setDocumentScroll(page, metrics.stageStart + metrics.distance * 0.25);
  await expectEditorScroll(page, metrics.maxEditorScroll * 0.25);
  const firstPanelPositions = await getPanelPositions(page);
  const firstWindowY = await page.evaluate(() => window.scrollY);

  await setDocumentScroll(page, metrics.stageStart + metrics.distance * 0.65);
  await expectEditorScroll(page, metrics.maxEditorScroll * 0.65);
  const secondPanelPositions = await getPanelPositions(page);
  const secondWindowY = await page.evaluate(() => window.scrollY);

  expect(secondWindowY).toBeGreaterThan(firstWindowY);
  for (const selector of Object.keys(firstPanelPositions)) {
    expect(
      Math.abs(secondPanelPositions[selector].top - firstPanelPositions[selector].top),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(secondPanelPositions[selector].left - firstPanelPositions[selector].left),
    ).toBeLessThanOrEqual(1);
  }

  expect(
    await page.evaluate(() => ({
      bodyScrollTop: document.body.scrollTop,
      documentMatchesWindow: document.documentElement.scrollTop === window.scrollY,
      scrollingElement: document.scrollingElement?.tagName,
    })),
  ).toEqual({
    bodyScrollTop: 0,
    documentMatchesWindow: true,
    scrollingElement: "HTML",
  });
});

test("editor reaches its exact maximum before the sticky stage releases to Interests", async ({
  page,
}) => {
  await loadAbout(page);
  const metrics = await getStageMetrics(page);
  const stageEnd = metrics.stageStart + metrics.distance;
  const interests = page.getByRole("heading", { name: "Interests" });

  await setDocumentScroll(page, stageEnd - Math.max(20, metrics.distance * 0.1));
  expect(
    await interests.evaluate(
      (element) => element.getBoundingClientRect().top >= window.innerHeight,
    ),
  ).toBe(true);
  expect(
    await page.locator(".vscode-editor-scroll").evaluate((element) => element.scrollTop),
  ).toBeLessThan(metrics.maxEditorScroll);

  await setDocumentScroll(page, stageEnd);
  await expectEditorScroll(page, metrics.maxEditorScroll);
  await expect
    .poll(() =>
      page.locator(".vscode-window").evaluate(
        (element, stickyTop) =>
          Math.abs(element.getBoundingClientRect().top - stickyTop),
        metrics.stickyTop,
      ),
    )
    .toBeLessThanOrEqual(1);

  await setDocumentScroll(page, stageEnd + 100);
  await expectEditorScroll(page, metrics.maxEditorScroll);
  expect(
    await page.locator(".vscode-window").evaluate((element) => element.getBoundingClientRect().top),
  ).toBeLessThan(metrics.stickyTop - 50);

  const interestsY = await interests.evaluate(
    (element) => window.scrollY + element.getBoundingClientRect().top - 40,
  );
  await setDocumentScroll(page, interestsY);
  await expect(interests).toBeVisible();
  await expectEditorScroll(page, metrics.maxEditorScroll);
});

test("upward document scrolling reverses editor progress naturally", async ({ page }) => {
  await loadAbout(page);
  const metrics = await getStageMetrics(page);
  const stageEnd = metrics.stageStart + metrics.distance;

  await setDocumentScroll(page, stageEnd + 100);
  await expectEditorScroll(page, metrics.maxEditorScroll);

  await setDocumentScroll(page, metrics.stageStart + metrics.distance * 0.6);
  await expectEditorScroll(page, metrics.maxEditorScroll * 0.6);

  await setDocumentScroll(page, metrics.stageStart + metrics.distance * 0.15);
  await expectEditorScroll(page, metrics.maxEditorScroll * 0.15);

  await setDocumentScroll(page, Math.max(0, metrics.stageStart - 30));
  await expectEditorScroll(page, 0);
});

test("mouse wheel uses native document scrolling without a preventDefault trap", async ({
  page,
}) => {
  await loadAbout(page);
  const metrics = await getStageMetrics(page);
  await setDocumentScroll(page, metrics.stageStart + 10);
  await expectEditorScroll(page, 10);

  const editorBox = await page.locator(".vscode-editor-scroll").boundingBox();
  expect(editorBox).not.toBeNull();
  await page.mouse.move(
    editorBox.x + editorBox.width / 2,
    editorBox.y + editorBox.height / 2,
  );

  let previousWindowY = await page.evaluate(() => window.scrollY);
  let previousEditorY = await page
    .locator(".vscode-editor-scroll")
    .evaluate((element) => element.scrollTop);

  for (let input = 0; input < 4; input += 1) {
    await page.mouse.wheel(0, 45);
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(previousWindowY);
    const nextWindowY = await page.evaluate(() => window.scrollY);
    await expect
      .poll(() =>
        page
          .locator(".vscode-editor-scroll")
          .evaluate((element) => element.scrollTop),
      )
      .toBeGreaterThan(previousEditorY);
    previousWindowY = nextWindowY;
    previousEditorY = await page
      .locator(".vscode-editor-scroll")
      .evaluate((element) => element.scrollTop);
  }

  expect(
    await page.evaluate(() => {
      const event = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaY: 40,
      });
      return document.body.dispatchEvent(event);
    }),
  ).toBe(true);
});

test("native PageDown and PageUp move the document and mapped editor", async ({ page }) => {
  await loadAbout(page);
  const metrics = await getStageMetrics(page);
  await setDocumentScroll(page, metrics.stageStart + 10);
  await page.evaluate(() => document.activeElement?.blur());

  const start = await page.evaluate(() => window.scrollY);
  await page.keyboard.press("PageDown");
  await waitForDocumentScrollToSettle(page);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(start);
  const afterPageDown = await page.evaluate(() => window.scrollY);
  await expectEditorScroll(
    page,
    Math.min(afterPageDown - metrics.stageStart, metrics.maxEditorScroll),
  );

  await page.keyboard.press("PageUp");
  await waitForDocumentScrollToSettle(page);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(afterPageDown);
  const afterPageUp = await page.evaluate(() => window.scrollY);
  await expectEditorScroll(
    page,
    Math.max(0, Math.min(afterPageUp - metrics.stageStart, metrics.maxEditorScroll)),
  );
});

test("mobile sticky stage remains responsive without horizontal overflow", async ({ page }) => {
  await loadAbout(page, { width: 390, height: 844 });

  await expect(page.locator(".vscode-titlebar")).toBeVisible();
  await expect(page.locator(".vscode-explorer")).toBeHidden();
  await expect(page.locator(".vscode-terminal")).toBeVisible();
  await expect(page.locator(".vscode-statusbar")).toBeVisible();

  const metrics = await getStageMetrics(page);
  await setDocumentScroll(page, metrics.stageStart + metrics.distance * 0.5);
  await expectEditorScroll(page, metrics.maxEditorScroll * 0.5);

  const geometry = await page.evaluate(() => {
    const component = document.querySelector(".vscode-window").getBoundingClientRect();
    const statusbar = document.querySelector(".vscode-statusbar").getBoundingClientRect();

    return {
      clientWidth: document.documentElement.clientWidth,
      componentBottom: component.bottom,
      componentRight: component.right,
      documentScrollWidth: document.documentElement.scrollWidth,
      position: getComputedStyle(document.querySelector(".vscode-window")).position,
      scrollingElement: document.scrollingElement?.tagName,
      statusbarBottom: statusbar.bottom,
    };
  });

  expect(geometry.documentScrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
  expect(geometry.componentRight).toBeLessThanOrEqual(geometry.clientWidth + 1);
  expect(geometry.statusbarBottom).toBeLessThanOrEqual(geometry.componentBottom + 1);
  expect(geometry.position).toBe("sticky");
  expect(geometry.scrollingElement).toBe("HTML");
});

for (const width of RESPONSIVE_STICKY_VIEWPORTS) {
  test(`${width}px keeps the native sticky stage attached to the HTML scroller`, async ({
    page,
  }) => {
    const viewport = { width, height: width <= 430 ? 844 : 900 };
    await loadAbout(page, viewport);
    await waitForStageGeometry(page);
    const metrics = await getStageMetrics(page);
    const stageEnd = metrics.stageStart + metrics.distance;
    const interests = page.getByRole("heading", { name: "Interests" });

    const initial = await page.evaluate(() => ({
      bodyOverflowX: getComputedStyle(document.body).overflowX,
      bodyOverflowY: getComputedStyle(document.body).overflowY,
      clientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      explorerDisplay: getComputedStyle(
        document.querySelector(".vscode-explorer"),
      ).display,
      scrollingElement: document.scrollingElement?.tagName,
    }));

    expect(initial.scrollingElement).toBe("HTML");
    expect(initial.documentScrollWidth).toBeLessThanOrEqual(initial.clientWidth + 1);
    expect(initial.bodyOverflowX).toBe(width <= 900 ? "clip" : "visible");
    expect(initial.bodyOverflowY).toBe("visible");
    expect(initial.explorerDisplay).toBe(width <= 900 ? "none" : "flex");
    expect(metrics.distance).toBe(metrics.maxEditorScroll);
    expect(
      Math.abs(metrics.stageHeight - metrics.workspaceHeight - metrics.distance),
    ).toBeLessThanOrEqual(1);

    await setDocumentScroll(page, metrics.stageStart + metrics.distance * 0.25);
    await expectEditorMatchesDocumentScroll(page, metrics);
    const firstWorkspaceTop = await page
      .locator(".vscode-window")
      .evaluate((element) => element.getBoundingClientRect().top);
    const firstEditorTop = await page
      .locator(".vscode-editor-scroll")
      .evaluate((element) => element.scrollTop);

    await setDocumentScroll(page, metrics.stageStart + metrics.distance * 0.65);
    await expectEditorMatchesDocumentScroll(page, metrics);
    const secondWorkspaceTop = await page
      .locator(".vscode-window")
      .evaluate((element) => element.getBoundingClientRect().top);
    const secondEditorTop = await page
      .locator(".vscode-editor-scroll")
      .evaluate((element) => element.scrollTop);

    expect(secondEditorTop).toBeGreaterThan(firstEditorTop);
    expect(Math.abs(firstWorkspaceTop - metrics.stickyTop)).toBeLessThanOrEqual(1);
    expect(Math.abs(secondWorkspaceTop - firstWorkspaceTop)).toBeLessThanOrEqual(1);

    await setDocumentScroll(page, stageEnd);
    await expectEditorScroll(page, metrics.maxEditorScroll);
    await expect
      .poll(() =>
        page.locator(".vscode-window").evaluate(
          (element, stickyTop) =>
            Math.abs(element.getBoundingClientRect().top - stickyTop),
          metrics.stickyTop,
        ),
      )
      .toBeLessThanOrEqual(1);

    await setDocumentScroll(page, stageEnd + 100);
    await expectEditorScroll(page, metrics.maxEditorScroll);
    expect(
      await page.locator(".vscode-window").evaluate((element) => element.getBoundingClientRect().top),
    ).toBeLessThan(metrics.stickyTop - 50);
    expect(
      await interests.evaluate((element) => element.getBoundingClientRect().top),
    ).toBeLessThan(viewport.height);

    await setDocumentScroll(page, metrics.stageStart + metrics.distance * 0.6);
    await expectEditorMatchesDocumentScroll(page, metrics);
    await setDocumentScroll(page, metrics.stageStart + metrics.distance * 0.15);
    await expectEditorMatchesDocumentScroll(page, metrics);
    expect(
      await page.locator(".vscode-window").evaluate((element) => element.getBoundingClientRect().top),
    ).toBeCloseTo(metrics.stickyTop, 0);

    const interestsY = await interests.evaluate(
      (element) => window.scrollY + element.getBoundingClientRect().top - 40,
    );
    await setDocumentScroll(page, interestsY);
    await expect(interests).toBeVisible();
  });
}
