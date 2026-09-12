import { defineConfig } from "@playwright/test";
import { chromiumProject } from "./playwright.base.config.mjs";

const local = process.env.V2_PREVIEW_LOCAL === "1";
const baseURL = local ? "http://127.0.0.1:4176" : "https://v2.beta.huihui.dev";

export default defineConfig({
  testDir: "./tests/v2-preview",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: "line",
  use: { baseURL, timezoneId: "Asia/Taipei", trace: "retain-on-failure" },
  webServer: local ? {
    command: "node tests/scripts/v2-preview-server.mjs",
    url: baseURL,
    reuseExistingServer: false,
  } : undefined,
  projects: [chromiumProject],
});
