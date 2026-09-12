import { defineConfig } from "@playwright/test";
import { chromiumProject, firefoxProject, webkitProject } from "./playwright.base.config.mjs";

export default defineConfig({
  testDir: "./tests/v2",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:4175",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run preview:v2 -- --host 127.0.0.1 --port 4175 --strictPort",
    url: "http://127.0.0.1:4175",
    reuseExistingServer: false,
  },
  projects: [chromiumProject, firefoxProject, webkitProject],
});
