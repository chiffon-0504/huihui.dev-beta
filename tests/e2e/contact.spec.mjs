import { expect, test } from "@playwright/test";

const contactApiUrl = "https://api.huihui.dev/api/contact";

async function stubContactDependencies(
  page,
  {
    status = 200,
    body = { ok: true },
    gate,
    rawBody,
    networkError = false,
    outcomes,
    turnstileAvailable = true,
  } = {},
) {
  let requestCount = 0;
  const requestBodies = [];

  await page.addInitScript(() => {
    window.__turnstileResetCount = 0;
  });
  await page.route("https://challenges.cloudflare.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: turnstileAvailable
        ? `
          window.turnstile = {
            reset() {
              window.__turnstileResetCount += 1;
            }
          };
        `
        : "",
    }),
  );
  await page.route(contactApiUrl, async (route) => {
    const outcome = outcomes?.[requestCount] ?? {
      status,
      body,
      gate,
      rawBody,
      networkError,
    };
    requestCount += 1;
    requestBodies.push(route.request().postData() || "");
    await outcome.gate;

    if (outcome.networkError) {
      await route.abort("failed");
      return;
    }

    await route.fulfill({
      status: outcome.status ?? status,
      contentType: "application/json",
      body: outcome.rawBody ?? JSON.stringify(outcome.body ?? body),
    });
  });

  return {
    count: () => requestCount,
    bodies: requestBodies,
  };
}

async function openContactPage(page, route = "/en/contact/") {
  await page.goto(route, { waitUntil: "load" });
}

async function fillRequiredFields(page) {
  await page.locator("input[name='name']").fill("Test User");
  await page.locator("input[name='email']").fill("test@example.com");
  await page.locator("input[name='subject']").fill("Test subject");
  await page.locator("textarea[name='message']").fill("Test message");
}

async function setTurnstileToken(page, value = "test-turnstile-token") {
  await page.locator("#contact-form").evaluate((form, tokenValue) => {
    let token = form.querySelector("[name='cf-turnstile-response']");

    if (!token) {
      token = document.createElement("input");
      token.type = "hidden";
      token.name = "cf-turnstile-response";
      form.append(token);
    }

    token.value = tokenValue;
  }, value);
}

async function getTurnstileState(page) {
  return page.locator("#contact-form").evaluate((form) => ({
    resetCount: window.__turnstileResetCount,
    responseValues: Array.from(
      form.querySelectorAll("[name='cf-turnstile-response']"),
      (field) => field.value,
    ),
    widgetCount: form.querySelectorAll(".cf-turnstile").length,
  }));
}

const contactLayoutCases = [
  { locale: "zh", route: "/contact/", viewport: { width: 1440, height: 900 } },
  { locale: "en", route: "/en/contact/", viewport: { width: 390, height: 844 } },
  { locale: "ja", route: "/ja/contact/", viewport: { width: 768, height: 1024 } },
];

for (const { locale, route, viewport } of contactLayoutCases) {
  test(`${locale} Contact content keeps shared width and stacking ownership`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await stubContactDependencies(page);
    await openContactPage(page, route);

    const layout = await page.locator(".contact-content").evaluate((content) => {
      const parent = content.closest(".contact-page");
      const style = getComputedStyle(content);

      return {
        contentWidth: content.getBoundingClientRect().width,
        parentWidth: parent?.getBoundingClientRect().width ?? 0,
        maxWidth: style.maxWidth,
        position: style.position,
        zIndex: style.zIndex,
      };
    });

    expect(layout.contentWidth).toBeGreaterThan(0);
    expect(Math.abs(layout.contentWidth - layout.parentWidth)).toBeLessThan(0.1);
    expect(layout).toMatchObject({
      maxWidth: "100%",
      position: "relative",
      zIndex: "1",
    });
  });
}

const contactFieldCases = [
  {
    locale: "zh",
    route: "/contact/",
    label: "主旨",
    placeholder: "你的主旨",
  },
  {
    locale: "en",
    route: "/en/contact/",
    label: "Subject",
    placeholder: "Your subject",
  },
  {
    locale: "ja",
    route: "/ja/contact/",
    label: "件名",
    placeholder: "件名を入力",
  },
];

