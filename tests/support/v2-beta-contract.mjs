import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const BETA_ORIGIN = "https://beta.huihui.dev";

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

// A bijection is required: one delivered pinned bootstrap, one enforced block,
// and one matching browser diagnostic. Extra or missing evidence fails closed.
export function validateBrowserEvidence({ contract, documents, violations, consoles }) {
  const expected = documents.filter(Boolean);
  assert(expected.length === 0 || (contract === "custom" && expected.every((item) => new URL(item.url).origin === BETA_ORIGIN)), "JSD exception is beta custom-domain only");
  assert(violations.length === expected.length, "Unexpected CSP violation count");
  assert(consoles.length === expected.length, "Unexpected console error count");
  const remainingViolations = [...violations];
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
