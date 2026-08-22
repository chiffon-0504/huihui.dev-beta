import { expect, test } from "@playwright/test";

const STEAM_API_URL = "https://api.huihui.dev/api/steam-library";

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
        left: rect.left,
        right: rect.right,
        top: rect.top,
      };
    };
    const editor = document.querySelector(".vscode-editor-scroll");

    return {
      component: readRect(".vscode-window"),
      editor: {
        ...readRect(".vscode-editor-scroll"),
        clientHeight: editor.clientHeight,
        containment: editor.dataset.scrollContainment,
        overflowY: getComputedStyle(editor).overflowY,
        overscrollBehaviorY: getComputedStyle(editor).overscrollBehaviorY,
        scrollHeight: editor.scrollHeight,
      },
      position: getComputedStyle(document.querySelector(".vscode-window")).position,
      statusbar: readRect(".vscode-statusbar"),
      terminal: readRect(".vscode-terminal"),
    };
  });

  expect(layout.position).not.toBe("fixed");
  expect(layout.component.bottom).toBeLessThanOrEqual(900);
  expect(layout.editor.overflowY).toBe("auto");
  expect(["native", "wheel-fallback"]).toContain(layout.editor.containment);
  if (layout.editor.containment === "native") {
    expect(layout.editor.overscrollBehaviorY).toBe("contain");
  }
  expect(layout.editor.scrollHeight).toBeGreaterThan(layout.editor.clientHeight);
  expect(layout.terminal.top).toBeGreaterThanOrEqual(layout.component.top);
  expect(layout.terminal.bottom).toBeLessThanOrEqual(layout.statusbar.top + 1);
  expect(layout.statusbar.bottom).toBeLessThanOrEqual(layout.component.bottom + 1);
  expect(layout.terminal.left).toBeGreaterThanOrEqual(layout.component.left);
  expect(layout.terminal.right).toBeLessThanOrEqual(layout.component.right + 1);
});

test("editor wheel scrolling is independent, contained, and keeps fixed panels still", async ({
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

  await editor.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const bottomState = await editor.evaluate((element) => ({
    maxScrollTop: element.scrollHeight - element.clientHeight,
    scrollTop: element.scrollTop,
  }));
  expect(bottomState.scrollTop).toBe(bottomState.maxScrollTop);

  await page.mouse.wheel(0, 520);
  await expect
    .poll(() => editor.evaluate((element) => element.scrollTop))
    .toBe(bottomState.maxScrollTop);
  expect(await page.evaluate(() => window.scrollY)).toBe(initialWindowY);

  const titlebar = await page.locator(".vscode-titlebar").boundingBox();
  expect(titlebar).not.toBeNull();
  await page.mouse.move(
    titlebar.x + titlebar.width / 2,
    titlebar.y + titlebar.height / 2,
  );
  await page.mouse.wheel(0, 420);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(initialWindowY);
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
