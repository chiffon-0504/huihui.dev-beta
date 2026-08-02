import { afterEach, describe, expect, test, vi } from "vitest";
import worker from "../../workers/huihui-api/worker.js";

const contactUrl = "https://api.example.test/api/contact";
const turnstileUrl =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const formspreeEndpoint = "https://formspree.example.test/contact";
const productionOrigin = "https://huihui.dev";
const betaOrigin = "https://beta.huihui.dev";
const contactAction = "contact";
const turnstileSecret = "test-turnstile-secret";
const turnstileToken = "test-turnstile-token";
const rawUpstreamBody = "raw-upstream-body-marker";
const networkErrorMarker = "network-error-marker";
const stackTraceMarker = "stack-trace-marker";

const baseEnv = {
  WORKER_ENV: "production",
  TURNSTILE_SECRET_KEY: turnstileSecret,
  FORMSPREE_ENDPOINT: formspreeEndpoint,
};

const forbiddenErrorContent = [
  turnstileSecret,
  turnstileToken,
  rawUpstreamBody,
  networkErrorMarker,
  stackTraceMarker,
];

function contactFormData(overrides = {}) {
  const values = {
    name: "Test User",
    email: "test@example.com",
    message: "Hello from the Contact form.",
    "cf-turnstile-response": turnstileToken,
    ...overrides,
  };
  const formData = new FormData();

  for (const [name, value] of Object.entries(values)) {
    if (value !== undefined) {
      formData.set(name, value);
    }
  }

  return formData;
}

function successfulTurnstileValidation(
  origin = productionOrigin,
  overrides = {},
) {
  return {
    success: true,
    hostname: new URL(origin).hostname,
    action: contactAction,
    ...overrides,
  };
}

function contactRequest({
  body = contactFormData(),
  origin = productionOrigin,
  headers = {},
  method = "POST",
} = {}) {
  const requestHeaders = new Headers(headers);

  if (origin !== null) {
    requestHeaders.set("Origin", origin);
  }

  return new Request(contactUrl, {
    method,
    headers: requestHeaders,
    body: method === "POST" ? body : undefined,
  });
}

function callContact(options = {}, env = baseEnv) {
  return worker.fetch(contactRequest(options), env, {});
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function expectAllowedCors(response, origin = productionOrigin) {
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
  expect(response.headers.get("Access-Control-Allow-Origin")).not.toBe("*");
  expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
    "POST, OPTIONS",
  );
  expect(response.headers.get("Access-Control-Allow-Headers")).toBe(
    "Content-Type",
  );
  expect(response.headers.get("Vary")).toMatch(/(?:^|,\s*)Origin(?:,|$)/i);
}

function expectRejectedCors(response) {
  expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
  expect(response.headers.has("Access-Control-Allow-Methods")).toBe(false);
  expect(response.headers.has("Access-Control-Allow-Headers")).toBe(false);
  expect(response.headers.get("Vary")).toMatch(/(?:^|,\s*)Origin(?:,|$)/i);
}

