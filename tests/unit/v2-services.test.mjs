import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { requestJson } from "../../v2/src/services/client.ts";
import { resolveApiEndpoint, resolveApiOrigin } from "../../v2/src/services/endpoints.ts";
import { ServiceError } from "../../v2/src/services/errors.ts";

const beta = "https://huihui-api-beta.huihuigames01.workers.dev";
const isHealth = (value) => typeof value === "object" && value !== null && typeof value.ok === "boolean";
const request = (options) => requestJson("beta", "/api/health", isHealth, options);
let fetchMock;

beforeEach(() => {
  vi.useFakeTimers();
  // Every request is controlled; no unit test can contact a real API.
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function expectFailure(promise, kind, status) {
  await expect(promise).rejects.toBeInstanceOf(ServiceError);
  await expect(promise).rejects.toMatchObject({ name: "ServiceError", kind, status });
}

test("requires explicit beta/production selection without inferring a host or default", () => {
  expect(resolveApiOrigin("beta")).toBe(beta);
  expect(resolveApiOrigin("production")).toBe("https://api.huihui.dev");
  expect(resolveApiEndpoint("beta", "/api/system-status/history")).toBe(`${beta}/api/system-status/history`);
  expect(resolveApiEndpoint("production", "/api/health")).toBe("https://api.huihui.dev/api/health");
  expect(fetchMock).not.toHaveBeenCalled();
});

test.each([undefined, "", "staging", "localhost", "toString", "__proto__", "https://api.github.com"])(
  "rejects unsupported environment %s before dispatch", async (environment) => {
    await expectFailure(requestJson(environment, "/api/health", isHealth), "configuration");
    expect(fetchMock).not.toHaveBeenCalled();
  },
);

test.each([
  "https://api.github.com/repos/example/repo", "https://api.nasa.gov/planetary/apod",
  "https://api.steampowered.com/", "https://example.com/feed.rss",
  "//api.github.com/api/health", "https://api.huihui.dev/api/health",
  "/api/../health", "/api/%2e%2e/health", "/api/a/../../health", "/api/a\\health",
  "/api//health", "/api/health?token=secret", "/api/health#fragment", "/api/health/",
  " /api/health", "/api/health\n", "/api/", "/health", "api/health", "", undefined,
])("rejects noncanonical or external endpoint %s without a request", async (path) => {
  await expectFailure(requestJson("beta", path, isHealth), "configuration");
  expect(fetchMock).not.toHaveBeenCalled();
});

test("returns validated JSON with fixed safe transport defaults and no retries", async () => {
  fetchMock.mockResolvedValue(Response.json({ ok: true }));
  const validate = vi.fn(isHealth);
  await expect(requestJson("beta", "/api/health", validate)).resolves.toEqual({ ok: true });
  expect(validate).toHaveBeenCalledExactlyOnceWith({ ok: true });
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith(`${beta}/api/health`, {
    method: "GET", headers: { Accept: "application/json" }, credentials: "omit",
    mode: "cors", redirect: "error", referrerPolicy: "no-referrer", cache: "no-store",
    signal: expect.any(AbortSignal),
  });
});

test.each([301, 404, 429, 500])("normalizes HTTP %s without reading error bodies", async (status) => {
  const response = new Response("private response text", { status, statusText: "Private diagnostics" });
  const readBody = vi.spyOn(response, "text");
  fetchMock.mockResolvedValue(response);
  const promise = request();
  await expectFailure(promise, "http", status);
  expect(readBody).not.toHaveBeenCalled();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  const error = await promise.catch((failure) => failure);
  expect(`${error.message} ${JSON.stringify(error)}`).not.toContain("Private");
  expect(error).not.toHaveProperty("cause");
});

test.each(["{", "<html>error</html>", "", '{"ok":undefined}'])("rejects malformed JSON %s", async (body) => {
  fetchMock.mockResolvedValue(new Response(body));
  await expectFailure(request(), "invalid_json");
});

test("rejects an empty 204 response under the JSON-only contract", async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  await expectFailure(request(), "invalid_json");
});

test.each([null, [], 42, { ok: "true" }, { other: true }])("rejects JSON with an invalid shape: %j", async (body) => {
  fetchMock.mockResolvedValue(Response.json(body));
  await expectFailure(request(), "invalid_data");
});

test("validates structure without interpreting feature-level ok:false", async () => {
  fetchMock.mockResolvedValue(Response.json({ ok: false }));
  await expect(request()).resolves.toEqual({ ok: false });
});

test("normalizes a throwing validator without leaking its raw error", async () => {
  fetchMock.mockResolvedValue(Response.json({ ok: true }));
  const promise = requestJson("beta", "/api/health", () => { throw new Error("private payload"); });
  await expectFailure(promise, "invalid_data");
  await expect(promise).rejects.not.toHaveProperty("cause");
});

test.each(["fetch", "body"])("normalizes %s transport failures without retrying", async (phase) => {
  const error = new TypeError("sensitive URL or browser diagnostics");
  if (phase === "fetch") fetchMock.mockRejectedValue(error);
  else fetchMock.mockResolvedValue({ ok: true, text: () => Promise.reject(error) });
  const promise = request();
  await expectFailure(promise, "network");
  await expect(promise).rejects.not.toHaveProperty("cause");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("normalizes a synchronous fetch failure and cleans up the deadline", async () => {
  fetchMock.mockImplementation(() => { throw new TypeError("failed"); });
  await expectFailure(request(), "network");
});

test.each([0, -1, NaN, Infinity, 0.5, 2_147_483_648])("rejects invalid timeout %s before dispatch", async (timeoutMs) => {
  await expectFailure(request({ timeoutMs }), "configuration");
  expect(fetchMock).not.toHaveBeenCalled();
});

test("rejects a missing validator before dispatch", async () => {
  await expectFailure(requestJson("beta", "/api/health"), "configuration");
  expect(fetchMock).not.toHaveBeenCalled();
});

test("rejects an already-aborted signal without starting a request", async () => {
  const controller = new AbortController();
  controller.abort("private reason");
  await expectFailure(request({ signal: controller.signal }), "aborted");
  expect(fetchMock).not.toHaveBeenCalled();
});

test.each(["fetch", "body"])("deadline covers a stalled %s even when a transport ignores abort", async (phase) => {
  const bodyStarted = vi.fn(() => new Promise(() => {}));
  fetchMock.mockImplementation(() => phase === "fetch"
    ? new Promise(() => {}) : Promise.resolve({ ok: true, text: bodyStarted }));
  const promise = request({ timeoutMs: 100 });
  const result = expectFailure(promise, "timeout");
  await vi.advanceTimersByTimeAsync(99);
  expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(false);
  if (phase === "body") expect(bodyStarted).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1);
  await result;
  expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("uses a finite ten-second default deadline", async () => {
  fetchMock.mockReturnValue(new Promise(() => {}));
  const result = expectFailure(request(), "timeout");
  await vi.advanceTimersByTimeAsync(9_999);
  expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  await result;
});

test.each(["fetch", "body"])("caller cancellation covers %s and detaches its listener", async (phase) => {
  const controller = new AbortController();
  const remove = vi.spyOn(controller.signal, "removeEventListener");
  fetchMock.mockImplementation(() => phase === "fetch"
    ? new Promise(() => {}) : Promise.resolve({ ok: true, text: () => new Promise(() => {}) }));
  const promise = request({ signal: controller.signal });
  const result = expectFailure(promise, "aborted");
  await vi.advanceTimersByTimeAsync(0);
  controller.abort(new Error("private cancellation reason"));
  await result;
  expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
  expect(controller.signal.reason.message).toBe("private cancellation reason");
});

test("successful requests detach the caller listener and cancel the timer", async () => {
  const controller = new AbortController();
  const remove = vi.spyOn(controller.signal, "removeEventListener");
  fetchMock.mockResolvedValue(Response.json({ ok: true }));
  await request({ signal: controller.signal });
  expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
  controller.abort();
  await vi.advanceTimersByTimeAsync(10_000);
  expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(false);
});

test("a deadline failure retains its kind after later caller cancellation", async () => {
  const controller = new AbortController();
  fetchMock.mockReturnValue(new Promise(() => {}));
  const promise = request({ signal: controller.signal, timeoutMs: 1 });
  const result = expectFailure(promise, "timeout");
  await vi.advanceTimersByTimeAsync(1);
  controller.abort();
  await result;
  await expectFailure(promise, "timeout");
});

test("caller cancellation during validation cannot return stale success", async () => {
  const controller = new AbortController();
  fetchMock.mockResolvedValue(Response.json({ ok: true }));
  await expectFailure(requestJson("beta", "/api/health", (data) => {
    controller.abort();
    return isHealth(data);
  }, { signal: controller.signal }), "aborted");
});

test("cancelling one request leaves a concurrent request independent", async () => {
  const controller = new AbortController();
  fetchMock.mockReturnValueOnce(new Promise(() => {})).mockResolvedValueOnce(Response.json({ ok: true }));
  const cancelled = expectFailure(request({ signal: controller.signal }), "aborted");
  const successful = request();
  controller.abort();
  await cancelled;
  await expect(successful).resolves.toEqual({ ok: true });
  expect(fetchMock.mock.calls[1][1].signal.aborted).toBe(false);
});

test("ignores late transport settlement after cancellation without running a validator", async () => {
  let complete;
  fetchMock.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
  const validate = vi.fn(isHealth);
  const promise = requestJson("beta", "/api/health", validate, { timeoutMs: 1 });
  const result = expectFailure(promise, "timeout");
  await vi.advanceTimersByTimeAsync(1);
  await result;
  complete(Response.json({ ok: true }));
  await Promise.resolve();
  expect(validate).not.toHaveBeenCalled();
});

test("typed consumers must provide a guard and cannot override the transport boundary", () => {
  const result = spawnSync(process.execPath, [
    fileURLToPath(new URL("../../node_modules/typescript/bin/tsc", import.meta.url)),
    "--project", fileURLToPath(new URL("../fixtures/v2-services.tsconfig.json", import.meta.url)),
    "--noEmit", "--pretty", "false",
  ], { encoding: "utf8" });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stdout + result.stderr).toBe(0);
});
