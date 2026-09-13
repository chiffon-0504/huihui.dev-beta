import { readFile } from "node:fs/promises";
import { expect, test, vi } from "vitest";
import { parseDocument } from "yaml";
import { betaSmokeTarget, cloudflareJsdBootstrap, inspectDocument, jsdConsoleText, validateBrowserEvidence, responseMetadata, securityHeaders, validateResponse, validateSecurityHeaders } from "../support/v2-beta-contract.mjs";

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
  const steps = workflow.jobs["live-smoke"].steps;
  const smokes = steps.filter((step) => step.run?.startsWith("npx playwright test"));
  expect(smokes.map((step) => step.env)).toEqual([
    { V2_BETA_CONTRACT: "pages", V2_BETA_PAGES_URL: "${{ steps.pages.outputs.pages_url }}" },
    { V2_BETA_CONTRACT: "custom" },
  ]);
  expect(steps.find((step) => step.id === "pages").run).toBe("node tests/scripts/beta-deployment-sync.mjs wait-pages-quiescent");
  vi.stubEnv("V2_BETA_LOCAL", "0");
  vi.stubEnv("V2_BETA_CONTRACT", "pages");
  vi.stubEnv("V2_BETA_PAGES_URL", "https://12345678.huihuidev-beta.pages.dev");
  const config = (await import("../../playwright.v2-beta.config.mjs")).default;
  vi.unstubAllEnvs();
  expect(config.testDir).toBe("./tests/v2-beta");
  expect(config.use.baseURL).toBe("https://12345678.huihuidev-beta.pages.dev");
  expect(config.use.trace).toBe("off");
  expect(config.retries).toBe(0);
  expect(config.webServer).toBeUndefined();
});

test("strict Pages URL must be explicit and immutable; custom host cannot be overridden", () => {
  expect(() => betaSmokeTarget({})).toThrow("API-verified");
  for (const value of ["https://beta.huihui.dev", "https://huihuidev-beta.pages.dev", "https://12345678.huihuidev-beta.pages.dev.evil.test", "http://12345678.huihuidev-beta.pages.dev"]) {
    expect(() => betaSmokeTarget({ V2_BETA_PAGES_URL: value })).toThrow();
  }
  expect(betaSmokeTarget({ V2_BETA_CONTRACT: "custom", V2_BETA_PAGES_URL: "https://evil.test" }).baseURL).toBe("https://beta.huihui.dev");
  expect(() => betaSmokeTarget({ V2_BETA_CONTRACT: "typo" })).toThrow();
});

const policy = securityHeaders(await read("v2/public/_headers"))["content-security-policy"];
const builtHtml = "<!doctype html>\n<html><body><main>Build</main></body></html>";
const bootstrap = cloudflareJsdBootstrap("0123456789abcdef", "MTc4OTI4OTcwOQ==");
const injectedHtml = builtHtml.replace("</body>", `<script>${bootstrap}</script></body>`);
function evidence() {
  const document = inspectDocument({ html: injectedHtml, builtHtml, url: "https://beta.huihui.dev/", contract: "custom", policy });
  return {
    contract: "custom", documents: [document],
    violations: [{ effectiveDirective: "script-src-elem", violatedDirective: "script-src-elem", blockedURI: "inline", disposition: "enforce", sourceFile: document.url, documentURI: document.url, lineNumber: document.line, columnNumber: 0, sample: "", originalPolicy: policy }],
    consoles: [{ text: jsdConsoleText(document.hash), location: { url: document.url, lineNumber: document.line - 1, columnNumber: 0 } }],
  };
}

test("custom accepts exactly the pinned JSD response plus corresponding enforced browser block", () => {
  expect(validateBrowserEvidence(evidence())).toBe(1);
  expect(inspectDocument({ html: builtHtml, builtHtml, url: "https://beta.huihui.dev/", contract: "custom", policy })).toBeNull();
  expect(validateBrowserEvidence({ contract: "pages", documents: [], violations: [], consoles: [] })).toBe(0);
});

test.each([
  ["Pages never accepts an exception", (data) => { data.contract = "pages"; }],
  ["non-beta host", (data) => { data.documents[0].url = "https://other.test/"; }],
  ["directive alone", (data) => { data.violations[0] = { effectiveDirective: "script-src-elem" }; }],
  ["other directive", (data) => { data.violations[0].effectiveDirective = "style-src-elem"; }],
  ["external resource", (data) => { data.violations[0].blockedURI = "https://evil.test/script.js"; }],
  ["unknown inline line", (data) => { data.violations[0].lineNumber++; }],
  ["application JS source", (data) => { data.violations[0].sourceFile = "https://beta.huihui.dev/assets/main.js"; }],
  ["report-only", (data) => { data.violations[0].disposition = "report"; }],
  ["extra inline", (data) => { data.violations.push({ ...data.violations[0] }); }],
  ["extra console error", (data) => { data.consoles.push({ text: "unrelated error", location: {} }); }],
  ["wrong console hash", (data) => { data.consoles[0].text = jsdConsoleText("unknown"); }],
  ["wrong console line", (data) => { data.consoles[0].location.lineNumber++; }],
  ["missing response fingerprint", (data) => { data.documents = []; }],
  ["missing violation", (data) => { data.violations = []; }],
  ["missing diagnostic", (data) => { data.consoles = []; }],
])("fails closed: %s", (_name, mutate) => {
  const data = evidence();
  mutate(data);
  expect(() => validateBrowserEvidence(data)).toThrow();
});

test.each([
  ["Pages injection", injectedHtml, "pages", "https://12345678.huihuidev-beta.pages.dev/"],
  ["wrong host injection", injectedHtml, "custom", "https://other.test/"],
  ["changed fingerprint", injectedHtml.replace("a.height=1", "a.height=2")],
  ["changed JSD path", injectedHtml.replace("jsd/main.js", "jsd/other.js")],
  ["unknown inline", injectedHtml.replace("</body>", "<script>window.extra=true</script></body>")],
  ["unknown external", injectedHtml.replace("</body>", '<script src="/extra.js"></script></body>')],
  ["unknown resource", injectedHtml.replace("</body>", '<img src="/extra.png"></body>')],
  ["changed application", injectedHtml.replace("Build", "Changed")],
  ["missing fingerprint", injectedHtml.replace(bootstrap, "window.extra=true")],
])("rejects HTML: %s", (_name, html, contract = "custom", url = "https://beta.huihui.dev/") => {
  expect(() => inspectDocument({ html, builtHtml, url, contract, policy })).toThrow();
});

test("v2 beta security headers remain enforcing and self-only", async () => {
  const source = await read("v2/public/_headers");
  const headers = securityHeaders(source);
  expect(headers["content-security-policy"]).toBe("default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'none';");
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
