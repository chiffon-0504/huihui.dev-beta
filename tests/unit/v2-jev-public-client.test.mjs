import { afterEach, expect, test, vi } from "vitest";
import { askPublicJev, isPublicJevReply, questionLength, validPublicQuestion } from "../../v2/src/services/jev-public.ts";

const reply = { ok: true, probability: 0.73, remaining: 2, resetAt: 1790500000000 };
const ask = question => askPublicJev(question ?? "One question?", new AbortController().signal);
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
test("the public adapter sends only one question without credentials or private API traffic", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(reply)));
  expect(await ask()).toEqual(reply);
  expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/jev-public", expect.objectContaining({
    method: "POST", credentials: "omit", mode: "same-origin", redirect: "error", cache: "no-store", referrerPolicy: "no-referrer",
    body: JSON.stringify({ question: "One question?" }), headers: { "Content-Type": "application/json", Accept: "application/json" },
  }));
});
test.each(["", "  ", "x".repeat(100), "😀".repeat(100), "\ud800"])("invalid input %# never sends", async question => {
  vi.stubGlobal("fetch", vi.fn()); await expect(ask(question)).rejects.toMatchObject({ kind: "invalid_data" }); expect(fetch).not.toHaveBeenCalled();
});
test("the boundary and counter use Unicode code points", () => {
  expect(questionLength("😀".repeat(99))).toBe(99);
  expect(validPublicQuestion("😀".repeat(99))).toBe(true);
  expect(validPublicQuestion("字".repeat(99))).toBe(true);
  expect(validPublicQuestion("字".repeat(100))).toBe(false);
});
test.each([400, 413, 415, 401, 500, 502, 503, 504])("discards HTTP %i details", async status => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("sensitive-provider-details", { status })));
  await expect(ask()).rejects.toMatchObject({ kind: "http", status });
});
test.each([
  { ok: false, error: "rate_limited", remaining: 0, resetAt: reply.resetAt },
  { ok: false, error: "busy", remaining: 3, resetAt: null },
])("validates exhausted and in-flight quota separately: $error", async value => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(value, { status: 429 })));
  expect(await ask()).toEqual(value);
});
test.each([
  null, [], {}, { ...reply, probability: 2 }, { ...reply, probability: "0.7" }, { ...reply, probability: NaN },
  { ...reply, remaining: 4 }, { ...reply, remaining: -1 }, { ...reply, remaining: 1.5 }, { ...reply, remaining: "2" },
  { ...reply, resetAt: null }, { ...reply, resetAt: -1 }, { ...reply, resetAt: "tomorrow" },
  { ok: false, error: "rate_limited", remaining: 2, resetAt: reply.resetAt },
  { ok: false, error: "secret-diagnostic", remaining: 0, resetAt: reply.resetAt },
])("rejects untrusted response schema %#", value => expect(isPublicJevReply(value)).toBe(false));
test.each(["{", "<html>redirect</html>", "x".repeat(1025)])("rejects malformed/bounded responses %#", async body => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(body)));
  await expect(ask()).rejects.toThrow();
});
test.each(["headers", "body"])("deadline covers stalled %s with no retry", async phase => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn(() => phase === "headers" ? new Promise(() => {}) : Promise.resolve(new Response(new ReadableStream()))));
  const pending = expect(ask()).rejects.toMatchObject({ kind: "timeout" });
  await vi.advanceTimersByTimeAsync(25001); await pending;
  expect(fetch).toHaveBeenCalledOnce(); expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
});
test("caller cancellation wins even when fetch ignores abort; pre-abort never sends", async () => {
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  const controller = new AbortController();
  const pending = expect(askPublicJev("One?", controller.signal)).rejects.toMatchObject({ kind: "aborted" });
  controller.abort(); await pending;
  await expect(askPublicJev("One?", controller.signal)).rejects.toMatchObject({ kind: "aborted" });
  expect(fetch).toHaveBeenCalledOnce();
});
