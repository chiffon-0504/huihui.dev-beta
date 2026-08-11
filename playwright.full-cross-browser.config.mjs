import { defineConfig } from "@playwright/test";
import {
  baseConfig,
  firefoxProject,
  webkitProject,
} from "./playwright.base.config.mjs";

export default defineConfig({
  ...baseConfig,
  retries: 0,
  workers: 1,
  projects: [firefoxProject, webkitProject],
});
