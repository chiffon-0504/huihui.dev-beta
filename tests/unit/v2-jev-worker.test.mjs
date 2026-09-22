import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import worker from "../../workers/huihui-api/worker.js";
import { JEV_TIMEOUT_MS, normalizeJevResponse, toJevPayload, validateJevForm } from "../../workers/huihui-api/jev.js";
import { authorizeJev } from "../../workers/huihui-api/jev-security.js";
import { onRequest } from "../../functions/_middleware.js";

const origin = "https://beta.huihui.dev";
const issuer = "https://fixture-team.cloudflareaccess.com";
const audience = "a".repeat(64);
const noul = { mode: "noul", question: "Should I choose soup?", context: ["Budget: 150"] };
const score = { ...noul, mode: "score", criteria: ["Low risk", "High risk"] };
const choice = { ...noul, mode: "choice", options: [{ id: "option_1", label: "Soup" }, { id: "option_7", label: "Rice" }] };
const fixture = form => ({ answers: { decision: form.mode === "noul" ? { type: "noul", noul: 0.73 }
  : form.mode === "score" ? { type: "score", score: 0.25, confidence: 0.5, legend: { 0: "Low risk", 1: "High risk" }, probabilities: { 0: 0.75, 1: 0.25 } }
    : { type: "choice", choice: "option_1", confidence: 0.5, probabilities: { option_1: 0.75, option_7: 0.25 } } },
  ignored: "never-return-this-upstream-detail" });
let pair, jwk, token;
const baseEnv = () => ({ WORKER_ENV: "beta", JEV_SITE_ORIGIN: origin, JEV_ACCESS_ISSUER: issuer, JEV_ACCESS_AUD: audience,
  JEV_ALLOWED_EMAIL: "owner@example.test", TYPESAFE_JEV_API_KEY: "synthetic-jev-secret", JEV_RATE_LIMITER: { limit: vi.fn(async () => ({ success: true })) } });