for (const { locale, route, label, placeholder } of contactFieldCases) {
  test(`${locale} Contact has a localized Subject field before Message without the old intro`, async ({ page }) => {
    await stubContactDependencies(page);
    await openContactPage(page, route);

    await expect(page.locator(".contact-intro")).toHaveCount(0);
    await expect(page.locator("input[name='subject']")).toHaveCount(1);
    await expect(page.getByLabel(label)).toHaveAttribute("name", "subject");
    await expect(page.locator("input[name='subject']")).toHaveAttribute("required", "");
    await expect(page.locator("input[name='subject']")).toHaveAttribute(
      "placeholder",
      placeholder,
    );
    const subjectPrecedesMessage = await page.locator("input[name='subject']").evaluate((field) =>
      Boolean(
        field.compareDocumentPosition(document.querySelector("textarea[name='message']"))
        & Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    );
    expect(subjectPrecedesMessage).toBe(true);
  });
}

test("localized email links open Gmail Compose in a new tab", async ({
  context,
  page,
}) => {
  await context.route("https://mail.google.com/mail/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><title>Gmail Compose</title>",
    }),
  );
  await stubContactDependencies(page);

  for (const { route } of contactLayoutCases) {
    await openContactPage(page, route);

    const emailLink = page.getByRole("link", { name: "contact@huihui.dev" });
    await expect(emailLink).toHaveAttribute("target", "_blank");
    await expect(emailLink).toHaveAttribute("rel", "noopener noreferrer");

    const popupPromise = page.waitForEvent("popup");
    await emailLink.click();
    const popup = await popupPromise;
    await popup.waitForLoadState("domcontentloaded");

    const composeUrl = new URL(popup.url());
    expect(composeUrl.origin).toBe("https://mail.google.com");
    expect(composeUrl.pathname).toBe("/mail/");
    expect(composeUrl.searchParams.get("view")).toBe("cm");
    expect(composeUrl.searchParams.get("fs")).toBe("1");
    expect(composeUrl.searchParams.get("to")).toBe("contact@huihui.dev");

    await popup.close();
  }
});

test("submits successfully and preserves loading and Turnstile behavior", async ({
  page,
}) => {
  let releaseRequest;
  const gate = new Promise((resolve) => {
    releaseRequest = resolve;
  });
  const api = await stubContactDependencies(page, { gate });

  await openContactPage(page);
  await fillRequiredFields(page);
  await setTurnstileToken(page);

  const button = page.locator("button[type='submit']");
  await button.click();

  await expect(button).toBeDisabled();
  await expect(button).toHaveText("Sending...");
  await expect.poll(api.count).toBe(1);

  releaseRequest();

  await expect(page.locator("#contact-status")).toHaveText("Message sent.");
  await expect(button).toBeEnabled();
  await expect(button).toHaveText("Send Message");
  await expect(page.locator("input[name='name']")).toHaveValue("");
  await expect(page.locator("input[name='email']")).toHaveValue("");
  await expect(page.locator("input[name='subject']")).toHaveValue("");
  await expect(page.locator("textarea[name='message']")).toHaveValue("");
  expect(api.bodies[0]).toContain('name="subject"');
  expect(api.bodies[0]).toContain("Test subject");
  expect(await getTurnstileState(page)).toEqual({
    resetCount: 1,
    responseValues: [""],
    widgetCount: 1,
  });
});

test("keeps native validation from submitting incomplete forms", async ({
  page,
}) => {
  const api = await stubContactDependencies(page);

  await openContactPage(page);
  await page.locator("button[type='submit']").click();

  expect(api.count()).toBe(0);
  await expect(page.locator("input[name='name']")).toBeFocused();
  expect(
    await page.locator("input[name='name']").evaluate((input) =>
      input.validationMessage,
    ),
  ).not.toBe("");
  await expect(page.locator("#contact-status")).toHaveText("");
  await expect(page.locator("button[type='submit']")).toBeEnabled();
  expect(await getTurnstileState(page)).toEqual({
    resetCount: 0,
    responseValues: [],
    widgetCount: 1,
  });
});

