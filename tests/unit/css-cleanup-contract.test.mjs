import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();
const authoredStylesheets = [
  "style.css",
  "css/about-code-mobile.css",
  "css/code.css",
  "css/contact.css",
  "css/posts.css",
  "tools/tier-maker/style.css",
];

function stripCommentsPreservingLines(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (comment) =>
    comment.replace(/[^\r\n]/g, " "),
  );
}

// This intentionally supports only the repository's authored block structure.
// It is not a general CSS parser: strings and escapes are respected, then empty
// selector rules and the audited nested at-rules are identified by brace depth.
function findEmptyBlocks(css) {
  const source = stripCommentsPreservingLines(css);
  const stack = [{ segmentStart: 0 }];
  const emptyBlocks = [];
  let quote = null;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];

    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }

    if (character === ";") {
      stack.at(-1).segmentStart = index + 1;
      continue;
    }

    if (character === "{") {
      const parent = stack.at(-1);
      stack.push({
        header: source.slice(parent.segmentStart, index).trim(),
        openIndex: index,
        segmentStart: index + 1,
      });
      continue;
    }

    if (character !== "}" || stack.length === 1) continue;

    const block = stack.pop();
    const body = source.slice(block.openIndex + 1, index);
    const isAuditedAtRule = /^@(media|supports|layer)\b/i.test(block.header);
    const isNormalRule = block.header && !block.header.startsWith("@");

    if (!body.trim() && (isNormalRule || isAuditedAtRule)) {
      const line = source.slice(0, block.openIndex).split(/\r?\n/).length;
      emptyBlocks.push(`${block.header} at line ${line}`);
    }

    stack.at(-1).segmentStart = index + 1;
  }

  return emptyBlocks;
}

function firstRuleBody(css, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = stripCommentsPreservingLines(css).match(
    new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`),
  );
  expect(match, `Expected CSS rule for ${selector}`).not.toBeNull();
  return match[1];
}

describe("authored CSS cleanup contracts", () => {
  test.each(authoredStylesheets)("%s has no empty audited blocks", async (file) => {
    const css = await readFile(path.join(root, file), "utf8");
    expect(findEmptyBlocks(css)).toEqual([]);
  });

  test("removes only the globally overridden Tier Maker declarations", async () => {
    const css = await readFile(
      path.join(root, "tools", "tier-maker", "style.css"),
      "utf8",
    );

    expect(firstRuleBody(css, ".upload-button")).not.toMatch(/\bcolor\s*:/);
    expect(firstRuleBody(css, ".size-control")).not.toMatch(/\bcolor\s*:/);
    expect(firstRuleBody(css, ".tier-row")).not.toMatch(/\bbackground\s*:/);
    expect(firstRuleBody(css, ".tier-label:focus")).not.toMatch(/\bbackground\s*:/);
    expect(firstRuleBody(css, ".pool-content")).not.toMatch(/\bborder-radius\s*:/);
    expect(firstRuleBody(css, ".tier-item")).not.toMatch(/\bborder-radius\s*:/);
    expect(firstRuleBody(css, ".delete-tier")).not.toMatch(
      /\b(?:border-left|background|color)\s*:/,
    );

    expect(css).toMatch(/\.upload-button\s*\{\s*color:var\(--accent-blue/);
    expect(css).toMatch(/\.tier-row\s*\{\s*border-color:[^}]*background:/);
    expect(css).toMatch(/\.tier-label:focus\s*\{\s*background:/);
    expect(css).toMatch(/\.pool-content\s*\{[^}]*border-radius:/);
    expect(css).toMatch(/\.tier-item\s*\{\s*border-radius:/);
    expect(css).toMatch(/\.delete-tier\s*\{[^}]*border-left:[^}]*background:[^}]*color:/);
  });

  test("keeps only the later identical active-nav material declarations", async () => {
    const css = await readFile(path.join(root, "style.css"), "utf8");

    expect(css).not.toContain("background: rgba(0, 154, 255, 0.10)");
    expect(css).not.toContain("border-color: rgba(0, 154, 255, 0.36)");
    expect(firstRuleBody(css, ".sidebar-top nav a.nav-link.active")).toContain(
      "background: rgba(0, 154, 255, 0.11)",
    );
    expect(firstRuleBody(css, ".sidebar-top nav a.nav-link.active")).toContain(
      "border-color: rgba(0, 154, 255, 0.34)",
    );
  });
});
