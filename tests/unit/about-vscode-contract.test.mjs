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
  test("keeps the profile code as a real accessible local scroll region", () => {
    expect(source).toContain('editorScroll.className = "vscode-editor-scroll"');
    expect(source).toContain('editorScroll.setAttribute("role", "region")');
    expect(source).toContain("editorScroll.tabIndex = 0");
    expect(source).toContain("editorScroll.append(pre)");
    expect(styles).toMatch(
      /\.vscode-editor-scroll\s*\{[^}]*overflow-y:\s*auto;/s,
    );
    expect(codeBlocksSource).toContain('if (pre.closest(".code-block")) return;');
  });

  test("uses native scroll chaining without wheel interception or forced jumps", () => {
    expect(styles).not.toMatch(/overscroll-behavior:\s*contain/);
    expect(source).not.toMatch(/addEventListener\(\s*["']wheel/);
    expect(source).not.toContain("preventDefault()");
    expect(source).not.toContain("scrollIntoView");
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
