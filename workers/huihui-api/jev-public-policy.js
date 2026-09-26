import { jevError } from "./jev-security.js";

export const PUBLIC_JEV_ORIGIN = "https://beta.huihui.dev";
export const PUBLIC_JEV_BODY_LIMIT = 1024;
export const PUBLIC_JEV_LIMIT = 3;
export const PUBLIC_JEV_WINDOW_MS = 24 * 60 * 60 * 1000;
export const PUBLIC_JEV_LEASE_MS = 15000;

export function requirePublicJevRequest(request) {
  const url = new URL(request.url);
  if (url.origin !== PUBLIC_JEV_ORIGIN || request.headers.get("Origin") !== PUBLIC_JEV_ORIGIN
    || ![null, "same-origin"].includes(request.headers.get("Sec-Fetch-Site"))) throw jevError("forbidden", 403);
  if (request.method !== "POST") throw jevError("invalid_request", 405);
  if (url.pathname !== "/api/jev-public" || url.search) throw jevError("invalid_request", 400);
  if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw jevError("invalid_request", 415);
}

export function publicJevQuestion(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== 1 || !Object.hasOwn(value, "question")
    || typeof value.question !== "string" || !value.question.trim()
    || Array.from(value.question).length > 99 || /[\uD800-\uDFFF]/u.test(value.question)) throw jevError("invalid_request", 400);
  return value.question.trim();
}

function canonicalIp(value) {
  if (typeof value !== "string" || value.length > 45) throw jevError("unavailable", 503);
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)) {
    const parts = value.split(".").map(Number);
    if (parts.every(part => part <= 255)) return parts.join(".");
  } else if (/^[\da-f:.]+$/i.test(value) && value.includes(":")) {
    try { return new URL(`http://[${value}]/`).hostname.toLowerCase(); } catch { /* Deny malformed edge identity. */ }
  }
  throw jevError("unavailable", 503);
}

export async function publicJevIdentity(request, secret) {
  if (typeof secret !== "string" || secret.length < 32) throw jevError("unavailable", 503);
  // Only edge-supplied identity. Never trust Forwarded/X-Forwarded-For/X-Real-IP.
  // Only use CF-Connecting-IPv6 when the edge IP is a Pseudo IPv4 (Class E).
  // Outside overwrite mode an unsolicited IPv6 header must not select identity.
  const edgeIp = canonicalIp(request.headers.get("CF-Connecting-IP"));
  const pseudoIpv4 = /^\d+\./.test(edgeIp) && Number(edgeIp.split(".")[0]) >= 240;
  const ip = pseudoIpv4 ? canonicalIp(request.headers.get("CF-Connecting-IPv6")) : edgeIp;
  if (pseudoIpv4 && !ip.startsWith("[")) throw jevError("unavailable", 503);
  const bytes = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", bytes.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, bytes.encode(`jev-public:v1:${ip}`));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function publicJevResponse(value, status) {
  const invalid = () => { throw jevError("invalid_response", 502); };
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const usage = () => {
    if (!Number.isInteger(value.remaining) || value.remaining < 0 || value.remaining > 3
      || !(value.resetAt === null || (Number.isSafeInteger(value.resetAt) && value.resetAt > 0))) return invalid();
    return { remaining: value.remaining, resetAt: value.resetAt };
  };
  if (status === 200 && value.ok === true) {
    const remaining = usage();
    if (typeof value.probability !== "number" || !Number.isFinite(value.probability) || value.probability < 0 || value.probability > 1
      || remaining.remaining > 2 || remaining.resetAt === null) return invalid();
    return { ok: true, probability: value.probability, ...remaining };
  }
  if (value.ok !== false) return invalid();
  if (status === 429) {
    const remaining = usage();
    if (value.error === "rate_limited" ? remaining.remaining !== 0 || remaining.resetAt === null
      : value.error !== "busy" || remaining.remaining === 0) return invalid();
    return { ok: false, error: value.error, ...remaining };
  }
  const errors = { invalid_request: [400, 405, 415], too_large: [413], forbidden: [403], unavailable: [503],
    invalid_response: [502], upstream_unavailable: [502], timeout: [504] };
  if (typeof value.error !== "string" || !Object.hasOwn(errors, value.error) || !errors[value.error].includes(status)) return invalid();
  return { ok: false, error: value.error };
}
