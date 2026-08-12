import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const rootDir = process.cwd();
const homePages = ["index.html", "en/index.html", "ja/index.html"];
const lightboxPages = [
  "about/index.html",
  "en/about/index.html",
  "ja/about/index.html",
  "works/index.html",
  "en/works/index.html",
  "ja/works/index.html",
  "milestones/index.html",
  "en/milestones/index.html",
  "ja/milestones/index.html",
];

describe("lightbox markup", () => {
  it.each(homePages)("does not retain dead Lightbox markup in %s", (file) => {
    const html = fs.readFileSync(path.join(rootDir, file), "utf8");

    expect(html).not.toMatch(/\bid="lightbox(?:Img|Close)?"/);
  });

  it.each(lightboxPages)("uses a native dialog and real close button in %s", (file) => {
    const html = fs.readFileSync(path.join(rootDir, file), "utf8");

    expect(html).toMatch(/<dialog\b[^>]*\bid="lightbox"[^>]*>/);
    expect(html).toMatch(
      /<button\b[^>]*\btype="button"[^>]*\bid="lightboxClose"[^>]*>/,
    );
    expect(html).toContain("</dialog>");
    expect(html).not.toMatch(/<span\b[^>]*\bid="lightboxClose"/);
  });
});
