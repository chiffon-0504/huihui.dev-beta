import { devices } from "@playwright/test";

export const baseConfig = {
  testDir: "./tests/e2e",
  testIgnore: ["beta-deployment-smoke.spec.mjs"],
  globalSetup: "./tests/support/global-setup.mjs",
  fullyParallel: false,
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never" }]]
    : "line",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },
};

export const chromiumProject = {
  name: "chromium",
  use: { ...devices["Desktop Chrome"] },
};

export const firefoxProject = {
  name: "firefox",
  use: { ...devices["Desktop Firefox"] },
};

export const webkitProject = {
  name: "webkit",
  use: { ...devices["Desktop Safari"] },
};
