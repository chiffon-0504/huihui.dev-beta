// DIAGNOSTIC ONLY — DO NOT MERGE.
import { defineConfig } from '@playwright/test';
import { baseConfig, chromiumProject } from './playwright.base.config.mjs';
export default defineConfig({
  ...baseConfig,
  testDir:'./tests/diagnostic',
  outputDir:'diagnostic-results',
  reporter:[['line'],['json',{outputFile:'diagnostic-report.json'}]],
  workers:1,
  retries:0,
  use:{...baseConfig.use,trace:'on'},
  projects:[chromiumProject],
});
