import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { guardBrowser, navigate } from "./browser.mjs";
import { cloudflareJsdBootstrap, securityHeaders } from "../support/v2-beta-contract.mjs";

const origin = "http://v2-beta-fixture.test";
const headers = securityHeaders(await readFile(new URL("../../v2/public/_headers", import.meta.url), "utf8"));

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

// The actual browser must block the pinned bootstrap without requesting JSD.
// No live response is intercepted by this local-only fixture suite.
for (const scenario of ["known-jsd", "pages-jsd", "wrong-host", "changed-jsd", "extra-inline", "extra-external", "extra-console", "application-csp", "missing-fingerprint", "speculation-resource", "unknown-build-request", "asset-bytes", "sampled-report-policy", "monitoring-jsd", "monitoring-no-jsd", "pages-monitoring", "monitoring-extra-enforce", "monitoring-extra-console"]) {
  test(`JSD browser evidence: ${scenario}`, async ({ page }) => {
    const baseURL = scenario === "wrong-host" ? "https://other.test" : "https://beta.huihui.dev";
    const builtHtml = await readFile(new URL("../../v2/dist/index.html", import.meta.url), "utf8");
    const bootstrap = cloudflareJsdBootstrap("0123456789abcdef", "MTc4OTI4OTcwOQ==");
    let html = builtHtml.replace("</body>", `<script>${bootstrap}</script></body>`);
    const monitoring = scenario.startsWith("monitoring-") || scenario === "pages-monitoring";
    if (["monitoring-no-jsd", "pages-monitoring"].includes(scenario)) html = builtHtml;
    if (scenario === "changed-jsd") html = html.replace("a.height=1", "a.height=2");
    if (scenario === "extra-inline") html = html.replace("</body>", "<script>window.unexpected=true</script></body>");
    if (scenario === "extra-external") html = html.replace("</body>", '<script src="https://other.test/unexpected.js"></script></body>');
    if (scenario === "missing-fingerprint") html = builtHtml.replace("</body>", "<script>window.unexpected=true</script></body>");
    const requests = [];
    let unknownDispatched = false;
    page.on("request", (request) => requests.push(new URL(request.url()).pathname));
    await page.route("**/*", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/" && monitoring) return route.fulfill({ headers: { ...headers, "content-security-policy-report-only": "script-src 'unsafe-inline' 'unsafe-eval'; connect-src 'none'; report-uri https://csp-reporting.cloudflare.com/cdn-cgi/script_monitor/report?v=fixture; report-to cf-csp-endpoint" }, contentType: "text/html", body: html });
      // Omit a reporting endpoint in this isolated fixture so it exercises
      // evidence counting without first failing the outbound-request guard.
      if (path === "/" && scenario === "sampled-report-policy") return route.fulfill({ headers: { ...headers, "content-security-policy-report-only": "script-src 'unsafe-inline' 'unsafe-eval'; connect-src 'none'" }, contentType: "text/html", body: html });
      if (path === "/") return route.fulfill({ headers: { ...headers, ...(scenario === "speculation-resource" ? { "Speculation-Rules": '"/cdn-cgi/speculation"' } : {}) }, contentType: "text/html", body: html });
      if (path === "/cdn-cgi/speculation") return route.fulfill({ contentType: "application/speculationrules+json", body: '{"prefetch":[]}' });
      if (path === "/assets/not-in-build.js") {
        unknownDispatched = true;
        return route.fulfill({ contentType: "text/javascript", body: "/* unexpected */" });
      }
      if (!/^\/assets\/[\w.-]+\.(js|css|svg)$/.test(path)) return route.abort();
      const contentType = path.endsWith(".js") ? "text/javascript" : path.endsWith(".css") ? "text/css" : "image/svg+xml";
      let body = await readFile(new URL(`../../v2/dist${path}`, import.meta.url));
      if (scenario === "asset-bytes" && path.endsWith(".js")) body = Buffer.concat([body, Buffer.from("\n/* altered served bytes */")]);
      await route.fulfill({ contentType, body });
    });
    const checkErrors = await guardBrowser(page, baseURL, { contract: ["pages-jsd", "pages-monitoring"].includes(scenario) ? "pages" : "custom", verifyBuild: true });
    await navigate(page, `${baseURL}/`, headers);
    await expect(page.getByRole("main")).toBeVisible();
    if (["extra-console", "monitoring-extra-console"].includes(scenario)) await page.evaluate(() => console.error("unrelated runtime error"));
    if (scenario === "unknown-build-request") await page.evaluate(() => fetch("/assets/not-in-build.js").catch(() => {}));
    if (["application-csp", "monitoring-extra-enforce"].includes(scenario)) await page.evaluate(() => {
      const script = document.createElement("script");
      script.textContent = "window.unexpected=true";
      document.body.append(script);
    });
    if (["known-jsd", "monitoring-jsd", "monitoring-no-jsd"].includes(scenario)) {
      const result = await checkErrors();
      expect(result.jsdBlocks).toBe(scenario === "monitoring-no-jsd" ? 0 : 1);
      if (monitoring) expect(result.reportOnlyEvents).toBeGreaterThan(0);
      expect(await page.evaluate(() => window.unexpected)).toBeUndefined();
      expect(await page.locator("iframe").count()).toBe(0);
      expect(requests.some((path) => path.startsWith("/cdn-cgi/"))).toBe(false);
    } else {
      if (scenario === "sampled-report-policy") {
        let failure;
        try { await checkErrors(); } catch (error) { failure = error.message; }
        expect(failure).toContain("Unexpected delivered Report-Only policy");
        expect(failure).toContain('"reportOnlyPolicyMatchesResponse":true');
      } else await expect(checkErrors()).rejects.toThrow();
      if (scenario === "speculation-resource") expect(requests).toContain("/cdn-cgi/speculation");
      if (scenario === "unknown-build-request") {
        expect(requests).toContain("/assets/not-in-build.js");
        expect(unknownDispatched).toBe(false);
      }
    }
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

for (const scenario of ["console", "challenge-resource"]) {
  test(`browser guard blocks ${scenario} without accepting or solving it`, async ({ page }) => {
    await page.route(`${origin}/`, (route) => route.fulfill({ headers, contentType: "text/html", body: "<!doctype html><main>Fixture</main>" }));
    const checkErrors = await guardBrowser(page, origin);
    await navigate(page, `${origin}/`, headers);
    if (scenario === "console") await page.evaluate(() => console.error("fixture console error"));
    else await page.evaluate(() => fetch("/cdn-cgi/challenge-platform/fixture").catch(() => {}));
    await expect(checkErrors()).rejects.toThrow(/Browser\/custom-domain|console error/);
  });
}