test("shows the existing error state when the Turnstile token is missing", async ({
  page,
}) => {
  const api = await stubContactDependencies(page);

  await openContactPage(page);
  await fillRequiredFields(page);
  await page.locator("button[type='submit']").click();

  await expect(page.locator("#contact-status")).toHaveText(
    "Failed to send. Please try again later.",
  );
  expect(api.count()).toBe(0);
  expect(api.bodies).toEqual([]);
  await expect(page.locator("button[type='submit']")).toBeEnabled();
  await expect(page.locator("button[type='submit']")).toHaveText("Send Message");
  await expect(page.locator("input[name='name']")).toHaveValue("Test User");
  await expect(page.locator("input[name='email']")).toHaveValue("test@example.com");
  await expect(page.locator("textarea[name='message']")).toHaveValue("Test message");
  expect(await getTurnstileState(page)).toEqual({
    resetCount: 0,
    responseValues: [],
    widgetCount: 1,
  });
});

const httpFailureCases = [
  { status: 400, message: "Missing required fields" },
  { status: 403, message: "Turnstile verification failed" },
  { status: 500, message: "Contact service unavailable" },
  { status: 502, message: "Failed to forward contact form" },
  { status: 504, message: "Contact form submission timed out" },
];

for (const { status, message } of httpFailureCases) {
  test(`HTTP ${status} failure resets Turnstile exactly once`, async ({ page }) => {
    const api = await stubContactDependencies(page, {
      status,
      body: { ok: false, message },
    });

    await openContactPage(page);
    await fillRequiredFields(page);
    await setTurnstileToken(page);
    await page.locator("button[type='submit']").click();

    await expect(page.locator("#contact-status")).toHaveText(
      "Failed to send. Please try again later.",
    );
    await expect(page.locator("button[type='submit']")).toBeEnabled();
    await expect(page.locator("button[type='submit']")).toHaveText(
      "Send Message",
    );
    await expect(page.locator("input[name='name']")).toHaveValue("Test User");
    await expect(page.locator("input[name='email']")).toHaveValue("test@example.com");
    await expect(page.locator("textarea[name='message']")).toHaveValue("Test message");
    expect(api.count()).toBe(1);
    expect(await getTurnstileState(page)).toEqual({
      resetCount: 1,
      responseValues: [""],
      widgetCount: 1,
    });
  });
}

test("prevents duplicate submissions while a request is pending", async ({
  page,
}) => {
  let releaseRequest;
  const gate = new Promise((resolve) => {
    releaseRequest = resolve;
  });
  const api = await stubContactDependencies(page, { gate });

  await openContactPage(page);
  await fillRequiredFields(page);
  await setTurnstileToken(page);
  await page.locator("#contact-form").evaluate((form) => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });

  await expect.poll(api.count).toBe(1);
  await expect(page.locator("button[type='submit']")).toBeDisabled();
  expect(await getTurnstileState(page)).toEqual({
    resetCount: 0,
    responseValues: ["test-turnstile-token"],
    widgetCount: 1,
  });

  releaseRequest();

  await expect(page.locator("#contact-status")).toHaveText("Message sent.");
  expect(api.count()).toBe(1);
  await expect(page.locator("button[type='submit']")).toBeEnabled();
  await expect(page.locator("button[type='submit']")).toHaveText("Send Message");
  expect(await getTurnstileState(page)).toEqual({
    resetCount: 1,
    responseValues: [""],
    widgetCount: 1,
  });
});

test("network rejection resets Turnstile exactly once", async ({ page }) => {
  const api = await stubContactDependencies(page, { networkError: true });

  await openContactPage(page);
  await fillRequiredFields(page);
  await setTurnstileToken(page);
  const button = page.locator("button[type='submit']");
  await button.click();

  await expect(page.locator("#contact-status")).toHaveText(
    "Failed to send. Please try again later.",
  );
  await expect(button).toBeEnabled();
  await expect(button).toHaveText("Send Message");
  await expect(page.locator("input[name='name']")).toHaveValue("Test User");
  await expect(page.locator("input[name='email']")).toHaveValue("test@example.com");
  await expect(page.locator("textarea[name='message']")).toHaveValue("Test message");
  expect(api.count()).toBe(1);
  expect(await getTurnstileState(page)).toEqual({
    resetCount: 1,
    responseValues: [""],
    widgetCount: 1,
  });
});