async function expectContactResponse(
  response,
  status,
  expectedBody,
  { origin = productionOrigin, corsAllowed = true } = {},
) {
  expect(response.status).toBe(status);
  expect(response.headers.get("Content-Type")).toBe(
    "application/json; charset=utf-8",
  );

  if (corsAllowed) {
    expectAllowedCors(response, origin);
  } else {
    expectRejectedCors(response);
  }

  const responseText = await response.text();
  expect(JSON.parse(responseText)).toEqual(expectedBody);

  if (status >= 400) {
    for (const forbidden of forbiddenErrorContent) {
      expect(responseText).not.toContain(forbidden);
    }
  }
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Contact Worker request and upstream error handling", () => {
  test("keeps the successful path and trims values before upstream requests", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(successfulTurnstileValidation()),
      )
      .mockResolvedValueOnce(
        new Response(rawUpstreamBody, {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const response = await callContact({
      body: contactFormData({
        name: "  Test User  ",
        email: "  test@example.com  ",
        message: "  Hello from the Contact form.  ",
        "cf-turnstile-response": `  ${turnstileToken}  `,
      }),
    });

    await expectContactResponse(response, 200, {
      ok: true,
      message: "Message sent",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe(turnstileUrl);
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(fetchMock.mock.calls[0][1].body.get("response")).toBe(
      turnstileToken,
    );
    expect(fetchMock.mock.calls[1][0]).toBe(formspreeEndpoint);
    expect(fetchMock.mock.calls[1][1].signal).toBeInstanceOf(AbortSignal);
    expect(fetchMock.mock.calls[1][1].body.get("name")).toBe("Test User");
    expect(fetchMock.mock.calls[1][1].body.get("email")).toBe(
      "test@example.com",
    );
    expect(fetchMock.mock.calls[1][1].body.get("message")).toBe(
      "Hello from the Contact form.",
    );
  });

  test("accepts a production native fallback submission", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(successfulTurnstileValidation()),
      )
      .mockResolvedValueOnce(new Response(rawUpstreamBody, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await callContact({
      body: new URLSearchParams({
        name: "Native User",
        email: "native@example.com",
        message: "Submitted without JavaScript.",
        "cf-turnstile-response": turnstileToken,
      }),
    });

    await expectContactResponse(response, 200, {
      ok: true,
      message: "Message sent",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].body.get("name")).toBe("Native User");
    expect(fetchMock.mock.calls[1][1].body.get("email")).toBe(
      "native@example.com",
    );
  });

  test("accepts an allowed beta preview and binds Turnstile to its hostname", async () => {
    const origin = "https://5a827187.huihuidev-beta.pages.dev";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(successfulTurnstileValidation(origin)),
      )
      .mockResolvedValueOnce(new Response(rawUpstreamBody, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await callContact(
      { origin },
      { ...baseEnv, WORKER_ENV: "beta" },
    );

    await expectContactResponse(
      response,
      200,
      { ok: true, message: "Message sent" },
      { origin },
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("rejects unsupported request content types with a structured 400", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await callContact({
      body: JSON.stringify({ name: "Test User" }),
      headers: { "Content-Type": "application/json" },
    });

    await expectContactResponse(response, 400, {
      ok: false,
      message: "Invalid request body",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("catches malformed multipart bodies with a structured 400", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await callContact({
      body:
        '--broken\r\nContent-Disposition: form-data; name="name"\r\n\r\nTest User',
      headers: { "Content-Type": "multipart/form-data; boundary=broken" },
    });

    await expectContactResponse(response, 400, {
      ok: false,
      message: "Invalid request body",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test.each(["name", "email", "message"])(
    "rejects a missing %s field before upstream requests",
    async (field) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const response = await callContact({
        body: contactFormData({ [field]: undefined }),
      });

      await expectContactResponse(response, 400, {
        ok: false,
        message: "Missing required fields",
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  test("rejects a missing Turnstile token before upstream requests", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await callContact({
      body: contactFormData({ "cf-turnstile-response": undefined }),
    });

    await expectContactResponse(response, 400, {
      ok: false,
      message: "Missing Turnstile token",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("rejects an invalid email before upstream requests", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await callContact({
      body: contactFormData({ email: "not-an-email" }),
    });

    await expectContactResponse(response, 400, {
      ok: false,
      message: "Invalid email address",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test.each([
    ["name", "n".repeat(101)],
    ["email", `${"a".repeat(243)}@example.com`],
    ["message", "m".repeat(5001)],
  ])("rejects an oversized %s before upstream requests", async (field, value) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await callContact({
      body: contactFormData({ [field]: value }),
    });

    await expectContactResponse(response, 400, {
      ok: false,
      message: "Contact field is too long",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test.each(["TURNSTILE_SECRET_KEY", "FORMSPREE_ENDPOINT"])(
    "fails closed without exposing a missing %s binding",
    async (binding) => {
      const env = { ...baseEnv };
      delete env[binding];
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const response = await callContact({}, env);

      await expectContactResponse(response, 500, {
        ok: false,
        message: "Contact service unavailable",
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  test("maps a rejected Turnstile fetch to a structured 502", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error(networkErrorMarker)),
    );

    const response = await callContact();

    await expectContactResponse(response, 502, {
      ok: false,
      message: "Turnstile verification unavailable",
    });
  });

  test.each([
    ["non-JSON", new Response(rawUpstreamBody, { status: 200 })],
    ["malformed JSON", jsonResponse({ unexpected: rawUpstreamBody })],
  ])("maps a %s Turnstile response to a structured 502", async (_label, upstream) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(upstream));

    const response = await callContact();

    await expectContactResponse(response, 502, {
      ok: false,
      message: "Turnstile verification unavailable",
    });
  });

  test("maps a non-success Turnstile status to a structured 502", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(rawUpstreamBody, { status: 503 })),
    );

    const response = await callContact();

    await expectContactResponse(response, 502, {
      ok: false,
      message: "Turnstile verification unavailable",
    });
  });

  test("preserves the normal Turnstile rejection contract with sanitized codes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          success: false,
          "error-codes": ["invalid-input-response", rawUpstreamBody, 123],
        }),
      ),
    );

    const response = await callContact();

    await expectContactResponse(response, 403, {
      ok: false,
      message: "Turnstile verification failed",
      errorCodes: ["invalid-input-response"],
    });
  });

  test.each([
    ["hostname mismatch", { hostname: "attacker.example" }],
    ["different allowed hostname", { hostname: "www.huihui.dev" }],
    ["missing hostname", { hostname: undefined }],
    ["action mismatch", { action: "newsletter" }],
    ["missing action", { action: undefined }],
  ])("rejects a successful Turnstile response with %s", async (_label, overrides) => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(successfulTurnstileValidation(productionOrigin, overrides)),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await callContact();

    await expectContactResponse(response, 403, {
      ok: false,
      message: "Turnstile verification failed",
      errorCodes: [],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("aborts and maps a Turnstile timeout to a structured 504", async () => {
    vi.useFakeTimers();
    let signal;
    let markStarted;
    const started = new Promise((resolve) => {
      markStarted = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, init) => {
        signal = init.signal;
        markStarted();
        return new Promise(() => {});
      }),
    );

    const pendingResponse = callContact();
    await started;
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(5000);
    const response = await pendingResponse;

    await expectContactResponse(response, 504, {
      ok: false,
      message: "Turnstile verification timed out",
    });
    expect(signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  test("maps a rejected Formspree fetch to a structured 502", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(successfulTurnstileValidation()),
        )
        .mockRejectedValueOnce(new Error(networkErrorMarker)),
    );

    const response = await callContact();

    await expectContactResponse(response, 502, {
      ok: false,
      message: "Failed to forward contact form",
    });
  });

  test("maps a non-success Formspree status without exposing its body", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(successfulTurnstileValidation()),
        )
        .mockResolvedValueOnce(
          new Response(rawUpstreamBody, { status: 503 }),
        ),
    );

    const response = await callContact();

    await expectContactResponse(response, 502, {
      ok: false,
      message: "Failed to forward contact form",
    });
  });

  test("aborts and maps a Formspree timeout to a structured 504", async () => {
    vi.useFakeTimers();
    let signal;
    let markStarted;
    const started = new Promise((resolve) => {
      markStarted = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(successfulTurnstileValidation()),
        )
        .mockImplementationOnce((_url, init) => {
          signal = init.signal;
          markStarted();
          return new Promise(() => {});
        }),
    );

    const pendingResponse = callContact();
    await started;
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(10000);
    const response = await pendingResponse;

    await expectContactResponse(response, 504, {
      ok: false,
      message: "Contact form submission timed out",
    });
    expect(signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  test("converts an unexpected Contact handler exception into a generic 500", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const throwingEnv = new Proxy(baseEnv, {
      get(target, property, receiver) {
        if (property === "TURNSTILE_SECRET_KEY") {
          throw new Error(stackTraceMarker);
        }

        return Reflect.get(target, property, receiver);
      },
    });

    const response = await callContact({}, throwingEnv);

    await expectContactResponse(response, 500, {
      ok: false,
      message: "Internal server error",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("keeps the existing Contact OPTIONS response unchanged", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await callContact({ method: "OPTIONS" });

    expect(response.status).toBe(204);
    expectAllowedCors(response);
    expect(response.headers.has("Content-Type")).toBe(false);
    expect(await response.text()).toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("rejects a beta Origin at the production Worker before upstream requests", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await callContact({ origin: betaOrigin });

    await expectContactResponse(
      response,
      403,
      { ok: false, message: "Forbidden" },
      { corsAllowed: false },
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test.each([
    ["production", "https://attacker.example"],
    ["production", null],
    ["beta", productionOrigin],
    ["beta", "https://attacker.pages.dev"],
    ["beta", null],
  ])(
    "rejects a disallowed %s Contact POST from %s before upstream requests",
    async (workerEnvironment, origin) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const response = await callContact(
        { origin },
        { ...baseEnv, WORKER_ENV: workerEnvironment },
      );

      await expectContactResponse(
        response,
        403,
        { ok: false, message: "Forbidden" },
        { corsAllowed: false },
      );
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});
