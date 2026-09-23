import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const icon = await readFile(new URL("../../v2/public/favicon.ico", import.meta.url));
const digest = createHash("sha256").update(icon).digest("hex");
const routes = ["/", "/en/", "/ja/"].flatMap((prefix) =>
  ["", "about/", "works/", "posts/"].map((page) => prefix + page));

test("every v2 entry serves and decodes the same favicon", async ({ page }) => {
  for (const route of [...routes, "/tools/jev/", "/404.html"]) {
    const response = await page.goto(route);
    expect(response.status(), route).toBe(route === "/404.html" ? 404 : 200);
    const link = page.locator('head link[rel="icon"]');
    await expect(link).toHaveCount(1);
    await expect(link).toHaveAttribute("href", "/favicon.ico");
    // Browser chrome is outside Playwright's DOM: verify the declared resource,
    // delivered bytes and native image decoder instead of claiming a tab screenshot.
    const result = await link.evaluate(async (node) => {
      const response = await fetch(node.href, { cache: "no-store" });
      const bytes = await response.arrayBuffer();
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        (byte) => byte.toString(16).padStart(2, "0")).join("");
      const image = new Image();
      image.src = node.href;
      await image.decode();
      return { status: response.status, type: response.headers.get("content-type"),
        bytes: bytes.byteLength, hash, width: image.naturalWidth, height: image.naturalHeight };
    });
    expect(result, route).toMatchObject({ status: 200, bytes: icon.length, hash: digest, width: 48, height: 48 });
    expect(result.type).toMatch(/^image\/(?:x-icon|vnd\.microsoft\.icon)(?:;|$)/);
  }
});