test("malformed JSON response resets Turnstile exactly once", async ({ page }) => {
  const api = await stubContactDependencies(page, {
    rawBody: "{not-valid-json",
  });

  await openContactPage(page);
  await fillRequiredFields(page);
  await setTurnstileToken(page);
  const button = page.locator("button[type='submit']");
  await button.click();

  await expect(page.locator("#contact-status")).toHaveText(
    "Failed to send. Please try again later.",
  );
  await expect(button).toBeEnabled();
  await expect(button).toHaveText("Send Message");
  await expect(page.locator("input[name='name']")).toHaveValue("Test User");
  expect(api.count()).toBe(1);
  expect(await getTurnstileState(page)).toEqual({
    resetCount: 1,
    responseValues: [""],
    widgetCount: 1,
  });
});

test("missing window.turnstile does not throw or block restoration", async ({ page }) => {
  const api = await stubContactDependencies(page, {
    turnstileAvailable: false,
  });

  await openContactPage(page);
  await fillRequiredFields(page);
  await setTurnstileToken(page);
  const button = page.locator("button[type='submit']");
  await button.click();

  await expect(page.locator("#contact-status")).toHaveText("Message sent.");
  await expect(button).toBeEnabled();
  await expect(button).toHaveText("Send Message");
  await expect(page.locator("input[name='name']")).toHaveValue("");
  expect(api.count()).toBe(1);
  expect(await getTurnstileState(page)).toEqual({
    resetCount: 0,
    responseValues: [""],
    widgetCount: 1,
  });
});

function createGate() {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });

  return { promise, release };
}

const contactLocaleCases = [
  {
    locale: "zh",
    route: "/contact/",
    submit: "\u9001\u51fa\u8a0a\u606f",
    submitting: "\u9001\u51fa\u4e2d...",
    success: "\u8a0a\u606f\u5df2\u9001\u51fa\u3002",
    error: "\u9001\u51fa\u5931\u6557\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66\u3002",
  },
  {
    locale: "en",
    route: "/en/contact/",
    submit: "Send Message",
    submitting: "Sending...",
    success: "Message sent.",
    error: "Failed to send. Please try again later.",
  },
  {
    locale: "ja",
    route: "/ja/contact/",
    submit: "\u9001\u4fe1\u3059\u308b",
    submitting: "\u9001\u4fe1\u4e2d...",
    success: "\u9001\u4fe1\u3055\u308c\u307e\u3057\u305f\u3002",
    error: "\u9001\u4fe1\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002\u5f8c\u3067\u3082\u3046\u4e00\u5ea6\u304a\u8a66\u3057\u304f\u3060\u3055\u3044\u3002",
  },
];

const contactViewports = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
];

