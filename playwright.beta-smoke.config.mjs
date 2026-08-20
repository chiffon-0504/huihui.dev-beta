import { defineConfig } from "@playwright/test";
import { chromiumProject } from "./playwright.base.config.mjs";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "beta-deployment-smoke.spec.mjs",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never" }]]
    : "line",
  use: {
    baseURL: "https://beta.huihui.dev",
    trace: "retain-on-failure",
  },
  projects: [chromiumProject],
});
