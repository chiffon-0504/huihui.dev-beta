import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
let source;
let localeSource;

beforeAll(async () => {
  [source, localeSource] = await Promise.all([
    readFile(path.join(root, "js/contact.js"), "utf8"),
    readFile(path.join(root, "js/locales/en.js"), "utf8"),
  ]);
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function loadContact() {
  let submit;
  const token = { value: "test-turnstile-token" };
  const button = { disabled: false, textContent: "Send Message" };
  const status = { textContent: "" };
  const formData = new FormData();
  formData.set("name", " Test User ");
  formData.set("email", "test@example.com");
  formData.set("subject", "Test subject");
  formData.set("message", "Test message");
  const form = {
    action: "https://contact.example/api/contact",
    dataset: {},
    querySelector: () => button,
    querySelectorAll: () => [token],
    reset: vi.fn(),
    addEventListener(event, listener) {
      if (event === "submit") submit = listener;
    },
  };
  const resetTurnstile = vi.fn();
  // The VM has only this stub: no network-capable fetch is exposed to tests.
  const fetch = vi.fn();
  const clearTimeoutSpy = vi.fn(clearTimeout);
  const context = vm.createContext({
    AbortController,
    fetch,
    setTimeout,
    clearTimeout: clearTimeoutSpy,
    FormData: function (input) {
      expect(input).toBe(form);
      formData.set("cf-turnstile-response", token.value);
      return formData;
    },
    document: {
      readyState: "complete",
      getElementById: (id) => id === "contact-form" ? form : status,
    },
    window: { turnstile: { reset: resetTurnstile } },
    getCurrentLocale: () => "en",
  });
  vm.runInContext(localeSource, context);
  vm.runInContext(source, context, { filename: "js/contact.js" });

  return {
    button, status, form, formData, token, fetch, resetTurnstile, clearTimeoutSpy,
    deadline: vm.runInContext("CONTACT_SUBMISSION_TIMEOUT_MS", context),
    submit: () => submit({ preventDefault: vi.fn() }),
  };
}

function pendingUntilAbort(signal) {
  return new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

function expectRestored(contact, message) {
  expect(contact.status.textContent).toBe(message);
  expect(contact.button).toEqual({ disabled: false, textContent: "Send Message" });
  expect(contact.resetTurnstile).toHaveBeenCalledOnce();
  expect(contact.token.value).toBe("");
  expect(contact.clearTimeoutSpy).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
}

describe("Contact frontend submission deadline", () => {
  test("preserves the selected endpoint and FormData and clears the timer after success", async () => {
    const contact = loadContact();
    let resolveFetch;
    contact.fetch.mockImplementation(() => new Promise((resolve) => {
      resolveFetch = resolve;
    }));

    const pending = contact.submit();
    expect(contact.deadline).toBe(30_000);
    expect(contact.button).toEqual({ disabled: true, textContent: "Sending..." });
    expect(vi.getTimerCount()).toBe(1);
    expect(contact.fetch).toHaveBeenCalledWith(contact.form.action, {
      method: "POST", body: contact.formData, signal: expect.any(AbortSignal),
    });
    expect(contact.formData.get("name")).toBe(" Test User ");
    expect(contact.formData.get("subject")).toBe("Test subject");
    const signal = contact.fetch.mock.calls[0][1].signal;

    // A valid response may need the entire sequential 5s + 10s upstream budget.
    await vi.advanceTimersByTimeAsync(15_000);
    expect(signal.aborted).toBe(false);
    expect(contact.button.disabled).toBe(true);
    resolveFetch({ ok: true, json: async () => ({ ok: true }) });
    await pending;

    expectRestored(contact, "Message sent.");
    expect(contact.form.reset).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(contact.deadline);
    expect(signal.aborted).toBe(false);
    expect(contact.fetch).toHaveBeenCalledOnce();
  });

  test.each(["fetch", "response body"])("aborts a hanging %s at the deadline and permits a later explicit submission", async (phase) => {
    const contact = loadContact();
    const json = vi.fn();
    contact.fetch.mockImplementation((_url, { signal }) => {
      if (phase === "fetch") return pendingUntilAbort(signal);
      json.mockImplementation(() => pendingUntilAbort(signal));
      return Promise.resolve({ ok: true, json });
    });

    const pending = contact.submit();
    const signal = contact.fetch.mock.calls[0][1].signal;
    await vi.advanceTimersByTimeAsync(contact.deadline - 1);
    expect(signal.aborted).toBe(false);
    expect(contact.button.disabled).toBe(true);
    expect(contact.status.textContent).toBe("");
    expect(contact.resetTurnstile).not.toHaveBeenCalled();
    if (phase === "response body") expect(json).toHaveBeenCalledOnce();
    await contact.submit();
    expect(contact.fetch).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(signal.aborted).toBe(true);
    expectRestored(contact, "Failed to send. Please try again later.");
    expect(contact.form.reset).not.toHaveBeenCalled();
    expect(contact.formData.get("message")).toBe("Test message");
    await vi.advanceTimersByTimeAsync(contact.deadline);
    expect(contact.fetch).toHaveBeenCalledOnce();

    // Timeout clears the token, so retry still requires a fresh verification.
    await contact.submit();
    expect(contact.fetch).toHaveBeenCalledOnce();
    contact.token.value = "fresh-test-token";
    contact.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    await contact.submit();
    expect(contact.fetch).toHaveBeenCalledTimes(2);
    expect(contact.fetch.mock.calls[1][1].signal).not.toBe(signal);
    expect(contact.fetch.mock.calls[1][1].signal.aborted).toBe(false);
    expect(contact.status.textContent).toBe("Message sent.");
    expect(contact.button.disabled).toBe(false);
    expect(contact.resetTurnstile).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  test.each(["HTTP failure", "application failure", "network rejection", "invalid JSON", "synchronous throw"])("clears the timer after %s without exposing raw details", async (failure) => {
    const contact = loadContact();
    contact.fetch.mockImplementation(() => {
      const error = new Error("raw exception details");
      if (failure === "synchronous throw") throw error;
      if (failure === "network rejection") return Promise.reject(error);
      return Promise.resolve({
        ok: failure !== "HTTP failure",
        json: async () => {
          if (failure === "invalid JSON") throw error;
          return { ok: failure === "HTTP failure", message: error.message };
        },
      });
    });

    await contact.submit();
    expectRestored(contact, "Failed to send. Please try again later.");
    expect(contact.form.reset).not.toHaveBeenCalled();
    const signal = contact.fetch.mock.calls[0][1].signal;
    await vi.advanceTimersByTimeAsync(contact.deadline);
    expect(signal.aborted).toBe(false);
    expect(contact.fetch).toHaveBeenCalledOnce();
  });
});
