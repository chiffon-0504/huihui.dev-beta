import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const BETA_ORIGIN = "https://beta.huihui.dev";

// Unknown paths and reserved error-document URLs, never content entries.
export const notFoundPaths = [
  "/does-not-exist/", "/fr/", "/fr/posts/", "/en/posts/extra/",
  "/posts/not-a-real-post/", "/en/does-not-exist/", "/ja/posts/extra/",
  "/404.html", "/404",
];

// Diagnostic metadata only: query strings, credentials and unknown paths must
// never enter logs. This does not classify or exempt any failed request.
export function failedRequestMetadata(request, baseURL, builtAssets) {
  const url = new URL(request.url());
  const sameOrigin = url.origin === new URL(baseURL).origin;
  const knownPath = /^\/(?:en\/|ja\/)?(?:about\/|works\/|posts\/)?$/.test(url.pathname)
    || (/^\/assets\/[\w.-]+\.(js|css|svg|webp)$/.test(url.pathname) && builtAssets?.has(url.pathname) === true);
  const errorText = request.failure()?.errorText;
  return {
    url: sameOrigin ? url.origin + (knownPath ? url.pathname : "/[redacted path]") : "[redacted external URL]",
    sameOrigin,
    hasQuery: Boolean(url.search),
    resourceType: request.resourceType(),
    errorText: typeof errorText === "string" && /^net::ERR_[A-Z0-9_]+$/.test(errorText) ? errorText : errorText == null ? null : "[redacted error text]",
    expectedBuildAsset: builtAssets ? builtAssets.has(url.pathname) : null,
  };
}

// The caller must first verify every build asset's HTTP response and digest.
// ERR_ABORTED alone is insufficient: require a decoded replacement from the
// same responsive image in the same document, with both URLs in the build.
export function isResponsiveImageCancellation(failure, { baseURL, builtAssets, images }) {
  const expectedWebp = (value) => {
    try {
      const url = new URL(value);
      return url.origin === new URL(baseURL).origin && !url.username && !url.password
        && !url.search && !url.hash && /^\/assets\/[\w.-]+\.webp$/.test(url.pathname)
        && builtAssets?.has(url.pathname) === true;
    } catch { return false; }
  };
  if (failure.errorText !== "net::ERR_ABORTED" || failure.resourceType !== "image"
    || failure.method !== "GET" || failure.mainFrame !== true || failure.sameDocument !== true
    || failure.navigation !== false || failure.redirected !== false || !expectedWebp(failure.url)) return false;
  return images.some((image) => {
    if (!image.complete || !image.decoded || !(image.naturalWidth > 0)
      || image.currentSrc === failure.url || !expectedWebp(image.currentSrc)) return false;
    const candidates = image.srcset.split(",").map((candidate) => {
      const match = candidate.trim().match(/^(\/assets\/[\w.-]+\.webp) [1-9]\d*w$/);
      return match ? new URL(match[1], baseURL).href : null;
    });
    return candidates.length > 1 && candidates.every(expectedWebp)
      && candidates.includes(failure.url) && candidates.includes(image.currentSrc);
  });
}

// Observed on beta.huihui.dev on 2026-09-13. Pin every executable byte;
// only the Ray ID and base64-encoded decimal timestamp are variable.
export function cloudflareJsdBootstrap(ray, timestamp) {
  assert(/^[0-9a-f]{16}$/.test(ray), "Unexpected JSD Ray ID");
  assert(/^\d+$/.test(Buffer.from(timestamp, "base64").toString()) && Buffer.from(Buffer.from(timestamp, "base64").toString()).toString("base64") === timestamp, "Unexpected JSD timestamp");
  return `(function(){function c(){var b=a.contentDocument||(a.contentWindow&&a.contentWindow.document);if(b){var d=b.createElement('script');d.innerHTML="window.__CF$cv$params={r:'${ray}',t:'${timestamp}'};var a=document.createElement('script');a.src='/cdn-cgi/challenge-platform/scripts/jsd/main.js';document.getElementsByTagName('head')[0].appendChild(a);";b.getElementsByTagName('head')[0].appendChild(d)}}if(document.body){var a=document.createElement('iframe');a.height=1;a.width=1;a.style.position='absolute';a.style.top=0;a.style.left=0;a.style.border='none';a.style.visibility='hidden';document.body.appendChild(a);if('loading'!==document.readyState)c();else if(window.addEventListener)document.addEventListener('DOMContentLoaded',c);else{var e=document.onreadystatechange||function(){};document.onreadystatechange=function(b){e(b);'loading'!==document.readyState&&(document.onreadystatechange=e,c())}}}})();`;
}

