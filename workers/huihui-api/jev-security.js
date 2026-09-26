// Shared by the Pages gate and the API. No cookies or sessions are minted here.
export class JevError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}

export function jevError(code, status) { return new JevError(code, status); }

export function privateHeaders() {
  return {
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex, nofollow",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'none'",
  };
}

export function privateJson(value, status = 200) {
  return Response.json(value, { status, headers: privateHeaders() });
}

export function privateFailure(error) {
  const failure = error instanceof JevError ? error : jevError("unavailable", 503);
  return privateJson({ ok: false, error: failure.code }, failure.status);
}

// One deadline covers headers AND body, including mocks/transports ignoring abort.
export async function deadline(milliseconds, operation) {
  const controller = new AbortController();
  let timer;
  const expired = new Promise((_, reject) => {
    timer = setTimeout(() => { reject(jevError("timeout", 504)); controller.abort(); }, milliseconds);
  });
  try { return await Promise.race([operation(controller.signal), expired]); }
  finally { clearTimeout(timer); controller.abort(); }
}

export async function boundedJson(message, limit, signal) {
  const declared = message.headers.get("Content-Length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > limit)) {
    throw jevError("too_large", 413);
  }
  if (!message.body) throw jevError("invalid_request", 400);
  const reader = message.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener("abort", cancel, { once: true });
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      if (signal?.aborted) throw jevError("timeout", 504);
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) throw jevError("too_large", 413);
      chunks.push(value);
    }
    const all = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(all)); }
    catch { throw jevError("invalid_request", 400); }
  } finally {
    signal?.removeEventListener("abort", cancel);
    cancel();
  }
}

export function requireJevOrigin(request, env) {
  // Beta only. Native Pages aliases and direct workers.dev requests stay closed.
  if (env.JEV_SITE_ORIGIN !== "https://beta.huihui.dev") throw jevError("unavailable", 503);
  if (new URL(request.url).origin !== env.JEV_SITE_ORIGIN) throw jevError("forbidden", 403);
}

function decodePart(part) {
  if (!/^[A-Za-z0-9_-]+$/.test(part)) throw jevError("authentication_required", 401);
  return Uint8Array.from(atob(part.replaceAll("-", "+").replaceAll("_", "/")), c => c.charCodeAt(0));
}

export async function authorizeJev(request, env) {
  const issuer = env.JEV_ACCESS_ISSUER;
  const audience = env.JEV_ACCESS_AUD;
  const email = env.JEV_ALLOWED_EMAIL;
  if (typeof issuer !== "string" || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer)
    || typeof audience !== "string" || !/^[a-f0-9]{64}$/.test(audience)
    || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw jevError("unavailable", 503);
  }
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token || token.length > 16384) throw jevError("authentication_required", 401);
  let parts, header, claims, signature;
  try {
    parts = token.split(".");
    if (parts.length !== 3) throw new Error();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    header = JSON.parse(decoder.decode(decodePart(parts[0])));
    claims = JSON.parse(decoder.decode(decodePart(parts[1])));
    signature = decodePart(parts[2]);
    const now = Math.floor(Date.now() / 1000);
    if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid || header.kid.length > 256
      || header.crit !== undefined || header.jku !== undefined || header.jwk !== undefined
      || claims.iss !== issuer || !Array.isArray(claims.aud) || !claims.aud.includes(audience)
      || claims.type !== "app" || !Number.isSafeInteger(claims.exp) || claims.exp <= now
      || !Number.isSafeInteger(claims.iat) || claims.iat > now || claims.iat >= claims.exp
      || (claims.nbf !== undefined && (!Number.isSafeInteger(claims.nbf) || claims.nbf > now))
      || typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 256
      || typeof claims.email !== "string" || claims.email.toLowerCase() !== email.toLowerCase()) throw new Error();
  } catch { throw jevError("authentication_required", 401); }

  // Fetch only this configured tenant's public keys. Never trust a token-supplied URL.
  let keys;
  try {
    keys = await deadline(4000, async signal => {
      const response = await fetch(`${issuer}/cdn-cgi/access/certs`, {
        signal, redirect: "manual", headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        throw new Error();
      }
      const data = await boundedJson(response, 65536, signal);
      if (!Array.isArray(data?.keys) || data.keys.length > 10) throw new Error();
      return data.keys;
    });
  } catch { throw jevError("unavailable", 503); }
  try {
    const matches = keys.filter(key => key?.kid === header.kid && key.kty === "RSA" && key.alg === "RS256" && key.use === "sig");
    if (matches.length !== 1) throw new Error();
    const key = await crypto.subtle.importKey("jwk", matches[0], { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    if (!await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, new TextEncoder().encode(`${parts[0]}.${parts[1]}`))) throw new Error();
    if (claims.exp <= Math.floor(Date.now() / 1000)) throw new Error();
  } catch { throw jevError("authentication_required", 401); }
  return { subject: claims.sub };
}
