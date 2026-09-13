import { defineConfig } from "@playwright/test";
import { chromiumProject } from "./playwright.base.config.mjs";
import { betaSmokeTarget } from "./tests/support/v2-beta-contract.mjs";

const local = process.env.V2_BETA_LOCAL === "1";
// The pinned Playwright runtime otherwise adds the page DOM to error-context.md.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = "1";
const { baseURL, contract } = betaSmokeTarget(process.env);

export default defineConfig({
  testDir: "./tests/v2-beta",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: "line",
  metadata: { contract },
  testIgnore: !local ? /fail-closed\.spec\.mjs/ : undefined,
  // Network traces can retain cookies and challenge bodies; use safe diagnostics.
  use: { baseURL, timezoneId: "Asia/Taipei", trace: "off" },
  webServer: local ? {
    command: "node tests/scripts/v2-beta-server.mjs",
    url: baseURL,
    reuseExistingServer: false,
  } : undefined,
  projects: [chromiumProject],
});