for (const localeCase of contactLocaleCases) {
  test(`${localeCase.locale} Contact timeout aborts the browser request and restores the form`, async ({ page }) => {
    const gate = createGate();
    await page.clock.install();
    const api = await stubContactDependencies(page, { gate: gate.promise });
    await openContactPage(page, localeCase.route);
    await fillRequiredFields(page);
    await setTurnstileToken(page);
    await page.evaluate(() => {
      const nativeFetch = window.fetch.bind(window);
      window.fetch = (url, options) => {
        window.__contactSignal = options.signal;
        return nativeFetch(url, options);
      };
    });

    try {
      const button = page.locator("button[type='submit']");
      await button.click();
      await expect.poll(api.count).toBe(1);
      await expect(button).toBeDisabled();
      await expect(button).toHaveText(localeCase.submitting);
      expect(await page.evaluate(() => window.__contactSignal instanceof AbortSignal)).toBe(true);
      await page.locator("#contact-form").evaluate((form) => {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      expect(api.count()).toBe(1);

      const aborted = page.waitForEvent("requestfailed", (request) => request.url() === contactApiUrl);
      const timeoutMs = await page.evaluate(() => CONTACT_SUBMISSION_TIMEOUT_MS);
      await page.clock.fastForward(timeoutMs);
      await aborted;

      expect(await page.evaluate(() => window.__contactSignal.aborted)).toBe(true);
      await expect(page.locator("#contact-status")).toHaveText(localeCase.error);
      await expect(button).toBeEnabled();
      await expect(button).toHaveText(localeCase.submit);
      await expect(page.locator("input[name='name']")).toHaveValue("Test User");
      await expect(page.locator("input[name='email']")).toHaveValue("test@example.com");
      await expect(page.locator("textarea[name='message']")).toHaveValue("Test message");
      expect(await getTurnstileState(page)).toEqual({
        resetCount: 1,
        responseValues: [""],
        widgetCount: 1,
      });
      expect(api.count()).toBe(1);
    } finally {
      gate.release();
      await page.unrouteAll({ behavior: "wait" });
    }
  });
}

for (const localeCase of contactLocaleCases) {
  for (const viewport of contactViewports) {
    test(`${localeCase.locale} Contact lifecycle at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      const httpGate = createGate();
      const networkGate = createGate();
      const successGate = createGate();
      const api = await stubContactDependencies(page, {
        outcomes: [
          {
            status: 500,
            body: { ok: false, message: "Contact service unavailable" },
            gate: httpGate.promise,
          },
          { networkError: true, gate: networkGate.promise },
          { status: 200, body: { ok: true }, gate: successGate.promise },
        ],
      });

      await page.setViewportSize(viewport);
      await openContactPage(page, localeCase.route);
      await fillRequiredFields(page);
      await setTurnstileToken(page, "http-failure-token");

      const button = page.locator("button[type='submit']");
      const name = page.locator("input[name='name']");
      const email = page.locator("input[name='email']");
      const message = page.locator("textarea[name='message']");
      const status = page.locator("#contact-status");

      await button.click();
      await expect.poll(api.count).toBe(1);
      await expect(button).toBeDisabled();
      await expect(button).toHaveText(localeCase.submitting);

      httpGate.release();

      await expect(status).toHaveText(localeCase.error);
      await expect(button).toBeEnabled();
      await expect(button).toHaveText(localeCase.submit);
      await expect(name).toHaveValue("Test User");
      await expect(email).toHaveValue("test@example.com");
      await expect(message).toHaveValue("Test message");
      expect(await getTurnstileState(page)).toEqual({
        resetCount: 1,
        responseValues: [""],
        widgetCount: 1,
      });

      await button.click();

      await expect(status).toHaveText(localeCase.error);
      expect(api.count()).toBe(1);
      expect(await getTurnstileState(page)).toEqual({
        resetCount: 1,
        responseValues: [""],
        widgetCount: 1,
      });

      await setTurnstileToken(page, "network-failure-token");
      await button.click();
      await expect.poll(api.count).toBe(2);
      await expect(button).toBeDisabled();
      await expect(button).toHaveText(localeCase.submitting);

      networkGate.release();

      await expect.poll(async () => (await getTurnstileState(page)).resetCount).toBe(2);
      await expect(status).toHaveText(localeCase.error);
      await expect(button).toBeEnabled();
      await expect(button).toHaveText(localeCase.submit);
      await expect(name).toHaveValue("Test User");
      await expect(email).toHaveValue("test@example.com");
      await expect(message).toHaveValue("Test message");
      expect(await getTurnstileState(page)).toEqual({
        resetCount: 2,
        responseValues: [""],
        widgetCount: 1,
      });

      await setTurnstileToken(page, "success-token");
      await button.click();
      await expect.poll(api.count).toBe(3);
      await expect(button).toBeDisabled();
      await expect(button).toHaveText(localeCase.submitting);

      successGate.release();

      await expect(status).toHaveText(localeCase.success);
      await expect(button).toBeEnabled();
      await expect(button).toHaveText(localeCase.submit);
      await expect(name).toHaveValue("");
      await expect(email).toHaveValue("");
      await expect(message).toHaveValue("");
      expect(api.count()).toBe(3);
      expect(await getTurnstileState(page)).toEqual({
        resetCount: 3,
        responseValues: [""],
        widgetCount: 1,
      });
    });
  }
}
