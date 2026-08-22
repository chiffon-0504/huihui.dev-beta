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

const GATE_STATES = {
  before: "BEFORE_GATE",
  lockedDown: "LOCKED_EDITOR_DOWN",
  after: "AFTER_GATE",
  lockedUp: "LOCKED_EDITOR_UP",
};

async function loadAbout(page, viewport = { width: 1440, height: 900 }) {
  await page.setViewportSize(viewport);
  await page.route(STEAM_API_URL, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, games: [] }),
    }),
  );
  const response = await page.goto("/en/about/", { waitUntil: "load" });

  expect(response?.status()).toBe(200);
  await expect(page.locator(".vscode-window[data-vscode-ready='true']")).toHaveCount(1);
  await expect(page.locator(".vscode-window[data-scroll-gate-ready='true']")).toHaveCount(1);
  await expect(page.locator(".vscode-editor-scroll > .custom-line-numbers")).toBeVisible();
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

async function expectDocumentAt(page, expectedY) {
  await expect
    .poll(() => page.evaluate((expected) => Math.abs(window.scrollY - expected), expectedY))
    .toBeLessThanOrEqual(1);
  expect(
    await page.evaluate(() => ({
      bodyScrollTop: document.body.scrollTop,
      documentMatchesWindow:
        document.documentElement.scrollTop === window.scrollY,
      scrollingElement: document.scrollingElement?.tagName,
    })),
  ).toEqual({
    bodyScrollTop: 0,
    documentMatchesWindow: true,
    scrollingElement: "HTML",
  });
}

async function activateDownwardGate(page) {
  await page.mouse.move(1300, 450);
  await page.mouse.wheel(0, 200);
  await expect(page.locator(".vscode-window")).toHaveAttribute(
    "data-scroll-gate-state",
    GATE_STATES.lockedDown,
  );
}

async function dispatchKeyboardInput(locator, key, shiftKey = false) {
  return locator.evaluate(
    (element, input) =>
      !element.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          code: input.key,
          key: input.key,
          shiftKey: input.shiftKey,
        }),
      ),
    { key, shiftKey },
  );
}

