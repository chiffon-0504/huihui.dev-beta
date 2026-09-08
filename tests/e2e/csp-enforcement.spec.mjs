import { expect, test } from "@playwright/test";
import { applyPagesCsp, openCspProbe, readPagesCspHeaders } from "../support/csp-enforcement.mjs";

const enforcingHeader = "content-security-policy";
const reportOnlyHeader = "content-security-policy-report-only";
const policy = "default-src 'self'; script-src 'self'; object-src 'none'";

async function expectAllowedBehavior(page) {
  await expect(page.locator("html")).toHaveAttribute("data-observer", "ready");
  await expect(page.locator("html")).toHaveAttribute("data-complete", "true");
  await page.getByRole("button", { name: "Allowed action" }).click();
  await expect(page.locator("output")).toHaveText("allowed interaction ran");
}

async function expectInlineViolation(page, disposition) {
  await expect.poll(() => page.evaluate(() => window.cspViolations)).toContainEqual({
    disposition,
    effectiveDirective: "script-src-elem",
    blockedURI: "inline",
  });
}

test("enforcing CSP blocks inline execution while allowing same-origin scripts", async ({ page }) => {
  const response = await openCspProbe(page, { [enforcingHeader]: policy });
  expect(response.headers()[enforcingHeader]).toBe(policy);
  expect(response.headers()[reportOnlyHeader]).toBeUndefined();
  await expectAllowedBehavior(page);
  await expectInlineViolation(page, "enforce");
  await expect(page.locator("html")).toHaveAttribute("data-forbidden", "not-run");
});

test("Report-Only reports the same violation but lets the inline script execute", async ({ page }) => {
  const response = await openCspProbe(page, { [reportOnlyHeader]: policy });
  expect(response.headers()[enforcingHeader]).toBeUndefined();
  expect(response.headers()[reportOnlyHeader]).toBe(policy);
  await expectAllowedBehavior(page);
  await expectInlineViolation(page, "report");
  await expect(page.locator("html")).toHaveAttribute("data-forbidden", "ran");
});

test("without CSP the inline probe executes and the harness still works", async ({ page }) => {
  const response = await openCspProbe(page, {});
  expect(response.headers()[enforcingHeader]).toBeUndefined();
  expect(response.headers()[reportOnlyHeader]).toBeUndefined();
  await expectAllowedBehavior(page);
  await expect(page.locator("html")).toHaveAttribute("data-forbidden", "ran");
  expect(await page.evaluate(() => window.cspViolations)).toEqual([]);
});

test("repository Pages CSP enforces the inline-script contract", async ({ page }) => {
  const headers = await readPagesCspHeaders();
  const response = await openCspProbe(page, headers);
  expect(response.headers()[enforcingHeader]).toBeTruthy();
  await expectAllowedBehavior(page);
  await expectInlineViolation(page, "enforce");
  await expect(page.locator("html")).toHaveAttribute("data-forbidden", "not-run");
});

test("real homepage drawer works with the repository Pages CSP applied", async ({ page, baseURL }) => {
  await applyPagesCsp(page, baseURL);
  await page.setViewportSize({ width: 390, height: 844 });
  const response = await page.goto("/", { waitUntil: "load" });
  expect(response.status()).toBe(200);
  expect(response.headers()[enforcingHeader]).toBeTruthy();
  const toggle = page.locator("#menuToggle");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#site-sidebar")).toHaveClass(/\bopen\b/);
  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toBeFocused();
});
