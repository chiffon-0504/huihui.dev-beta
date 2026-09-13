import assert from "node:assert/strict";

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