test("desktop workspace preserves complete VS Code chrome and panel geometry", async ({
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
        overscrollBehaviorY: getComputedStyle(editor).overscrollBehaviorY,
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
      position: getComputedStyle(document.querySelector(".vscode-window")).position,
      repositorySection: readRect(
        ".vscode-repository-tree > .vscode-section-title",
      ),
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

  expect(layout.position).not.toBe("fixed");
  expect(layout.component.bottom).toBeLessThanOrEqual(900);
  expect(layout.component.height).toBe(673);
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
  expect(layout.editor.overflowY).toBe("auto");
  expect(layout.editor.overscrollBehaviorY).not.toBe("contain");
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

test("global wheel gate keeps the document and VS Code panels fixed while routing input", async ({
  page,
}) => {
  await loadAbout(page);
  const editor = page.locator(".vscode-editor-scroll");
  const gate = page.locator(".vscode-window");

  await page.mouse.move(1300, 450);
  await page.mouse.wheel(0, 20);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await expect(gate).toHaveAttribute("data-scroll-gate-state", GATE_STATES.before);
  expect(await editor.evaluate((element) => element.scrollTop)).toBe(0);

  await page.mouse.wheel(0, 180);
  await expect(gate).toHaveAttribute(
    "data-scroll-gate-state",
    GATE_STATES.lockedDown,
  );
  const lockedDocumentY = await page.evaluate(() => window.scrollY);
  const panelPositions = await getPanelPositions(page);
  const editorStart = await editor.evaluate((element) => element.scrollTop);

  for (const selector of [
    ".vscode-explorer",
    ".vscode-terminal",
    ".vscode-statusbar",
    ".page-header",
  ]) {
    const box = await page.locator(selector).boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(
      Math.max(8, Math.min(1432, box.x + box.width / 2)),
      Math.max(8, Math.min(892, box.y + box.height / 2)),
    );
    await page.mouse.wheel(0, 70);
  }

  await expect
    .poll(() => editor.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(editorStart);
  await expectDocumentAt(page, lockedDocumentY);
  expect(await getPanelPositions(page)).toEqual(panelPositions);

  const pre = page.locator(".vscode-editor-scroll pre[class*='language-']");
  const editorBox = await editor.boundingBox();
  expect(editorBox).not.toBeNull();
  const horizontalState = await pre.evaluate((element) => ({
    maximumScrollLeft: Math.max(0, element.scrollWidth - element.clientWidth),
    scrollLeft: element.scrollLeft,
  }));
  const expectedHorizontalScroll = Math.min(
    horizontalState.scrollLeft + 80,
    horizontalState.maximumScrollLeft,
  );
  await page.mouse.move(
    editorBox.x + editorBox.width / 2,
    editorBox.y + editorBox.height / 2,
  );
  await page.mouse.wheel(80, 20);
  await expect
    .poll(() =>
      pre.evaluate(
        (element, expected) => Math.abs(element.scrollLeft - expected),
        expectedHorizontalScroll,
      ),
    )
    .toBeLessThanOrEqual(1);
  await expectDocumentAt(page, lockedDocumentY);
  await expect(page.locator(".vscode-terminal")).toBeVisible();
  await expect(page.locator(".vscode-statusbar")).toBeVisible();
});

test("wheel gate requires separate boundary inputs and reverses symmetrically", async ({
  page,
}) => {
  await loadAbout(page);
  const editor = page.locator(".vscode-editor-scroll");
  const gate = page.locator(".vscode-window");
  await activateDownwardGate(page);

  const lockedDocumentY = await page.evaluate(() => window.scrollY);
  await editor.evaluate((element) => {
    element.scrollTop = element.scrollHeight - element.clientHeight - 80;
  });
  await page.mouse.wheel(0, 160);
  await expect
    .poll(() =>
      editor.evaluate(
        (element) => element.scrollHeight - element.clientHeight - element.scrollTop,
      ),
    )
    .toBeLessThanOrEqual(1);
  await expect(gate).toHaveAttribute(
    "data-scroll-gate-state",
    GATE_STATES.lockedDown,
  );
  await expectDocumentAt(page, lockedDocumentY);

  await page.mouse.wheel(0, 140);
  await expect(gate).toHaveAttribute("data-scroll-gate-state", GATE_STATES.after);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(lockedDocumentY);

  const belowGateY = await page.evaluate(() => window.scrollY);
  const returnDelta = belowGateY - lockedDocumentY + 100;
  await page.mouse.wheel(0, -returnDelta);
  await expect(gate).toHaveAttribute(
    "data-scroll-gate-state",
    GATE_STATES.lockedUp,
  );
  await expectDocumentAt(page, lockedDocumentY);
  expect(await editor.evaluate((element) => element.scrollTop)).toBeLessThan(
    await editor.evaluate((element) => element.scrollHeight - element.clientHeight),
  );

  await editor.evaluate((element) => {
    element.scrollTop = 60;
  });
  await page.mouse.wheel(0, -120);
  await expect.poll(() => editor.evaluate((element) => element.scrollTop)).toBe(0);
  await expect(gate).toHaveAttribute(
    "data-scroll-gate-state",
    GATE_STATES.lockedUp,
  );
  await expectDocumentAt(page, lockedDocumentY);

  await page.mouse.wheel(0, -120);
  await expect(gate).toHaveAttribute("data-scroll-gate-state", GATE_STATES.before);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(lockedDocumentY);
});

test("keyboard traverses the gate without trapping Tab or interactive controls", async ({
  page,
}) => {
  await loadAbout(page);
  const editor = page.locator(".vscode-editor-scroll");
  const gate = page.locator(".vscode-window");
  const body = page.locator("body");

  await body.press("PageDown");
  await expect(gate).toHaveAttribute(
    "data-scroll-gate-state",
    GATE_STATES.lockedDown,
  );
  const lockedDocumentY = await page.evaluate(() => window.scrollY);
  const editorStart = await editor.evaluate((element) => element.scrollTop);

  await body.press("PageDown");
  await expect
    .poll(() => editor.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(editorStart);
  await expectDocumentAt(page, lockedDocumentY);

  await editor.focus();
  await page.keyboard.press("Tab");
  expect(await editor.evaluate((element) => document.activeElement === element)).toBe(false);
  await expect(gate).toHaveAttribute("data-scroll-gate-locked", "true");
  await expectDocumentAt(page, lockedDocumentY);

  await page.locator(".sidebar nav a").first().focus();
  const beforeInteractiveKey = await editor.evaluate((element) => element.scrollTop);
  await page.keyboard.press("ArrowDown");
  expect(await editor.evaluate((element) => element.scrollTop)).toBe(beforeInteractiveKey);
  await expectDocumentAt(page, lockedDocumentY);

  await editor.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await editor.press("PageDown");
  await expect(gate).toHaveAttribute("data-scroll-gate-state", GATE_STATES.after);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(lockedDocumentY);

  const pageUpDelta = await editor.evaluate((element) => element.clientHeight * 0.9);
  const pageUpCount = Math.ceil(
    ((await page.evaluate(() => window.scrollY)) - lockedDocumentY) / pageUpDelta,
  );
  for (let input = 0; input < pageUpCount; input += 1) {
    expect(await dispatchKeyboardInput(editor, "PageUp")).toBe(true);
  }
  await expect(gate).toHaveAttribute(
    "data-scroll-gate-state",
    GATE_STATES.lockedUp,
  );
  await editor.evaluate((element) => {
    element.scrollTop = 0;
  });
  expect(await dispatchKeyboardInput(editor, "PageUp")).toBe(true);
  await expect(gate).toHaveAttribute("data-scroll-gate-state", GATE_STATES.before);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(lockedDocumentY);
});

test("About content below the gate remains reachable after release", async ({ page }) => {
  await loadAbout(page);
  const editor = page.locator(".vscode-editor-scroll");
  const gate = page.locator(".vscode-window");
  await activateDownwardGate(page);

  await editor.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await page.mouse.wheel(0, 140);
  await expect(gate).toHaveAttribute("data-scroll-gate-state", GATE_STATES.after);

  await page.mouse.move(350, 450);
  await page.mouse.wheel(0, 1200);
  await expect(page.getByRole("heading", { name: "Interests" })).toBeVisible();
});

test("mobile workspace simplifies chrome without document overflow", async ({ page }) => {
  await loadAbout(page, { width: 390, height: 844 });

  await expect(page.locator(".vscode-titlebar")).toBeVisible();
  await expect(page.locator(".vscode-explorer")).toBeHidden();
  await expect(page.locator(".vscode-terminal")).toBeVisible();
  await expect(page.locator(".vscode-statusbar")).toBeVisible();

  await page.mouse.move(360, 420);
  await page.mouse.wheel(0, 180);
  await expect(page.locator(".vscode-window")).toHaveAttribute(
    "data-scroll-gate-state",
    GATE_STATES.lockedDown,
  );
  const lockedDocumentY = await page.evaluate(() => window.scrollY);
  const editorBeforeTouch = await page
    .locator(".vscode-editor-scroll")
    .evaluate((element) => element.scrollTop);
  const touchWasPrevented = await page.locator("body").evaluate((body) => {
    const createTouchEvent = (type, clientY) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "touches", {
        value: [{ clientX: 195, clientY }],
      });
      return event;
    };

    body.dispatchEvent(createTouchEvent("touchstart", 620));
    return !body.dispatchEvent(createTouchEvent("touchmove", 540));
  });
  expect(touchWasPrevented).toBe(true);
  await expect
    .poll(() =>
      page.locator(".vscode-editor-scroll").evaluate((element) => element.scrollTop),
    )
    .toBeGreaterThan(editorBeforeTouch);
  await expectDocumentAt(page, lockedDocumentY);

  const geometry = await page.evaluate(() => {
    const editor = document.querySelector(".vscode-editor-scroll");
    const component = document.querySelector(".vscode-window").getBoundingClientRect();
    const statusbar = document.querySelector(".vscode-statusbar").getBoundingClientRect();

    editor.scrollTop = editor.scrollHeight;
    return {
      clientWidth: document.documentElement.clientWidth,
      componentRight: component.right,
      documentScrollWidth: document.documentElement.scrollWidth,
      editorCanScroll: editor.scrollHeight > editor.clientHeight,
      editorScrollTop: editor.scrollTop,
      statusbarBottom: statusbar.bottom,
      componentBottom: component.bottom,
    };
  });

  expect(geometry.documentScrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
  expect(geometry.componentRight).toBeLessThanOrEqual(geometry.clientWidth + 1);
  expect(geometry.editorCanScroll).toBe(true);
  expect(geometry.editorScrollTop).toBeGreaterThan(0);
  expect(geometry.statusbarBottom).toBeLessThanOrEqual(geometry.componentBottom + 1);
});
