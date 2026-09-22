import { afterEach, expect, test, vi } from "vitest";
import { askJev, isJevResult } from "../../v2/src/services/jev.ts";
const form = { mode: "noul", question: "Synthetic question", context: [] };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
test("sends narrow JSON only to the same-origin endpoint without retries", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true, result: { mode: "noul", probability: 0.73 } })));
  await expect(askJev(form)).resolves.toEqual({ mode: "noul", probability: 0.73 });
  const [url, init] = fetch.mock.calls[0]; expect(url).toBe("/api/jev");
  expect(init).toMatchObject({ credentials: "same-origin", mode: "same-origin", redirect: "error", cache: "no-store", referrerPolicy: "no-referrer" });
  expect(JSON.parse(init.body)).toEqual(form); expect(fetch).toHaveBeenCalledTimes(1);
});
test.each([401, 403, 429, 502, 504])("discards sensitive HTTP %i response text", async status => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("private-diagnostic", { status })));
  await expect(askJev(form)).rejects.toMatchObject({ kind: "http", status }); expect(fetch).toHaveBeenCalledTimes(1);
});
test.each(["<html>Login</html>", "x".repeat(16385), JSON.stringify({ ok: true, result: { mode: "noul", probability: 2 } })])("rejects invalid and unbounded bodies %#", async body => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(body)));
  await expect(askJev(form)).rejects.toThrow();
});
test.each(["headers", "body"])("deadline covers stalled %s", async phase => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn(() => phase === "headers" ? new Promise(() => {}) : Promise.resolve(new Response(new ReadableStream({ start() {} })))));
  const assertion = expect(askJev(form)).rejects.toMatchObject({ kind: "timeout" });
  await vi.advanceTimersByTimeAsync(25001); await assertion;
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true); expect(fetch).toHaveBeenCalledTimes(1);
});
test("checks response mode and distribution identities", () => {
  const choice = { ...form, mode: "choice", options: [{ id: "option_1", label: "One" }, { id: "option_3", label: "Three" }] };
  expect(isJevResult({ mode: "noul", probability: 0.5 }, choice)).toBe(false);
  expect(isJevResult({ mode: "choice", confidence: 0.5, choice: "option_1", distribution: [{ id: "option_1", probability: 0.75 }, { id: "option_3", probability: 0.25 }] }, choice)).toBe(true);
  expect(isJevResult({ mode: "choice", confidence: 0.5, choice: "option_1", distribution: [{ id: "option_1", probability: 0.75 }, { id: "option_1", probability: 0.25 }] }, choice)).toBe(false);
});
