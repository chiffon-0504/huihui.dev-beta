import { defineConfig } from "@playwright/test";
import {
  baseConfig,
  firefoxProject,
  webkitProject,
} from "./playwright.base.config.mjs";

export default defineConfig({
  ...baseConfig,
  // These specs intentionally use Chromium-only CDP Network sessions.
  testIgnore: [
    ...baseConfig.testIgnore,
    "about-media.spec.mjs",
    "milestone-images.spec.mjs",
  ],
  retries: 0,
  workers: 1,
  projects: [firefoxProject, webkitProject],
});
