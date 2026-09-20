import { expect, test } from "@playwright/test";

// Temporary acceptance probe for PR #241. Never merge this test into main.
test("intentional Chromium failure must block the required V2 gate", async ({ page, browserName }) => {
  await page.goto("/");
  expect(browserName, "Intentional negative control for the required V2 aggregate").not.toBe("chromium");
});
