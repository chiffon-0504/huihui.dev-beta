import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { inspectDocument, validateBrowserEvidence, validateResponse, validateSecurityHeaders } from "../support/v2-beta-contract.mjs";

const applicationRoutes = ["/", "/en/", "/ja/", "/about/", "/en/about/", "/ja/about/", "/works/", "/en/works/", "/ja/works/"];

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
  const responsePolicies = [];
  const pending = [];
  const builtAssets = verifyBuild ? new Set((await readdir(new URL("../../v2/dist/assets/", import.meta.url))).map((name) => `/assets/${name}`)) : null;
  const assetHashes = new Map(verifyBuild ? await Promise.all([...builtAssets].map(async (path) => [path, createHash("sha256").update(await readFile(new URL(`../../v2/dist${path}`, import.meta.url))).digest("hex")])) : []);
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
        assert(applicationRoutes.includes(url.pathname), "Unexpected application route");
        const [html, builtHtml, delivered] = await Promise.all([
          response.text(),
          readFile(new URL(`../../v2/dist${url.pathname}index.html`, import.meta.url), "utf8"),
          response.allHeaders(),
        ]);
        documents.push(inspectDocument({ html, builtHtml, url: url.href, contract, policy: delivered["content-security-policy"] }));
        responsePolicies.push({ url: url.href, enforcingPolicy: delivered["content-security-policy"], reportOnlyPolicy: delivered["content-security-policy-report-only"] });
      } else {
        assert(/^\/assets\/[\w.-]+\.(js|css|svg|webp)$/.test(url.pathname) && !url.search, "Unexpected resource outside repository build");
      }
    })().catch((error) => errors.push(error.code === "ENOENT" ? "Resource absent from repository build" : error.message)));
  });
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const unexpectedBuildRequest = verifyBuild && (url.search || (request.isNavigationRequest()
      ? request.frame() !== page.mainFrame() || !applicationRoutes.includes(url.pathname)
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
    if (verifyBuild) {
      // Read every emitted asset through the browser's same-origin fetch under
      // delivered CSP, independently of DevTools body retention across
      // navigations. Any fetch or digest failure remains a hard failure.
      const assets = await page.evaluate(async (paths) => Promise.all(paths.map(async (path) => {
        const response = await fetch(path, { redirect: "error", cache: "no-store" });
        if (response.status !== 200 || response.headers.has("cf-mitigated") || response.url !== new URL(path, location.origin).href) throw new Error("Browser build asset fetch failed");
        const digest = await crypto.subtle.digest("SHA-256", await response.arrayBuffer());
        return { path, hash: [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("") };
      })), [...builtAssets]);
      for (const asset of assets) assert(asset.hash === assetHashes.get(asset.path), "Served asset bytes differ from repository build");
    }
    // Preserve the existing round trip; edge telemetry is classified separately
    // from enforcing evidence, not resolved by additional synchronization.
    await page.evaluate(() => undefined);
    await Promise.all(pending);
    assert(errors.length === 0, errors.join("\n"));
    const classified = validateBrowserEvidence({ contract, url: page.url(), documents, violations, consoles, responsePolicies, assetUrls: [...(builtAssets || [])].map((path) => new URL(path, baseURL).href) });
    if (classified) console.log(`Classified ${classified} pinned Cloudflare JSD bootstrap block(s); application CSP remains enforcing.`);
    const reports = violations.filter((event) => event.disposition === "report").length;
    if (reports) console.log(`Classified ${reports} Cloudflare Report-Only monitoring event(s) attributed to delivered beta response policies; enforcing evidence validated separately.`);
    return { jsdBlocks: classified, reportOnlyEvents: reports };
  };
}
