import assert from "node:assert/strict";
import { validateManifest, validateResponse, validateSecurityHeaders } from "../support/v2-preview-contract.mjs";

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

export async function checkBrowserManifest(page, expected, expectedHeaders) {
  // This fetch executes inside the real page under its delivered enforcing CSP.
  // APIRequestContext and Node fetch must never own custom-domain acceptance.
  let result;
  try {
    result = await page.evaluate(async () => {
      const response = await fetch("/deployment.json", { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000) });
      const headers = Object.fromEntries([...response.headers].filter(([name]) => [
        "server", "content-type", "cf-ray", "cf-cache-status", "cf-mitigated",
        "content-security-policy", "x-content-type-options", "referrer-policy", "x-robots-tag", "cache-control",
      ].includes(name)));
      const metadata = { status: response.status, url: response.url, redirected: response.redirected, headers };
      if (response.status !== 200 || headers["cf-mitigated"] || !headers["content-type"]?.includes("application/json")) return metadata;
      try { return { ...metadata, manifest: await response.json() }; }
      catch { return metadata; }
    });
  } catch { throw new Error("Browser/custom-domain manifest: network, CSP, timeout or redirect failure"); }
  validateResponse(result, new URL("/deployment.json", page.url()).href, "Browser/custom-domain manifest");
  validateSecurityHeaders(result.headers, expectedHeaders, "Browser/custom-domain manifest");
  assert(result.headers["content-type"]?.includes("application/json"), "Browser/custom-domain manifest: expected JSON; possible security response");
  validateManifest(result.manifest, expected);
}

export async function guardBrowser(page, baseURL) {
  const errors = [];
  page.on("pageerror", () => errors.push("Browser/custom-domain script error"));
  page.on("console", (message) => { if (message.type() === "error") errors.push("Browser/custom-domain console error"); });
  page.on("requestfailed", () => errors.push("Browser/custom-domain request failed"));
  page.on("response", (response) => {
    const headers = response.headers();
    if (response.status() !== 200 || headers["cf-mitigated"]) {
      try {
        validateResponse({ status: response.status(), headers, url: response.url() }, response.url(), "Browser/custom-domain resource");
      } catch (error) { errors.push(error.message); }
    }
  });
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== new URL(baseURL).origin || request.method() !== "GET" || url.pathname.startsWith("/api/") || url.pathname.startsWith("/cdn-cgi/challenge-platform/")) {
      errors.push("Browser/custom-domain forbidden request or challenge resource; no challenge solving allowed");
      await route.abort();
    } else {
      await route.fallback();
    }
  });
  return () => assert(errors.length === 0, errors.join("\n"));
}
