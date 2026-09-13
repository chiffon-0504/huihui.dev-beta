import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { checkBrowserManifest, guardBrowser, navigate } from "./browser.mjs";
import { securityHeaders } from "../support/v2-preview-contract.mjs";

const origin = "http://v2-preview-fixture.test";
const headers = securityHeaders(await readFile(new URL("../../v2/public/_headers", import.meta.url), "utf8"));
const manifest = { project: "huihuidev-v2-beta", repository: "chiffon-0504/huihui.dev-beta", sha: "a".repeat(40) };

// Cases below run in real Chromium with isolated, intercepted responses.
for (const scenario of ["challenge", "403", "missing-csp", "network"]) {
  test(`browser navigation blocks ${scenario}`, async ({ page }) => {
    let requests = 0;
    await page.route(`${origin}/**`, async (route) => {
      requests++;
      if (scenario === "network") return route.abort();
      const delivered = { ...headers };
      if (scenario === "challenge") delivered["cf-mitigated"] = "challenge";
      if (scenario === "missing-csp") delete delivered["content-security-policy"];
      await route.fulfill({ status: ["challenge", "403"].includes(scenario) ? 403 : 200, headers: delivered, contentType: "text/html", body: "<!doctype html><title>Fixture</title>" });
    });
    const failure = scenario === "challenge" ? /challenge\/security/ : scenario === "403" ? /HTTP failure/ : scenario === "network" ? /network, timeout/ : /content-security-policy delivery mismatch/;
    await expect(navigate(page, `${origin}/`, headers)).rejects.toThrow(failure);
    expect(requests).toBe(1);
  });
}

test("browser rejects a real redirect even when the final page has valid security headers", async ({ page }) => {
  // Playwright routing does not intercept the subsequent request in a redirect chain.
  const server = createServer((request, response) => {
    if (request.url === "/") response.writeHead(302, { location: "/other" }).end();
    else response.writeHead(200, { ...headers, "content-type": "text/html" }).end("<!doctype html><main>Fixture</main>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await expect(navigate(page, `http://127.0.0.1:${server.address().port}/`, headers)).rejects.toThrow("unexpected redirect");
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

for (const scenario of ["valid", "challenge", "wrong-sha", "html", "redirect", "csp-blocks-fetch"]) {
  test(`browser-context manifest is strict: ${scenario}`, async ({ page }) => {
    let manifestRequests = 0;
    const delivered = { ...headers };
    if (scenario === "csp-blocks-fetch") delivered["content-security-policy"] = headers["content-security-policy"].replace("connect-src 'self'", "connect-src 'none'");
    await page.route(`${origin}/**`, async (route) => {
      if (new URL(route.request().url()).pathname !== "/deployment.json") {
        return route.fulfill({ headers: delivered, contentType: "text/html", body: "<!doctype html><main>Fixture</main>" });
      }
      manifestRequests++;
      if (scenario === "redirect") return route.fulfill({ status: 302, headers: { location: `${origin}/other` } });
      await route.fulfill({
        status: scenario === "challenge" ? 403 : 200,
        headers: { ...headers, ...(scenario === "challenge" ? { "cf-mitigated": "challenge" } : {}) },
        contentType: scenario === "html" ? "text/html" : "application/json",
        body: scenario === "html" ? "<title>Unexpected HTML</title>" : JSON.stringify({ ...manifest, ...(scenario === "wrong-sha" ? { sha: "b".repeat(40) } : {}) }),
      });
    });
    await navigate(page, `${origin}/`, delivered);
    if (scenario === "valid") await checkBrowserManifest(page, manifest, headers);
    else await expect(checkBrowserManifest(page, manifest, headers)).rejects.toThrow(/Browser\/custom-domain manifest/);
    expect(manifestRequests).toBe(scenario === "csp-blocks-fetch" ? 0 : 1);
  });
}

for (const scenario of ["console", "challenge-resource"]) {
  test(`browser guard blocks ${scenario} without accepting or solving it`, async ({ page }) => {
    await page.route(`${origin}/`, (route) => route.fulfill({ headers, contentType: "text/html", body: "<!doctype html><main>Fixture</main>" }));
    const checkErrors = await guardBrowser(page, origin);
    await navigate(page, `${origin}/`, headers);
    if (scenario === "console") await page.evaluate(() => console.error("fixture console error"));
    else await page.evaluate(() => fetch("/cdn-cgi/challenge-platform/fixture").catch(() => {}));
    expect(checkErrors).toThrow(/Browser\/custom-domain/);
  });
}
