import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, test, vi } from "vitest";
import worker from "../../workers/huihui-api/worker.js";
import { onRequest } from "../../functions/_middleware.js";
import { askPublicJev, expirePublicJev, initializePublicJev } from "../../workers/huihui-api/jev-public-quota.js";
import { PUBLIC_JEV_LEASE_MS, PUBLIC_JEV_WINDOW_MS, publicJevIdentity } from "../../workers/huihui-api/jev-public-policy.js";

const origin = "https://beta.huihui.dev";
const databases = [];
function storage() {
  // Execute the actual SQL and transactions, including rollback, with built-in SQLite.
  const db = new DatabaseSync(":memory:");
  databases.push(db);
  return {
    sql: { exec(query, ...args) {
      const rows = db.prepare(query).all(...args);
      return { toArray: () => rows };
    } },
    transactionSync(callback) {
      db.exec("BEGIN IMMEDIATE");
      try { const result = callback(); db.exec("COMMIT"); return result; }
      catch (error) { db.exec("ROLLBACK"); throw error; }
    },
    setAlarm: vi.fn(async () => {}),
    deleteAll: vi.fn(async () => db.exec("DROP TABLE IF EXISTS uses")),
  };
}
const rows = store => store.sql.exec("SELECT * FROM uses").toArray();
const upstreamResult = () => Response.json({ answers: { decision: { type: "noul", noul: 0.73 } }, secret: "never-return" });
function fixture() {
  const stores = new Map();
  const env = { WORKER_ENV: "beta", TYPESAFE_JEV_API_KEY: "synthetic-provider-secret", JEV_PUBLIC_IP_HMAC_KEY: "synthetic-hmac-key-only-for-tests-1234" };
  env.JEV_PUBLIC_QUOTA = { getByName: vi.fn(name => {
    if (!stores.has(name)) stores.set(name, storage());
    return { ask: question => askPublicJev(stores.get(name), env, question) };
  }) };
  vi.stubGlobal("fetch", vi.fn(async () => upstreamResult()));
  return { env, stores, call: request => worker.fetch(request, env, {}) };
}
function request(body = { question: "今天要不要吃牛肉湯麵？" }, options = {}) {
  return new Request(options.url ?? `${origin}/api/jev-public`, {
    method: options.method ?? "POST",
    headers: { Origin: origin, "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.1", ...options.headers },
    ...(options.method && options.method !== "POST" ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
}
afterEach(() => {
  vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers();
  for (const db of databases.splice(0)) db.close();
});

describe("public schema and fixed Noul capability", () => {
  test.each([
    {}, null, [], { question: "" }, { question: "  " }, { question: 42 }, { question: ["one", "two"] },
    { questions: ["one", "two"] }, { question: "x".repeat(100) }, { question: "😀".repeat(100) }, { question: "\ud800" },
    ...["options", "mode", "model", "noul", "criteria", "context", "questions", "state", "system", "systemPrompt", "temperature", "headers", "endpoint", "provider"].map(key => ({ question: "One?", [key]: "injection" })),
    "{", '{"question":"one","question":["two"]}', "x".repeat(1025),
  ])("rejects invalid input without allocation or provider calls %#", async body => {
    const f = fixture();
    const response = await f.call(request(body));
    expect([400, 413]).toContain(response.status);
    expect(f.env.JEV_PUBLIC_QUOTA.getByName).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  test.each(["x", "字".repeat(99), "😀".repeat(99)])("accepts up to 99 Unicode code points %#", async question => {
    const f = fixture();
    expect((await f.call(request({ question }))).status).toBe(200);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(JSON.parse(init.body)).toEqual({ model: "jev-latest", state: { context: [] }, questions: { decision: { type: "noul", instructions: question } } });
    expect(init.redirect).toBe("manual");
    expect(init.headers.Authorization).toBe("Bearer synthetic-provider-secret");
  });
  test.each(["GET", "OPTIONS", "PUT"])("rejects %s", async method => {
    const f = fixture(); expect((await f.call(request({}, { method }))).status).toBe(405); expect(fetch).not.toHaveBeenCalled();
  });
  test.each([
    { url: "https://huihui-api-beta.huihuigames01.workers.dev/api/jev-public" },
    { url: "https://branch.huihuidev-beta.pages.dev/api/jev-public" },
    { headers: { Origin: "https://attacker.test" } }, { headers: { "Sec-Fetch-Site": "cross-site" } },
  ])("rejects direct and cross-origin calls %#", async options => {
    const f = fixture(); expect((await f.call(request({}, options))).status).toBe(403); expect(fetch).not.toHaveBeenCalled();
  });
  test.each(["WORKER_ENV", "TYPESAFE_JEV_API_KEY", "JEV_PUBLIC_IP_HMAC_KEY", "JEV_PUBLIC_QUOTA"])("missing %s fails closed", async key => {
    const f = fixture(); delete f.env[key]; expect((await f.call(request())).status).toBe(503); expect(fetch).not.toHaveBeenCalled();
  });
  test("production remains disabled and private API still requires its independent auth", async () => {
    const f = fixture();
    expect((await worker.fetch(request(), { ...f.env, WORKER_ENV: "production" }, {})).status).toBe(503);
    expect((await f.call(request({}, { url: `${origin}/api/jev` }))).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });
  test("checks media type and URL query before quota", async () => {
    const f = fixture();
    expect((await f.call(request({}, { headers: { "Content-Type": "text/plain" } }))).status).toBe(415);
    expect((await f.call(request({}, { url: `${origin}/api/jev-public?mode=choice` }))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("rolling successful-use quota", () => {
  test("requests 1/2/3 return 2/1/0; fourth is 429 and never calls provider", async () => {
    const f = fixture();
    for (const remaining of [2, 1, 0]) {
      const response = await f.call(request());
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true, probability: 0.73, remaining, resetAt: expect.any(Number) });
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
    }
    const fourth = await f.call(request());
    expect(fourth.status).toBe(429);
    expect(await fourth.json()).toMatchObject({ ok: false, error: "rate_limited", remaining: 0 });
    expect(Number(fourth.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  test("each success expires exactly 24 hours later, not at midnight", async () => {
    vi.useFakeTimers(); const start = Date.parse("2026-09-26T23:59:00Z"); vi.setSystemTime(start);
    const f = fixture();
    await f.call(request()); vi.setSystemTime(start + 60000); await f.call(request());
    vi.setSystemTime(start + 120000); await f.call(request());
    vi.setSystemTime(start + PUBLIC_JEV_WINDOW_MS - 1); expect((await f.call(request())).status).toBe(429);
    vi.setSystemTime(start + PUBLIC_JEV_WINDOW_MS);
    expect(await (await f.call(request())).json()).toMatchObject({ remaining: 0, resetAt: start + 60000 + PUBLIC_JEV_WINDOW_MS });
    expect((await f.call(request())).status).toBe(429);
    vi.setSystemTime(start + 60000 + PUBLIC_JEV_WINDOW_MS);
    expect((await f.call(request())).status).toBe(200);
  });
  test("parallel requests reserve atomically while upstream is pending", async () => {
    const f = fixture(), release = Promise.withResolvers(), entered = Promise.withResolvers();
    let calls = 0;
    fetch.mockImplementation(async () => { if (++calls === 3) entered.resolve(); await release.promise; return upstreamResult(); });
    const pending = Array.from({ length: 20 }, () => f.call(request()));
    await entered.promise;
    const blocked = await f.call(request());
    expect(blocked.status).toBe(429); expect(await blocked.json()).toMatchObject({ error: "busy", remaining: 3 });
    expect(fetch).toHaveBeenCalledTimes(3);
    release.resolve();
    const responses = await Promise.all(pending);
    expect(responses.filter(r => r.status === 200)).toHaveLength(3);
    expect(responses.filter(r => r.status === 429)).toHaveLength(17);
    expect((await f.call(request())).status).toBe(429);
  });
  test.each(["http", "redirect", "network", "json", "schema", "oversized"])("failed %s requests free reservations", async failure => {
    const f = fixture();
    fetch.mockImplementationOnce(async () => {
      if (failure === "network") throw new Error("synthetic-provider-secret");
      if (failure === "http") return new Response("private details", { status: 429 });
      if (failure === "redirect") return new Response(null, { status: 302, headers: { Location: "https://attacker.test" } });
      if (failure === "json") return new Response("{");
      if (failure === "oversized") return new Response("x".repeat(32769));
      return Response.json({ answers: { decision: { type: "choice", noul: 0.73 } } });
    });
    const failed = await f.call(request()); expect(failed.status).toBe(502);
    expect(await failed.text()).not.toMatch(/secret|private details|Location/);
    expect(rows([...f.stores.values()][0])).toEqual([]);
    for (const remaining of [2, 1, 0]) expect(await (await f.call(request())).json()).toMatchObject({ remaining });
  });
  test.each(["headers", "body"])("timeout across %s releases quota and ignores late completion", async phase => {
    vi.useFakeTimers(); const f = fixture(), entered = Promise.withResolvers(), late = Promise.withResolvers();
    fetch.mockImplementationOnce(() => { entered.resolve(); return phase === "headers" ? late.promise : new Response(new ReadableStream()); });
    const pending = f.call(request()); await entered.promise; await vi.advanceTimersByTimeAsync(10001);
    expect((await pending).status).toBe(504);
    expect(rows([...f.stores.values()][0])).toEqual([]);
    late.resolve(upstreamResult());
    expect(await (await f.call(request())).json()).toMatchObject({ remaining: 2 });
  });
  test("mixed parallel failures allow exactly three eventual successes", async () => {
    const f = fixture(), release = Promise.withResolvers(), entered = Promise.withResolvers();
    let calls = 0;
    fetch.mockImplementation(async () => { const call = ++calls; if (call === 3) entered.resolve(); await release.promise; return call === 1 ? new Response(null, { status: 500 }) : upstreamResult(); });
    const pending = Array.from({ length: 3 }, () => f.call(request())); await entered.promise;
    expect((await f.call(request())).status).toBe(429); release.resolve();
    expect((await Promise.all(pending)).map(r => r.status).sort()).toEqual([200, 200, 502]);
    expect(await (await f.call(request())).json()).toMatchObject({ remaining: 0 });
    expect((await f.call(request())).status).toBe(429);
  });
  test("persisted state survives recreation and abandoned leases recover", async () => {
    vi.useFakeTimers(); const f = fixture(); await f.call(request());
    const store = [...f.stores.values()][0];
    store.sql.exec("INSERT INTO uses VALUES (?, 'pending', ?)", "crashed", Date.now() + PUBLIC_JEV_LEASE_MS);
    store.sql.exec("INSERT INTO uses VALUES (?, 'pending', ?)", "crashed-2", Date.now() + PUBLIC_JEV_LEASE_MS);
    expect((await askPublicJev(store, f.env, "After restart?")).status).toBe(429);
    vi.setSystemTime(Date.now() + PUBLIC_JEV_LEASE_MS);
    expect(await (await askPublicJev(store, f.env, "Recovered?")).json()).toMatchObject({ remaining: 1 });
    vi.setSystemTime(Date.now() + PUBLIC_JEV_WINDOW_MS);
    await expirePublicJev(store); expect(store.deleteAll).toHaveBeenCalledOnce();
    expect(await (await askPublicJev(store, f.env, "New day?")).json()).toMatchObject({ remaining: 2 });
  });
  test("a reclaimed lease fences late completion", async () => {
    vi.useFakeTimers(); const f = fixture(), entered = Promise.withResolvers(), release = Promise.withResolvers();
    fetch.mockImplementationOnce(async () => { entered.resolve(); await release.promise; return upstreamResult(); });
    const first = f.call(request()); await entered.promise;
    vi.setSystemTime(Date.now() + PUBLIC_JEV_LEASE_MS);
    expect((await f.call(request())).status).toBe(200);
    release.resolve(); expect((await first).status).toBe(503);
    expect(rows([...f.stores.values()][0])).toHaveLength(1);
  });
  test("internal alarm or commit failure does not permanently consume quota", async () => {
    const f = fixture(); const store = storage(); initializePublicJev(store);
    store.setAlarm.mockRejectedValueOnce(new Error("storage failure"));
    expect((await askPublicJev(store, f.env, "One?")).status).toBe(503); expect(fetch).not.toHaveBeenCalled(); expect(rows(store)).toEqual([]);
    const original = store.sql.exec;
    store.sql.exec = (query, ...args) => { if (query.startsWith("UPDATE")) throw new Error("storage failure"); return original(query, ...args); };
    expect((await askPublicJev(store, f.env, "One?")).status).toBe(503); expect(rows(store)).toEqual([]);
    store.sql.exec = original;
    expect(await (await askPublicJev(store, f.env, "One?")).json()).toMatchObject({ remaining: 2 });
  });
});

describe("IP privacy and Pages isolation", () => {
  test("uses a stable keyed digest, canonical IPv6, and no stored questions/IPs/results", async () => {
    const f = fixture(); await f.call(request());
    const digest = f.env.JEV_PUBLIC_QUOTA.getByName.mock.calls[0][0];
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(await publicJevIdentity(request(), f.env.JEV_PUBLIC_IP_HMAC_KEY)).toBe(digest);
    expect(await publicJevIdentity(request(), "different-synthetic-test-secret-12345")).not.toBe(digest);
    const ip = value => request({}, { headers: { "CF-Connecting-IP": value } });
    expect(await publicJevIdentity(ip("2001:db8::1"), f.env.JEV_PUBLIC_IP_HMAC_KEY)).toBe(await publicJevIdentity(ip("2001:0DB8:0:0:0:0:0:1"), f.env.JEV_PUBLIC_IP_HMAC_KEY));
    const stored = JSON.stringify(rows([...f.stores.values()][0]));
    expect(stored).not.toMatch(/192\.0\.2|牛肉|probability|secret/);
    expect(Object.keys(rows([...f.stores.values()][0])[0]).sort()).toEqual(["expires_at", "id", "state"]);
    expect(await (await f.call(request(undefined, { headers: { "CF-Connecting-IP": "192.0.2.2" } }))).json()).toMatchObject({ remaining: 2 });
  });
  test.each(["", "not-an-ip", "999.1.1.1", "192.0.2.1, 192.0.2.2"])("fails closed on missing/malformed edge IP %#", async ip => {
    const f = fixture();
    expect((await f.call(request(undefined, { headers: { "CF-Connecting-IP": ip, "X-Forwarded-For": "192.0.2.1", "X-Real-IP": "192.0.2.1" } }))).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });
  test("an unsolicited IPv6 header cannot bypass IPv4 quota; Pseudo IPv4 uses the real IPv6", async () => {
    const f = fixture(), key = f.env.JEV_PUBLIC_IP_HMAC_KEY;
    const identity = await publicJevIdentity(request(), key);
    expect(await publicJevIdentity(request(undefined, { headers: { "CF-Connecting-IPv6": "2001:db8::1" } }), key)).toBe(identity);
    const ipv6 = await publicJevIdentity(request(undefined, { headers: { "CF-Connecting-IP": "2001:db8::1" } }), key);
    expect(await publicJevIdentity(request(undefined, { headers: { "CF-Connecting-IP": "240.1.2.3", "CF-Connecting-IPv6": "2001:db8::1" } }), key)).toBe(ipv6);
    await expect(publicJevIdentity(request(undefined, { headers: { "CF-Connecting-IP": "240.1.2.3" } }), key)).rejects.toThrow("unavailable");
  });
  test("anonymous bridge reaches public Worker without private configuration or auth headers", async () => {
    const f = fixture(); const binding = vi.fn(req => f.call(req));
    const next = vi.fn();
    const response = await onRequest({ request: request(undefined, { headers: { Authorization: "client-secret", Cookie: "session", "Cf-Access-Jwt-Assertion": "private-jwt", "X-Forwarded-For": "spoofed" } }), env: { JEV_API: { fetch: binding } }, next });
    expect(response.status).toBe(200); expect(next).not.toHaveBeenCalled();
    const forwarded = binding.mock.calls[0][0];
    expect([...forwarded.headers.keys()].sort()).toEqual(["cf-connecting-ip", "content-type", "origin"]);
    expect(forwarded.redirect).toBe("manual");
    expect(await response.text()).not.toMatch(/secret|session|private-jwt|192\.0\.2/);
  });
  test.each([301, 302, 307, 308])("public bridge rejects redirect %i", async status => {
    const response = await onRequest({ request: request(), env: { JEV_API: { fetch: async () => new Response(null, { status, headers: { Location: "https://attacker.test" } }) } }, next: vi.fn() });
    expect(response.status).toBe(502); expect(response.headers.has("Location")).toBe(false);
  });
  test.each([
    [200, { ok: true, probability: 0.7, remaining: 2, resetAt: 1790500000000, debug: "secret" }, 200],
    [503, { ok: false, error: "unavailable", debug: "secret" }, 503],
    [500, { ok: false, error: "secret" }, 502],
    [200, { ok: true, probability: 0.7, remaining: 9, resetAt: null }, 502],
    [429, { ok: false, error: "rate_limited", remaining: 3, resetAt: null }, 502],
  ])("bridge narrows response status %i and never forwards extra fields", async (status, body, expected) => {
    const response = await onRequest({ request: request(), env: { JEV_API: { fetch: async () => Response.json(body, { status }) } }, next: vi.fn() });
    expect(response.status).toBe(expected); expect(await response.text()).not.toMatch(/debug|secret/);
  });
  test("only beta has the new entry, binding and SQLite migration; existing route manifest covers public API", async () => {
    const config = await readFile(new URL("../../workers/huihui-api/wrangler.toml", import.meta.url), "utf8");
    expect(config.split("[env.beta]")[0]).not.toMatch(/JevPublicQuota|JEV_PUBLIC|worker-beta/);
    expect(config).toContain('main = "worker-beta.js"');
    expect(config).toContain("[[env.beta.durable_objects.bindings]]");
    expect(config).toContain('new_sqlite_classes = ["JevPublicQuota"]');
    const routes = JSON.parse(await readFile(new URL("../../v2/public/_routes.json", import.meta.url), "utf8"));
    expect(routes.include).toContain("/api/jev*");
  });
});
