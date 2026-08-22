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
      explorer: readRect(".vscode-explorer"),
      explorerFooterCount: document.querySelectorAll(".vscode-explorer-footer-row").length,
      explorerFooterRow: readRect(".vscode-explorer-footer-row"),
      explorerHeading: readRect(".vscode-explorer-heading"),
      minimap: readRect(".vscode-minimap"),
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
  expect(layout.minimap).toMatchObject({ height: 122, width: 60 });
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

test("editor wheel scrolling stays local and keeps fixed panels still while range remains", async ({
  page,
}) => {
  await loadAbout(page);
  const editor = page.locator(".vscode-editor-scroll");
  const editorBox = await editor.boundingBox();
  expect(editorBox).not.toBeNull();

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  const initialWindowY = await page.evaluate(() => window.scrollY);
  const panelPositions = await getPanelPositions(page);

  await page.mouse.move(
    editorBox.x + editorBox.width / 2,
    editorBox.y + editorBox.height / 2,
  );
  await page.mouse.wheel(0, 420);
  await expect.poll(() => editor.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(initialWindowY);
  expect(await getPanelPositions(page)).toEqual(panelPositions);
});

test("editor hands downward wheel scrolling to the document at its bottom", async ({
  page,
}) => {
  await loadAbout(page);
  const editor = page.locator(".vscode-editor-scroll");

  await editor.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const initialWindowY = await page.evaluate(() => window.scrollY);
  expect(initialWindowY).toBe(0);
  const bottomState = await editor.evaluate((element) => ({
    maxScrollTop: element.scrollHeight - element.clientHeight,
    scrollTop: element.scrollTop,
  }));
  expect(bottomState.maxScrollTop - bottomState.scrollTop).toBeLessThanOrEqual(1);

  const editorBox = await editor.boundingBox();
  expect(editorBox).not.toBeNull();
  await page.mouse.move(
    editorBox.x + editorBox.width / 2,
    editorBox.y + editorBox.height / 2,
  );
  for (let index = 0; index < 3; index += 1) {
    await page.mouse.wheel(0, 520);
  }
  await expect
    .poll(() =>
      editor.evaluate(
        (element) => element.scrollHeight - element.clientHeight - element.scrollTop,
      ),
    )
    .toBeLessThanOrEqual(1);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(initialWindowY);
  await expect(page.getByRole("heading", { name: "Interests" })).toBeVisible();
});

test("editor hands upward wheel scrolling to the document at its top", async ({
  page,
}) => {
  await loadAbout(page);
  const editor = page.locator(".vscode-editor-scroll");

  const topBoundaryWindowY = await page.evaluate(() => {
    const editorElement = document.querySelector(".vscode-editor-scroll");
    const maxWindowY = document.documentElement.scrollHeight - window.innerHeight;

    editorElement.scrollTop = 0;
    window.scrollTo({ top: Math.min(240, maxWindowY), behavior: "instant" });
    return window.scrollY;
  });
  expect(topBoundaryWindowY).toBeGreaterThan(0);
  expect(await editor.evaluate((element) => element.scrollTop)).toBe(0);

  const topEditorBox = await editor.boundingBox();
  expect(topEditorBox).not.toBeNull();
  await page.mouse.move(
    topEditorBox.x + topEditorBox.width / 2,
    Math.max(8, topEditorBox.y + topEditorBox.height / 2),
  );
  await page.mouse.wheel(0, -520);
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeLessThan(topBoundaryWindowY);
  expect(await editor.evaluate((element) => element.scrollTop)).toBe(0);
});

test("mobile workspace simplifies chrome without document overflow", async ({ page }) => {
  await loadAbout(page, { width: 390, height: 844 });

  await expect(page.locator(".vscode-titlebar")).toBeVisible();
  await expect(page.locator(".vscode-explorer")).toBeHidden();
  await expect(page.locator(".vscode-terminal")).toBeVisible();
  await expect(page.locator(".vscode-statusbar")).toBeVisible();

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
