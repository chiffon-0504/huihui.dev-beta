import assert from "node:assert/strict";
import { validateResponse, validateSecurityHeaders } from "../support/v2-beta-contract.mjs";

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
