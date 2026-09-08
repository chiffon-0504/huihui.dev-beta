import { readFile } from "node:fs/promises";

// Deliberately supports only the current global Pages rule. Fail closed if CSP
// delivery gains path-specific rules instead of silently testing the wrong one.
export async function readPagesCspHeaders() {
  const source = await readFile(new URL("../../_headers", import.meta.url), "utf8");
  const headers = {};
  let rule;
  for (const line of source.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      rule = line.trim();
      continue;
    }
    const match = line.trim().match(/^(Content-Security-Policy(?:-Report-Only)?):\s*(.+)$/i);
    if (!match) continue;
    const name = match[1].toLowerCase();
    if (rule !== "/*" || headers[name]) {
      throw new Error("CSP fixture adapter requires one global Pages rule per CSP header");
    }
    headers[name] = match[2];
  }
  if (!Object.keys(headers).length) throw new Error("Pages CSP header is missing");
  return headers;
}

export async function openCspProbe(page, headers) {
  const origin = "http://csp-fixture.test";
  await page.route(`${origin}/**`, async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/observer.js") {
      await route.fulfill({ contentType: "text/javascript", body: `
        window.cspViolations = [];
        document.addEventListener("securitypolicyviolation", (event) => {
          window.cspViolations.push({
            disposition: event.disposition,
            effectiveDirective: event.effectiveDirective,
            blockedURI: event.blockedURI,
          });
        });
        document.documentElement.dataset.observer = "ready";
      ` });
    } else if (pathname === "/allowed.js") {
      await route.fulfill({ contentType: "text/javascript", body: `
        document.querySelector("button").addEventListener("click", () => {
          document.querySelector("output").textContent = "allowed interaction ran";
        });
        document.documentElement.dataset.complete = "true";
      ` });
    } else if (pathname === "/") {
      // Parser-inserted scripts are subject to CSP, unlike Playwright evaluate.
      // The final external script is a completion barrier after the inline probe.
      await route.fulfill({ headers, contentType: "text/html", body: `<!doctype html>
        <html lang="en" data-forbidden="not-run"><head><title>CSP probe</title></head><body>
        <button type="button">Allowed action</button><output></output>
        <script src="/observer.js"></script>
        <script>document.documentElement.dataset.forbidden = "ran";</script>
        <script src="/allowed.js"></script>
        </body></html>` });
    } else {
      await route.fulfill({ status: 404, body: "Not Found" });
    }
  });
  return page.goto(origin, { waitUntil: "load" });
}
