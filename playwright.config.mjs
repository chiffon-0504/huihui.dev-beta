import { defineConfig } from "@playwright/test";
import { baseConfig, chromiumProject } from "./playwright.base.config.mjs";

export default defineConfig({
  ...baseConfig,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  projects: [chromiumProject],
});