export function inspectDocument({ html, builtHtml, url, contract, policy }) {
  if (html === builtHtml) return null;
  assert(contract === "custom" && new URL(url).origin === BETA_ORIGIN, "Unexpected document bytes: strict Pages has no injection exception");
  const candidates = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert(candidates.length === 1, "Unexpected inline scripts or missing JSD fingerprint");
  const match = candidates[0];
  const identity = match[1].match(/window\.__CF\$cv\$params=\{r:'([0-9a-f]{16})',t:'([A-Za-z0-9+/=]+)'\}/);
  assert(identity && match[1] === cloudflareJsdBootstrap(identity[1], identity[2]), "Unexpected Cloudflare JSD fingerprint");
  assert(html.slice(0, match.index) + html.slice(match.index + match[0].length) === builtHtml, "Unexpected HTML changes in addition to JSD");
  return { url, policy, line: html.slice(0, match.index).split("\n").length, hash: createHash("sha256").update(match[1]).digest("base64") };
}

export function jsdConsoleText(hash) {
  return `Executing inline script violates the following Content Security Policy directive 'script-src 'self''. Either the 'unsafe-inline' keyword, a hash ('sha256-${hash}'), or a nonce ('nonce-...') is required to enable inline execution. The action has been blocked.`;
}

// Whitelist diagnostic fields and values; never serialize raw policy queries,
// console text, samples, or response bodies.
function browserEvidenceMetadata({ contract, url, documents, violations, consoles, responsePolicies = [] }) {
  const safeUrl = (value) => {
    if (value === "inline" || value === "") return value;
    try {
      const parsed = new URL(value);
      const known = parsed.origin === BETA_ORIGIN || /^https:\/\/[0-9a-f]{8}\.huihuidev-beta\.pages\.dev$/.test(parsed.origin) || parsed.origin === "http://127.0.0.1:4176";
      if (!known) return "[redacted URL]";
      return parsed.origin + (["/", "/en/", "/ja/"].includes(parsed.pathname) || /^\/assets\/[\w.-]+\.(js|css|svg|webp)$/.test(parsed.pathname) ? parsed.pathname : "/[redacted path]");
    } catch { return "[redacted URL]"; }
  };
  const number = (value) => Number.isSafeInteger(value) ? value : null;
  const directive = (value) => /^(default|script|style|img|connect|font|media|object|frame|child|worker|manifest|prefetch)-src(-elem|-attr)?$|^(base-uri|form-action|frame-ancestors)$/.test(value) ? value : "[unknown directive]";
  // Diagnostic identification only, never an exception or evidence filter.
  const policyMetadata = (value) => typeof value !== "string" ? [] : value.split(";").filter((part) => part.trim()).map((part) => {
    const [name, ...values] = part.trim().split(/\s+/);
    return {
      directive: ["report-uri", "report-to"].includes(name) ? name : directive(name),
      values: values.map((item) => {
        if (["'self'", "'none'", "'unsafe-inline'", "'unsafe-eval'"].includes(item)) return item;
        if (name === "report-uri") {
          try {
            const target = new URL(item);
            if (target.origin === "https://csp-reporting.cloudflare.com" && target.pathname === "/cdn-cgi/script_monitor/report") return `${target.origin}${target.pathname}?[redacted]`;
          } catch { /* Unknown policy values stay redacted. */ }
        }
        return "[redacted]";
      }),
    };
  });
  const expected = documents.filter(Boolean);
  return JSON.stringify({
    contract: ["custom", "pages"].includes(contract) ? contract : "[unknown contract]",
    url: safeUrl(url), documentCount: documents.length, expectedDocumentCount: expected.length,
    violationCount: violations.length, enforcingViolationCount: violations.filter((event) => event.disposition === "enforce").length,
    reportOnlyViolationCount: violations.filter((event) => event.disposition === "report").length, consoleErrorCount: consoles.length,
    expected: expected.map((item) => ({ url: safeUrl(item.url), line: number(item.line) })),
    violations: violations.map((event) => ({
      effectiveDirective: directive(event.effectiveDirective), violatedDirective: directive(event.violatedDirective),
      blockedURI: safeUrl(event.blockedURI), disposition: ["enforce", "report"].includes(event.disposition) ? event.disposition : "[unknown disposition]",
      sourceFile: safeUrl(event.sourceFile), documentURI: safeUrl(event.documentURI), lineNumber: number(event.lineNumber), columnNumber: number(event.columnNumber),
      reportOnlyPolicyMatchesResponse: event.disposition === "report" && responsePolicies.some((item) => item.url === event.documentURI && item.reportOnlyPolicy === event.originalPolicy),
      policy: policyMetadata(event.originalPolicy),
    })),
    consoles: consoles.map((event) => ({ url: safeUrl(event.location?.url), lineNumber: number(event.location?.lineNumber), columnNumber: number(event.location?.columnNumber) })),
    responsePolicies: responsePolicies.map((item) => ({ url: safeUrl(item.url), enforcing: policyMetadata(item.enforcingPolicy), reportOnly: policyMetadata(item.reportOnlyPolicy) })),
  });
}

