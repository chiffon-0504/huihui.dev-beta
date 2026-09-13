import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { parseDocument } from "yaml";
import { responseMetadata, securityHeaders, validateResponse, validateSecurityHeaders } from "../support/v2-beta-contract.mjs";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("existing Beta CD selects v2 without adding a Pages upload path", async () => {
  const source = await read(".github/workflows/beta-cd.yml");
  const document = parseDocument(source);
  expect(document.errors).toEqual([]);
  const workflow = document.toJS();
  const commands = workflow.jobs["live-smoke"].steps.map((step) => step.run).filter(Boolean);
  const smoke = commands.indexOf("npx playwright test --config=playwright.v2-beta.config.mjs --project=chromium --workers=1 --retries=0");
  expect(smoke).toBeGreaterThan(commands.indexOf("npm run build:v2"));
  expect(commands.indexOf("node tests/scripts/beta-deployment-sync.mjs wait-pages-quiescent")).toBeLessThan(smoke);
  expect(commands.indexOf("node tests/scripts/beta-deployment-sync.mjs verify-pages-active")).toBeGreaterThan(smoke);
  expect(source).not.toMatch(/pages deploy|wrangler-action|workflow_dispatch/);
  const config = (await import("../../playwright.v2-beta.config.mjs")).default;
  expect(config.testDir).toBe("./tests/v2-beta");
  expect(config.use.baseURL).toBe("https://beta.huihui.dev");
  expect(config.use.trace).toBe("off");
  expect(config.retries).toBe(0);
  expect(config.webServer).toBeUndefined();
});

test("v2 beta security headers remain enforcing and self-only", async () => {
  const source = await read("v2/public/_headers");
  const headers = securityHeaders(source);
  expect(headers["content-security-policy"]).toContain("script-src 'self'; style-src 'self';");
  expect(headers["x-robots-tag"]).toBe("noindex, nofollow");
  expect(source).not.toMatch(/unsafe-inline|unsafe-eval|api\.huihui\.dev|Report-Only/);
  expect(() => validateSecurityHeaders({}, headers, "beta")).toThrow("delivery mismatch");
  expect(() => securityHeaders("/*\n  X-Test: value\n")).toThrow("Missing enforcing");
});

test("navigation failures keep diagnostics free of cookies and credentials", () => {
  const headers = { server: "cloudflare", "cf-mitigated": "challenge", "set-cookie": "secret", authorization: "secret", location: "https://example.test/?token=secret" };
  expect(responseMetadata(403, headers)).toBe('{"status":403,"server":"cloudflare","cf-mitigated":"challenge"}');
  expect(() => validateResponse({ status: 403, headers }, "https://beta.huihui.dev/", "beta")).toThrow("challenge/security response");
  expect(() => validateResponse({ status: 200, headers: {}, url: "secret", redirected: true }, "https://beta.huihui.dev/", "beta")).toThrow("unexpected redirect");
});
