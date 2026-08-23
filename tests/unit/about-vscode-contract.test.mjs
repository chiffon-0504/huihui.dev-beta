import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, test } from "vitest";

const root = process.cwd();
let source;
let styles;
let codeBlocksSource;
let codeStyles;

beforeAll(async () => {
  [source, styles, codeBlocksSource, codeStyles] = await Promise.all([
    readFile(path.join(root, "js/about-vscode.js"), "utf8"),
    readFile(path.join(root, "css/about-vscode.css"), "utf8"),
    readFile(path.join(root, "js/code-blocks.js"), "utf8"),
    readFile(path.join(root, "css/code.css"), "utf8"),
  ]);
});

describe("About VS Code workspace contracts", () => {
  test("keeps the profile code as an accessible document-driven region", () => {
    expect(source).toContain('editorScroll.className = "vscode-editor-scroll"');
    expect(source).toContain('editorScroll.setAttribute("role", "region")');
    expect(source).toContain("editorScroll.tabIndex = 0");
    expect(source).toContain('pre.removeAttribute("tabindex")');
    expect(source).toContain("editorScroll.append(pre)");
    expect(styles).toMatch(
      /\.vscode-editor-scroll\s*\{[^}]*overflow-x:\s*auto;[^}]*overflow-y:\s*hidden;/s,
    );
    expect(styles).toMatch(
      /\.vscode-editor-scroll pre\[class\*="language-"\]\s*\{[^}]*overflow-x:\s*visible\s*!important;[^}]*overflow-y:\s*visible\s*!important;/s,
    );
    expect(styles).not.toMatch(
      /\.vscode-editor-scroll pre\[class\*="language-"\]\s*\{[^}]*overflow-x:\s*auto;/s,
    );
    expect(source).not.toContain("pre.tabIndex");
    expect(codeBlocksSource).toContain('if (pre.closest(".code-block")) return;');
  });

  test("uses native document scrolling with a requestAnimationFrame sticky stage", () => {
    expect(source).toContain('stage.className = "vscode-scroll-stage"');
    expect(source).toContain("editorScroll.scrollHeight - editorScroll.clientHeight");
    expect(source).toContain("stageScrollableDistance = maxEditorScroll");
    expect(source).toContain("editorScroll.scrollTop = progress * maxEditorScroll");
    expect(source).toContain(
      'window.addEventListener("scroll", requestScrollSync, { passive: true })',
    );
    expect(source).toContain("requestAnimationFrame(syncEditorScroll)");
    expect(source).toContain("new ResizeObserver(requestStageMeasure)");
    expect(styles).toMatch(
      /\.vscode-scroll-stage\s*>\s*\.vscode-window\.code-block\s*\{[^}]*position:\s*sticky;/s,
    );

    for (const rejectedPattern of [
      "BEFORE_GATE",
      "LOCKED_EDITOR_DOWN",
      "AFTER_GATE",
      "LOCKED_EDITOR_UP",
      "preventDefault()",
      "window.scrollTo",
      'addEventListener("wheel"',
      'addEventListener("touchmove"',
      'addEventListener("keydown"',
      "passive: false",
    ]) {
      expect(source).not.toContain(rejectedPattern);
    }

    expect(source).not.toContain("scrollIntoView");
    expect(source).not.toMatch(/setTimeout|setInterval|line\s*64/i);
    expect(styles).not.toMatch(/overflow:\s*hidden[^}]*html|html[^}]*overflow:\s*hidden/is);
  });

  test("preserves the established profile-specific color palette", () => {
    const expectedColors = {
      "kw-blue": "#33AAFF",
      "kw-red": "#ff5f56",
      "kw-reddishpurple": "#881144",
      "kw-togeari-eari": "#EEDA01",
      "kw-togeari-tog": "#E34D8D",
      "kw-togenashi-ena": "#85C9DC",
      "kw-togenashi-shi": "#76BD53",
      "kw-togenashi-tog": "#D90E2C",
    };

    for (const [className, color] of Object.entries(expectedColors)) {
      expect(codeStyles).toMatch(
        new RegExp(`\\.${className}\\s*\\{[^}]*color:\\s*${color}`, "i"),
      );
    }

    expect(styles).not.toMatch(/\.(?:token|kw-[a-z-]+)\b/);
  });

  test("localizes visible workspace chrome in all supported locales", () => {
    const expectedLabels = {
      zh: ["檔案總管", "已開啟的編輯器", "問題", "終端機", "第 3 行，第 1 欄", "空格: 4"],
      en: ["Explorer", "Open Editors", "Problems", "Terminal", "Ln 3, Col 1", "Spaces: 4"],
      ja: ["エクスプローラー", "開いているエディター", "問題", "ターミナル", "行 3、列 1", "スペース: 4"],
    };

    for (const labels of Object.values(expectedLabels)) {
      for (const label of labels) expect(source).toContain(JSON.stringify(label));
    }

    expect(source).toContain("renderAboutVscodeExplorer(labels)");
    expect(source).toContain("renderAboutVscodeTerminal(labels)");
    expect(source).toContain("renderAboutVscodeStatusbar(labels)");
  });

  test("allows forced colors to remap the complete editor text subtree", () => {
    expect(styles).toMatch(
      /@media \(forced-colors: active\)[\s\S]*\.vscode-editor-scroll \*\s*\{[^}]*color:\s*CanvasText\s*!important;[^}]*forced-color-adjust:\s*auto;/,
    );
  });

  test("uses DOM panels rather than image, canvas, or fixed-window simulation", () => {
    for (const className of [
      "vscode-titlebar",
      "vscode-activity-bar",
      "vscode-explorer",
      "vscode-editor-area",
      "vscode-terminal",
      "vscode-statusbar",
    ]) {
      expect(source).toContain(className);
    }

    expect(source).not.toMatch(/<canvas\b|background-image|<img\b/i);
    expect(styles).not.toMatch(/position:\s*fixed/);
  });

  test("uses solid dark left panes without an editor minimap", () => {
    expect(styles).toMatch(
      /\.about-page \.vscode-window\.code-block\s*\{[^}]*backdrop-filter:\s*none;/s,
    );
    expect(styles).toMatch(
      /\.about-page \.vscode-window\.code-block::before\s*\{[^}]*content:\s*none\s*!important;/s,
    );
    expect(styles).toMatch(/\.vscode-explorer\s*\{[^}]*background:\s*#151515;/s);
    expect(source).not.toContain("renderAboutVscodeMinimap");
    expect(source).not.toContain("vscode-minimap");
    expect(styles).not.toContain(".vscode-minimap");
  });
});