// Observed beta monitoring form; only the opaque reporting query varies.
// This recognizes telemetry, never permissions for application execution.
function isCloudflareMonitoringPolicy(policy) {
  return typeof policy === "string" && /^script-src 'unsafe-inline' 'unsafe-eval'; connect-src 'none'; report-uri https:\/\/csp-reporting\.cloudflare\.com\/cdn-cgi\/script_monitor\/report\?[^\s;,#"'<>]+; report-to cf-csp-endpoint$/.test(policy);
}

// A bijection is required: one delivered pinned bootstrap, one enforced block,
// and one matching browser diagnostic. Extra or missing evidence fails closed.
export function validateBrowserEvidence({ contract, url, documents, violations, consoles, responsePolicies = [], assetUrls = [] }) {
  const expected = documents.filter(Boolean);
  const check = (condition, message) => {
    if (!condition) assert.fail(`${message}: ${browserEvidenceMetadata({ contract, url, documents, violations, consoles, responsePolicies })}`);
  };
  const betaNavigation = (value) => ["/", "/en/", "/ja/"].some((path) => value === BETA_ORIGIN + path);
  const assets = new Set(assetUrls.filter((value) => typeof value === "string" && /^https:\/\/beta\.huihui\.dev\/assets\/[\w.-]+\.(js|css|svg|webp)$/.test(value)));
  for (const response of responsePolicies.filter((item) => item.reportOnlyPolicy !== undefined)) {
    check(contract === "custom" && betaNavigation(response.url), "Report-Only edge exception is beta custom-domain only");
    check(isCloudflareMonitoringPolicy(response.reportOnlyPolicy) && Boolean(response.enforcingPolicy) && response.enforcingPolicy !== response.reportOnlyPolicy, "Unexpected delivered Report-Only policy");
  }
  const enforcing = [];
  for (const event of violations) {
    if (event.disposition === "enforce") { enforcing.push(event); continue; }
    check(event.disposition === "report", "Unknown CSP violation disposition");
    const responses = responsePolicies.filter((item) => item.url === event.documentURI);
    // Reject ambiguous repeated navigation URLs instead of attributing an event
    // to a stale policy from an earlier response at that URL.
    check(contract === "custom" && betaNavigation(event.documentURI) && responses.length === 1 && responses[0].reportOnlyPolicy === event.originalPolicy && isCloudflareMonitoringPolicy(event.originalPolicy), "Report-Only violation has no attributable Cloudflare response policy");
    check(event.effectiveDirective === event.violatedDirective && ["script-src-elem", "connect-src"].includes(event.effectiveDirective), "Unexpected monitoring violation directive");
    check(assets.has(event.blockedURI) && (event.effectiveDirective !== "script-src-elem" || event.blockedURI.endsWith(".js")), "Monitoring violation is outside repository build resources");
    check(event.sourceFile === "" || event.sourceFile === event.documentURI || (assets.has(event.sourceFile) && event.sourceFile.endsWith(".js")), "Monitoring violation has an unrelated source");
    check(event.sample === "" && Number.isSafeInteger(event.lineNumber) && event.lineNumber >= 0 && Number.isSafeInteger(event.columnNumber) && event.columnNumber >= 0, "Unexpected monitoring violation metadata");
  }
  assert(expected.length === 0 || (contract === "custom" && expected.every((item) => new URL(item.url).origin === BETA_ORIGIN)), "JSD exception is beta custom-domain only");
  check(enforcing.length === expected.length, "Unexpected enforcing CSP violation count");
  check(consoles.length === expected.length, "Unexpected console error count");
  const remainingViolations = [...enforcing];
  const remainingConsoles = [...consoles];
  for (const item of expected) {
    const violation = remainingViolations.findIndex((event) => event.effectiveDirective === "script-src-elem" && event.violatedDirective === "script-src-elem" && event.blockedURI === "inline" && event.disposition === "enforce" && event.sourceFile === item.url && event.documentURI === item.url && event.lineNumber === item.line && event.columnNumber === 0 && event.sample === "" && event.originalPolicy === item.policy);
    assert(violation !== -1, "CSP violation is not attributable to pinned JSD");
    remainingViolations.splice(violation, 1);
    const consoleIndex = remainingConsoles.findIndex((event) => event.text === jsdConsoleText(item.hash) && event.location.url === item.url && event.location.lineNumber === item.line - 1 && event.location.columnNumber === 0);
    assert(consoleIndex !== -1, "Unrelated console error or changed JSD diagnostic");
    remainingConsoles.splice(consoleIndex, 1);
  }
  return expected.length;
}

export function betaSmokeTarget(env) {
  const contract = env.V2_BETA_CONTRACT || "pages";
  assert(["pages", "custom"].includes(contract), "Unknown v2 beta contract");
  if (env.V2_BETA_LOCAL === "1") return { contract, baseURL: "http://127.0.0.1:4176" };
  if (contract === "custom") return { contract, baseURL: BETA_ORIGIN };
  const baseURL = env.V2_BETA_PAGES_URL;
  assert(/^https:\/\/[0-9a-f]{8}\.huihuidev-beta\.pages\.dev$/.test(baseURL || ""), "Strict Pages requires the API-verified immutable deployment URL");
  return { contract, baseURL };
}

// Only these non-secret response fields may appear in failure diagnostics.
export function responseMetadata(status, headers) {
  const safe = { status };
  for (const name of ["server", "content-type", "cf-ray", "cf-cache-status", "cf-mitigated"]) {
    if (headers[name]) safe[name] = headers[name];
  }
  return JSON.stringify(safe);
}

export function validateResponse({ status, headers, url, redirected }, expectedUrl, context) {
  const metadata = responseMetadata(status, headers);
  assert(!headers["cf-mitigated"], `${context}: challenge/security response ${metadata}`);
  assert(status === 200, `${context}: HTTP failure ${metadata}`);
  assert(!redirected && url === expectedUrl, `${context}: unexpected redirect or URL`);
}

// Separate expected-error contract: the generic verifier above still requires 200.
export function validateNotFoundResponse({ status, headers, url, redirected, html }, expectedUrl, builtHtml, expectedHeaders) {
  assert(notFoundPaths.includes(new URL(expectedUrl).pathname), "Not-found verification requires a dedicated unknown-path probe");
  assert(!headers["cf-mitigated"], "Not-found: challenge/security response");
  assert(status === 404, `Not-found: expected HTTP 404 ${responseMetadata(status, headers)}`);
  assert(!redirected && url === expectedUrl, "Not-found: unexpected redirect or URL");
  assert(headers["content-type"]?.includes("text/html"), "Not-found: expected HTML");
  // Observed on the exact-SHA immutable PR deployment on 2026-09-17:
  // Pages overrides the global content cache policy for its 404 response.
  validateSecurityHeaders(headers, { ...expectedHeaders, "cache-control": "no-store" }, "Not-found");
  assert(headers["content-security-policy-report-only"] === undefined, "Not-found: unexpected Report-Only policy");
  assert(html === builtHtml, "Not-found: unexpected error document bytes");
}

// Only after dedicated response validation: Chromium omits the reason phrase
// for the observed Pages response, while local HTTP includes "Not Found".
export function isNotFoundConsole({ text, location }, expectedUrl) {
  return notFoundPaths.includes(new URL(expectedUrl).pathname)
    && /^Failed to load resource: the server responded with a status of 404 \((?:Not Found)?\)$/.test(text)
    && location?.url === expectedUrl && location.lineNumber === 0 && location.columnNumber === 0;
}

export function securityHeaders(source) {
  const headers = {};
  for (const line of source.trimEnd().split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (!/^\s/.test(line)) {
      assert(line === "/*", "Preview headers require one global rule");
      continue;
    }
    const match = line.trim().match(/^([^:]+):\s*(.+)$/);
    assert(match && !headers[match[1].toLowerCase()], "Invalid or duplicate preview header");
    headers[match[1].toLowerCase()] = match[2];
  }
  assert(headers["content-security-policy"], "Missing enforcing preview CSP");
  return headers;
}

export function validateSecurityHeaders(actual, expected, context) {
  for (const [name, value] of Object.entries(expected)) {
    assert(actual[name] === value, `${context}: ${name} delivery mismatch`);
  }
}
