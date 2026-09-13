import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { inspectDocument, validateBrowserEvidence, validateResponse, validateSecurityHeaders } from "../support/v2-beta-contract.mjs";

export async function checkNavigation(response, expectedUrl, expectedHeaders) {
  assert(response, "Browser/custom-domain navigation: missing response");
  const headers = await response.allHeaders();
  validateResponse({ status: response.status(), headers, url: response.url(), redirected: Boolean(response.request().redirectedFrom()) }, expectedUrl, "Browser/custom-domain navigation");
  validateSecurityHeaders(headers, expectedHeaders, "Browser/custom-domain navigation");
  assert(headers["content-type"]?.includes("text/html"), "Browser/custom-domain navigation: expected HTML");
  return headers;
}

export async function navigate(page, url, expectedHeaders) {
  let response;
  try { response = await page.goto(url, { waitUntil: "domcontentloaded" }); }
  catch { throw new Error("Browser/custom-domain navigation: network, timeout or blocked redirect; verification failed"); }
  return checkNavigation(response, url, expectedHeaders);
}

export async function guardBrowser(page, baseURL, { contract = "pages", verifyBuild = false } = {}) {
  const errors = [];
  const consoles = [];
  const violations = [];
  const documents = [];
  const pending = [];
  const builtAssets = verifyBuild ? new Set((await readdir(new URL("../../v2/dist/assets/", import.meta.url))).map((name) => `/assets/${name}`)) : null;
  await page.exposeBinding("recordBetaCspViolation", (source, event) => {
    if (source.frame !== page.mainFrame()) errors.push("Browser/custom-domain unexpected frame CSP violation");
    violations.push(event);
  });
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      void window.recordBetaCspViolation(Object.fromEntries(["effectiveDirective", "violatedDirective", "blockedURI", "disposition", "sourceFile", "documentURI", "lineNumber", "columnNumber", "sample", "originalPolicy"].map((key) => [key, event[key]])));
    });
  });
  page.on("pageerror", () => errors.push("Browser/custom-domain script error"));
  page.on("console", (message) => { if (message.type() === "error") consoles.push({ text: message.text(), location: message.location() }); });
  page.on("requestfailed", () => errors.push("Browser/custom-domain request failed"));
  page.on("response", (response) => {
    const headers = response.headers();
    if (response.status() !== 200 || headers["cf-mitigated"]) {
      try {
        validateResponse({ status: response.status(), headers, url: response.url() }, response.url(), "Browser/custom-domain resource");
      } catch (error) { errors.push(error.message); }
    }
    if (verifyBuild) pending.push((async () => {
      const url = new URL(response.url());
      const request = response.request();
      if (request.isNavigationRequest()) {
        assert(request.frame() === page.mainFrame(), "Unexpected frame navigation");
        assert(["/", "/en/", "/ja/"].includes(url.pathname), "Unexpected application route");
        const [html, builtHtml, delivered] = await Promise.all([
          response.text(),
          readFile(new URL(`../../v2/dist${url.pathname}index.html`, import.meta.url), "utf8"),
          response.allHeaders(),
        ]);
        documents.push(inspectDocument({ html, builtHtml, url: url.href, contract, policy: delivered["content-security-policy"] }));
      } else {
        assert(/^\/assets\/[\w.-]+\.(js|css|svg)$/.test(url.pathname) && !url.search, "Unexpected resource outside repository build");
        // Start reading the browser body immediately, independently of disk IO.
        const [actual, expected] = await Promise.all([
          response.body(), readFile(new URL(`../../v2/dist${url.pathname}`, import.meta.url)),
        ]);
        assert(actual.equals(expected), "Served asset bytes differ from repository build");
      }
    })().catch((error) => errors.push(error.code === "ENOENT" ? "Resource absent from repository build" : error.message)));
  });
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const unexpectedBuildRequest = verifyBuild && (url.search || (request.isNavigationRequest()
      ? request.frame() !== page.mainFrame() || !["/", "/en/", "/ja/"].includes(url.pathname)
      : !builtAssets.has(url.pathname)));
    if (unexpectedBuildRequest || url.origin !== new URL(baseURL).origin || request.method() !== "GET" || url.pathname.startsWith("/api/") || url.pathname.startsWith("/cdn-cgi/challenge-platform/")) {
      errors.push("Browser/custom-domain forbidden request or challenge resource; no challenge solving allowed");
      await route.abort();
    } else {
      await route.fallback();
    }
  });
  return async () => {
    await page.waitForLoadState("load");
    // A browser round trip flushes binding deliveries before checking evidence.
    await page.evaluate(() => undefined);
    await Promise.all(pending);
    assert(errors.length === 0, errors.join("\n"));
    const classified = validateBrowserEvidence({ contract, documents, violations, consoles });
    if (classified) console.log(`Classified ${classified} pinned Cloudflare JSD bootstrap block(s); application CSP remains enforcing.`);
  };
}
