import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, test } from "vitest";

const root = process.cwd();
let source;
let styles;
let codeBlocksSource;

beforeAll(async () => {
  [source, styles, codeBlocksSource] = await Promise.all([
    readFile(path.join(root, "js/about-vscode.js"), "utf8"),
    readFile(path.join(root, "css/about-vscode.css"), "utf8"),
    readFile(path.join(root, "js/code-blocks.js"), "utf8"),
  ]);
});

describe("About VS Code workspace contracts", () => {
  test("keeps the profile code as a real accessible local scroll region", () => {
    expect(source).toContain('editorScroll.className = "vscode-editor-scroll"');
    expect(source).toContain('editorScroll.setAttribute("role", "region")');
    expect(source).toContain("editorScroll.tabIndex = 0");
    expect(source).toContain("editorScroll.append(pre)");
    expect(styles).toMatch(
      /\.vscode-editor-scroll\s*\{[^}]*overflow-y:\s*auto;[^}]*overscroll-behavior:\s*contain;/s,
    );
    expect(codeBlocksSource).toContain('if (pre.closest(".code-block")) return;');
  });

  test("limits the unsupported-browser wheel fallback to editor boundaries", () => {
    expect(source).toContain('CSS.supports("overscroll-behavior", "contain")');
    expect(source).toContain('editorScroll.addEventListener(\n    "wheel"');
    expect(source).toContain("if (reachedTop || reachedBottom) event.preventDefault()");
    expect(source).not.toMatch(/(?:window|document)\.addEventListener\(\s*["']wheel/);
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
});
