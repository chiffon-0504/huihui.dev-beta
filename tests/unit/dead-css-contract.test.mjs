import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, test } from "vitest";

const root = process.cwd();

let contactCss;
let globalCss;
let tierMakerCss;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function expectSelectorAbsent(css, selector) {
  const selectorPattern = new RegExp(
    `${escapeRegExp(selector)}(?=\\s*(?:,|\\{))`,
  );

  expect(stripComments(css)).not.toMatch(selectorPattern);
}

function getRuleBody(css, selectors) {
  const selectorPattern = selectors.map(escapeRegExp).join("\\s*,\\s*");
  const match = stripComments(css).match(
    new RegExp(`${selectorPattern}\\s*\\{([^}]*)\\}`),
  );

  expect(match, `Expected CSS rule for ${selectors.join(", ")}`).not.toBeNull();
  return match[1];
}

beforeAll(async () => {
  [contactCss, globalCss, tierMakerCss] = await Promise.all([
    readFile(path.join(root, "css", "contact.css"), "utf8"),
    readFile(path.join(root, "style.css"), "utf8"),
    readFile(path.join(root, "tools", "tier-maker", "style.css"), "utf8"),
  ]);
});

describe("high-confidence dead CSS removal", () => {
  test("removes the Contact eyebrow without changing live Contact and label rules", () => {
    expectSelectorAbsent(contactCss, ".contact-eyebrow");
    expectSelectorAbsent(globalCss, ".contact-eyebrow");
    expect(contactCss).toMatch(/\.contact-intro\s*\{/);
    expect(contactCss).toMatch(/\.contact-form\s*\{/);

    expect(
      getRuleBody(globalCss, [
        ".project-update-label",
        ".apod-label",
        ".tech-news-category",
      ]),
    ).toContain("color: var(--accent-cyan)");
    expect(
      getRuleBody(globalCss, [
        ".project-update-label",
        ".apod-label",
        ".tech-news-category",
        ".project-update-meta",
        ".hashtag",
      ]),
    ).toContain("color: var(--accent-blue) !important");
  });

  test("removes Tier Maker button aliases while preserving live button rules", () => {
    for (const selector of [
      ".download-button",
      ".download-button:hover",
      ".add-tier-button",
      ".add-tier-button:hover",
    ]) {
      expectSelectorAbsent(tierMakerCss, selector);
    }

    const buttonRule = getRuleBody(tierMakerCss, [
      "button",
      ".upload-button",
      ".tier-toolbar button",
      ".tier-maker-page button",
    ]);
    expect(buttonRule).toContain("background: rgba(255,255,255,.68)");
    expect(buttonRule).toContain("border: 1px solid rgba(80,120,170,.22)");
    expect(buttonRule).toContain("color: rgba(10,15,25,.9)");

    const hoverRule = getRuleBody(tierMakerCss, [
      "button:hover",
      ".upload-button:hover",
      ".tier-toolbar button:hover",
      ".tier-maker-page button:hover",
    ]);
    expect(hoverRule).toContain("background: rgba(255,255,255,.76)");
    expect(hoverRule).toContain("border-color: rgba(80,120,170,.28)");
  });

  test("removes unused milestone utilities and preserves the live utility set", () => {
    for (const selector of [".past", ".present", ".eternal"]) {
      expectSelectorAbsent(globalCss, selector);
    }

    expect(getRuleBody(globalCss, [".future"])).toContain("color: #913A79");
    expect(getRuleBody(globalCss, [".beyond"])).toContain("color: #BF0D25");
    expect(getRuleBody(globalCss, [".ex"])).toContain(
      "background: linear-gradient(to bottom, #551F6B, #006898)",
    );
    expect(getRuleBody(globalCss, [".hashtag"])).toContain(
      "color: #1d9bf0 !important",
    );
    expect(getRuleBody(globalCss, [".hashtag:hover"])).toContain(
      "text-decoration: underline",
    );
  });

  test("removes the retired sidebar footer alias and preserves sidebar-bottom", () => {
    expectSelectorAbsent(globalCss, ".sidebar-footer");

    expect(
      getRuleBody(globalCss, [
        ".sidebar",
        ".sidebar a",
        ".sidebar nav a",
        ".sidebar-top nav a",
        ".lang-switch a",
        ".sidebar-bottom",
      ]),
    ).toContain("color: rgba(10, 15, 25, 0.82) !important");
  });

  test("removes retired shared aliases and preserves every live list sibling", () => {
    for (const selector of [
      ".work-info",
      ".page-title",
      ".page-subtitle",
      ".waiting-area",
    ]) {
      expectSelectorAbsent(globalCss, selector);
    }

    const headingRule = getRuleBody(globalCss, [
      ".posts-header h1",
      ".main > h1",
    ]);
    expect(headingRule).toContain("color: rgba(10, 15, 25, 0.94) !important");
    expect(headingRule).toContain("-webkit-text-fill-color: currentColor");
    expect(getRuleBody(globalCss, [".posts-header p"])).toContain(
      "color: rgba(45, 58, 78, 0.76) !important",
    );

    const overflowRule = getRuleBody(globalCss, [
      "img",
      ".apod-card",
      ".project-update-card",
      ".galgame-showcase",
      ".interest-gallery",
      ".interest-gallery img",
      ".galgame-banner",
      ".post-image",
      ".tier-board",
      ".image-pool",
      ".works-gallery",
      ".works-showcase-grid",
    ]);
    expect(overflowRule).toContain("max-width: 100% !important");
    expect(overflowRule).toContain("box-sizing: border-box !important");
  });
});