const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
async function jwt(changes = {}, headerChanges = {}) {
  const now = Math.floor(Date.now() / 1000);
  const body = `${encode({ alg: "RS256", kid: "fixture", ...headerChanges })}.${encode({ iss: issuer, aud: [audience], sub: "synthetic-user", type: "app", email: "owner@example.test", iat: now - 60, exp: now + 3600, ...changes })}`;
  const signature = await webcrypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(body));
  return `${body}.${Buffer.from(signature).toString("base64url")}`;
}
beforeAll(async () => {
  pair = await webcrypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  jwk = { ...await webcrypto.subtle.exportKey("jwk", pair.publicKey), kid: "fixture", alg: "RS256", use: "sig" };
  token = await jwt();
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
function mockUpstream(form = noul, handler = () => Response.json(fixture(form))) {
  const upstream = vi.fn(handler);
  vi.stubGlobal("fetch", vi.fn(async (url, init) => {
    if (url === `${issuer}/cdn-cgi/access/certs`) return Response.json({ keys: [jwk] });
    if (url === "https://api.typesafe.ai/v1/systemone") return upstream(url, init);
    throw new Error("Unexpected network request");
  }));
  return upstream;
}
function request(form = noul, overrides = {}) {
  const headers = { Origin: origin, "Content-Type": "application/json", "Cf-Access-Jwt-Assertion": token, ...overrides.headers };
  return new Request(overrides.url ?? `${origin}/api/jev`, { method: overrides.method ?? "POST", headers,
    body: overrides.method && overrides.method !== "POST" ? undefined : overrides.body ?? JSON.stringify(form) });
}
const call = (req = request(), env = baseEnv()) => worker.fetch(req, env, {});

describe("Jev narrow form and official payload", () => {
  test.each([noul, score, choice])("converts $mode to exactly one fixed model/question", form => {
    const normalized = validateJevForm(form);
    expect(toJevPayload(normalized)).toEqual({ model: "jev-latest", state: { context: form.context }, questions: { decision: {
      type: form.mode, instructions: form.question, ...(form.mode === "score" ? { criteria: form.criteria } : form.mode === "choice" ? { criteria: { option_1: "Soup", option_7: "Rice" } } : {}),
    } } });
  });
  test("trims human text without interpreting object keys", () => {
    expect(validateJevForm({ ...choice, options: [{ id: "option_1", label: " __proto__ " }, { id: "option_2", label: "constructor" }] }).options[0].label).toBe("__proto__");
  });
  test.each([
    null, { ...noul, mode: "chat" }, { ...noul, question: 1 }, { ...noul, question: " " }, { ...noul, question: "a".repeat(1001) },
    { ...noul, context: "context" }, { ...noul, context: [42] }, { ...noul, context: ["x".repeat(501)] }, { ...noul, context: Array(13).fill("x") },
    { ...score, criteria: ["One"] }, { ...score, criteria: Array(11).fill("One") }, { ...score, criteria: ["One", " One "] }, { ...score, criteria: ["One", {}] },
    { ...score, criteria: ["One", "x".repeat(301)] }, { ...choice, options: [] }, { ...choice, options: Array(13).fill(choice.options[0]) },
    { ...choice, options: [choice.options[0], choice.options[0]] }, { ...choice, options: [{ id: "__proto__", label: "Soup" }, choice.options[1]] },
    { ...choice, options: [{ id: "option_01", label: "Soup" }, choice.options[1]] }, { ...choice, options: [{ ...choice.options[0], extra: true }, choice.options[1]] },
    { ...choice, options: [{ id: "option_1", label: "Rice" }, choice.options[1]] }, { ...choice, options: [{ id: "option_1", label: 3 }, choice.options[1]] },
    ...["endpoint", "model", "state", "questions", "headers", "credentials", "method"].map(key => ({ ...noul, [key]: "forbidden" })),
  ])("rejects invalid input %#", value => expect(() => validateJevForm(value)).toThrow("invalid_request"));
  test.each([noul, score, choice])("normalizes $mode and excludes upstream metadata", form => {
    const value = normalizeJevResponse(fixture(form), form);
    expect(value.mode).toBe(form.mode);
    expect(JSON.stringify(value)).not.toContain("never-return");
  });
  test.each([
    [{ type: "noul", noul: "0.5" }, noul], [{ type: "noul", noul: 1.1 }, noul],
    [{ ...fixture(score).answers.decision, score: 1.5 }, score], [{ ...fixture(score).answers.decision, score: 0.9 }, score],
    [{ ...fixture(score).answers.decision, legend: { 0: "Wrong", 1: "High risk" } }, score],
    [{ ...fixture(choice).answers.decision, choice: "option_7" }, choice], [{ ...fixture(choice).answers.decision, confidence: NaN }, choice],
    [{ ...fixture(choice).answers.decision, probabilities: { option_1: 0.5, option_7: 0.2 } }, choice],
    [{ ...fixture(choice).answers.decision, probabilities: { option_1: 0.75, option_7: 0.25, extra: 0 } }, choice],
  ])("rejects malformed or inconsistent upstream answer %#", (answer, form) => expect(() => normalizeJevResponse({ answers: { decision: answer } }, form)).toThrow("invalid_response"));
});

describe("cryptographic Access authorization", () => {
  test("verifies signed human identity using only configured certs", async () => {
    mockUpstream();
    await expect(authorizeJev(request(), baseEnv())).resolves.toEqual({ subject: "synthetic-user" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  test.each([
    { iss: "https://attacker.test" }, { aud: ["b".repeat(64)] }, { exp: 1 }, { exp: "9999999999" }, { iat: 9999999999 },
    { nbf: 9999999999 }, { email: "stranger@example.test" }, { sub: "" }, { type: "service" }, { email: undefined },
  ])("rejects invalid signed claims %#", async change => {
    mockUpstream();
    const req = request(noul, { headers: { "Cf-Access-Jwt-Assertion": await jwt(change) } });
    expect((await call(req)).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
  test.each([{ alg: "none" }, { alg: "HS256" }, { jku: "https://attacker.test/keys" }, { crit: ["x"] }])("rejects token-controlled verification %#", async change => {
    mockUpstream();
    expect((await call(request(noul, { headers: { "Cf-Access-Jwt-Assertion": await jwt({}, change) } }))).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
  test("rejects missing JWT and spoofed identity header", async () => {
    const upstream = mockUpstream();
    expect((await call(request(noul, { headers: { "Cf-Access-Jwt-Assertion": "", "Cf-Access-Authenticated-User-Email": "owner@example.test" } }))).status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  });
  test("rejects a tampered signature", async () => {
    mockUpstream();
    const parts = token.split("."); parts[2] = "A".repeat(parts[2].length);
    expect((await call(request(noul, { headers: { "Cf-Access-Jwt-Assertion": parts.join(".") } }))).status).toBe(401);
  });
  test("fails closed when certs cannot be fetched", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("private-network-detail"); }));
    expect((await call()).status).toBe(503);
  });
});

describe("costly Worker endpoint", () => {
  test.each([noul, score, choice])("accepts authorized $mode with fixed upstream credentials", async form => {
    const upstream = mockUpstream(form); const env = baseEnv();
    const response = await call(request(form), env);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
    expect(await response.json()).toEqual({ ok: true, result: normalizeJevResponse(fixture(form), form) });
    expect(env.JEV_RATE_LIMITER.limit).toHaveBeenCalledWith({ key: "jev:synthetic-user" });
    expect(upstream).toHaveBeenCalledTimes(1);
    const init = upstream.mock.calls[0][1];
    expect(JSON.parse(init.body)).toEqual(toJevPayload(form));
    expect(init.redirect).toBe("error");
    expect(Object.keys(init.headers).sort()).toEqual(["Accept", "Authorization", "Content-Type"]);
  });
  test.each(["TYPESAFE_JEV_API_KEY", "JEV_RATE_LIMITER", "JEV_ACCESS_AUD", "JEV_ACCESS_ISSUER", "JEV_ALLOWED_EMAIL", "JEV_SITE_ORIGIN"])("missing %s fails closed", async key => {
    const upstream = mockUpstream(); const env = baseEnv(); delete env[key];
    expect((await call(request(), env)).status).toBe(503); expect(upstream).not.toHaveBeenCalled();
  });
  test.each(["production", undefined])("never enables production or an implicit environment", async WORKER_ENV => {
    const upstream = mockUpstream(); expect((await call(request(), { ...baseEnv(), WORKER_ENV })).status).toBe(503); expect(upstream).not.toHaveBeenCalled();
  });
  test.each([
    { url: "https://huihui-api-beta.huihuigames01.workers.dev/api/jev" }, { url: "https://preview.huihuidev-beta.pages.dev/api/jev" },
    { headers: { Origin: "https://attacker.test" } }, { headers: { "Sec-Fetch-Site": "cross-site" } },
  ])("rejects direct endpoints or cross-site requests %#", async overrides => {
    const upstream = mockUpstream(); expect((await call(request(noul, overrides))).status).toBe(403); expect(upstream).not.toHaveBeenCalled();
  });
  test.each(["GET", "OPTIONS", "PUT"])("rejects %s without upstream calls", async method => {
    const upstream = mockUpstream(); expect((await call(request(noul, { method }))).status).toBe(405); expect(upstream).not.toHaveBeenCalled();
  });
  test.each([
    [{ body: "{" }, 400], [{ body: JSON.stringify({ ...noul, model: "other" }) }, 400],
    [{ headers: { "Content-Type": "text/plain" } }, 415], [{ body: "x".repeat(16385) }, 413], [{ headers: { "Content-Length": "16385" } }, 413],
  ])("rejects malformed and oversized requests %#", async (overrides, status) => {
    const upstream = mockUpstream(); expect((await call(request(noul, overrides))).status).toBe(status); expect(upstream).not.toHaveBeenCalled();
  });
  test.each([false, undefined, "yes", "throw"])("limiter denies or fails safely %#", async success => {
    const upstream = mockUpstream(); const env = baseEnv();
    env.JEV_RATE_LIMITER.limit = async () => { if (success === "throw") throw new Error(); return { success }; };
    expect((await call(request(), env)).status).toBe(success === false ? 429 : 503); expect(upstream).not.toHaveBeenCalled();
  });
  test.each([401, 422, 429, 500, 529])("maps upstream HTTP %i without exposing credentials/details", async status => {
    mockUpstream(noul, () => new Response("synthetic-jev-secret private-stack-trace", { status }));
    const response = await call(); expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ ok: false, error: "upstream_unavailable" });
  });
  test.each(["{", "x".repeat(32769), JSON.stringify({ answers: { decision: { type: "noul", noul: 8 } } })])("rejects malformed upstream bodies %#", async body => {
    mockUpstream(noul, () => new Response(body)); expect((await call()).status).toBe(502);
  });
  test("maps network failure", async () => {
    mockUpstream(noul, () => { throw new Error("synthetic-jev-secret"); });
    expect(await (await call()).json()).toEqual({ ok: false, error: "upstream_unavailable" });
  });
  test.each(["headers", "body"])("times out stalled upstream %s without retry", async phase => {
    const entered = Promise.withResolvers();
    const upstream = mockUpstream(noul, () => { entered.resolve(); return phase === "headers" ? new Promise(() => {}) : new Response(new ReadableStream({ start() {} })); });
    vi.useFakeTimers(); const pending = call(); await entered.promise;
    await vi.advanceTimersByTimeAsync(JEV_TIMEOUT_MS + 1);
    const response = await pending; expect(response.status).toBe(504); expect(upstream).toHaveBeenCalledTimes(1);
    expect(upstream.mock.calls[0][1].signal.aborted).toBe(true);
  });
});

describe("Pages UI and same-origin bridge", () => {
  test.each(["/tools/jev", "/tools/jev/", "/tools/jev/index.html"])("protects %s before serving HTML", async path => {
    mockUpstream(); const next = vi.fn(async () => new Response("private-html", { headers: { "Content-Type": "text/html" } }));
    const req = new Request(`${origin}${path}`);
    expect((await onRequest({ request: req, env: baseEnv(), next })).status).toBe(401); expect(next).not.toHaveBeenCalled();
    const response = await onRequest({ request: new Request(req, { headers: { "Cf-Access-Jwt-Assertion": token } }), env: baseEnv(), next });
    expect(response.status).toBe(200); expect(response.headers.get("Content-Type")).toBe("text/html");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store"); expect(await response.text()).toBe("private-html");
  });
  test("preview and missing configuration cannot fall back to static HTML", async () => {
    const next = vi.fn();
    expect((await onRequest({ request: new Request("https://branch.huihuidev-beta.pages.dev/tools/jev/"), env: {}, next })).status).toBe(503);
    expect(next).not.toHaveBeenCalled();
  });
  test("preserves static response status and redirect headers after auth", async () => {
    mockUpstream();
    const result = await onRequest({ request: new Request(`${origin}/tools/jev`, { headers: { "Cf-Access-Jwt-Assertion": token } }), env: baseEnv(), next: async () => new Response(null, { status: 308, headers: { Location: "/tools/jev/" } }) });
    expect(result.status).toBe(308); expect(result.headers.get("Location")).toBe("/tools/jev/");
  });
  test("bridge invokes the actual Worker authorization, strips cookies and arbitrary headers", async () => {
    const upstream = mockUpstream(); const env = baseEnv();
    const binding = vi.fn(req => call(req, env));
    const req = request(noul, { headers: { Cookie: "synthetic-cookie", Authorization: "synthetic-header" } });
    const result = await onRequest({ request: req, env: { ...env, JEV_API: { fetch: binding } }, next: vi.fn() });
    expect(result.status).toBe(200); expect(upstream).toHaveBeenCalledTimes(1);
    expect(binding.mock.calls[0][0].headers.has("Cookie")).toBe(false);
    expect(binding.mock.calls[0][0].headers.has("Authorization")).toBe(false);
  });
  test("bridge cannot authorize an anonymous costly request", async () => {
    const upstream = mockUpstream(); const env = baseEnv();
    const response = await onRequest({ request: request(noul, { headers: { "Cf-Access-Jwt-Assertion": "" } }), env: { ...env, JEV_API: { fetch: req => call(req, env) } }, next: vi.fn() });
    expect(response.status).toBe(401); expect(upstream).not.toHaveBeenCalled();
  });
  test("bridge finishes a delayed body before aborting the service signal", async () => {
    const entered = Promise.withResolvers();
    const body = { ok: true, result: { mode: "noul", probability: 0.73 } };
    vi.useFakeTimers();
    const binding = req => new Response(new ReadableStream({ start(controller) {
      const abort = () => controller.error(new Error("aborted before body completed"));
      req.signal.addEventListener("abort", abort, { once: true });
      setTimeout(() => {
        req.signal.removeEventListener("abort", abort);
        controller.enqueue(new TextEncoder().encode(JSON.stringify(body))); controller.close();
      }, 20);
      entered.resolve();
    } }));
    const pending = onRequest({ request: request(), env: { ...baseEnv(), JEV_API: { fetch: binding } }, next: vi.fn() });
    await entered.promise; await vi.advanceTimersByTimeAsync(20);
    const response = await pending;
    expect(response.status).toBe(200); expect(await response.json()).toEqual(body);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
  test("bridge times out and cancels a stalled service body", async () => {
    const entered = Promise.withResolvers(); const cancel = vi.fn();
    vi.useFakeTimers();
    const binding = () => { entered.resolve(); return new Response(new ReadableStream({ cancel })); };
    const pending = onRequest({ request: request(), env: { ...baseEnv(), JEV_API: { fetch: binding } }, next: vi.fn() });
    await entered.promise; await vi.advanceTimersByTimeAsync(22001);
    expect((await pending).status).toBe(504); expect(cancel).toHaveBeenCalled();
  });
  test.each(["not-json", "x".repeat(16385)])("bridge rejects invalid or oversized service bodies %#", async body => {
    const response = await onRequest({ request: request(), env: { ...baseEnv(), JEV_API: { fetch: () => new Response(body) } }, next: vi.fn() });
    expect(response.status).toBe(502); expect(await response.json()).toEqual({ ok: false, error: "invalid_response" });
  });
  test("deployment route manifest covers private aliases without invoking Functions on public content", async () => {
    const manifest = JSON.parse(await readFile(new URL("../../v2/public/_routes.json", import.meta.url), "utf8"));
    expect(manifest).toEqual({ version: 1, include: ["/tools/*", "/api/jev*"], exclude: [] });
  });
});
