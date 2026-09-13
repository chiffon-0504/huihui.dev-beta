import { defineConfig } from "@playwright/test";
import { chromiumProject } from "./playwright.base.config.mjs";
import { execFileSync } from "node:child_process";

const local = process.env.V2_PREVIEW_LOCAL === "1";
// The pinned Playwright runtime otherwise adds the page DOM to error-context.md.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = "1";
// The local-only server supplies a fixture manifest. Live runs require TARGET_SHA.
if (local) process.env.TARGET_SHA = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const baseURL = local ? "http://127.0.0.1:4176" : "https://v2.beta.huihui.dev";

export default defineConfig({
  testDir: "./tests/v2-preview",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: "line",
  // Network traces can retain cookies and challenge bodies; use safe diagnostics.
  use: { baseURL, timezoneId: "Asia/Taipei", trace: "off" },
  webServer: local ? {
    command: "node tests/scripts/v2-preview-server.mjs",
    url: baseURL,
    reuseExistingServer: false,
  } : undefined,
  projects: [chromiumProject],
});
