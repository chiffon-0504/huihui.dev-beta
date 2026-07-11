import { expect, test } from "@playwright/test";

const contactApiUrl = "https://api.huihui.dev/api/contact";

async function stubContactDependencies(
  page,
  { status = 200, body = { ok: true }, gate } = {},
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
      body: `
        window.turnstile = {
          reset() {
            window.__turnstileResetCount += 1;
          }
        };
      `,
    }),
  );
  await page.route(contactApiUrl, async (route) => {
    requestCount += 1;
    requestBodies.push(route.request().postData() || "");
    await gate;
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });

  return {
    count: () => requestCount,
    bodies: requestBodies,
  };
}

async function openContactPage(page) {
  await page.goto("/en/contact/", { waitUntil: "load" });
}

async function fillRequiredFields(page) {
  await page.locator("input[name='name']").fill("Test User");
  await page.locator("input[name='email']").fill("test@example.com");
  await page.locator("textarea[name='message']").fill("Test message");
}

async function addTurnstileToken(page) {
  await page.locator("#contact-form").evaluate((form) => {
    const token = document.createElement("input");
    token.type = "hidden";
    token.name = "cf-turnstile-response";
    token.value = "test-turnstile-token";
    form.append(token);
  });
}

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
  await addTurnstileToken(page);

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
  expect(await page.evaluate(() => window.__turnstileResetCount)).toBe(1);
});

test("keeps native validation from submitting incomplete forms", async ({
  page,
}) => {
  const api = await stubContactDependencies(page);

  await openContactPage(page);
  await page.locator("button[type='submit']").click();
  await page.waitForTimeout(50);

  expect(api.count()).toBe(0);
  await expect(page.locator("input[name='name']")).toBeFocused();
  expect(
    await page.locator("input[name='name']").evaluate((input) =>
      input.validationMessage,
    ),
  ).not.toBe("");
  await expect(page.locator("#contact-status")).toHaveText("");
});

test("shows the existing error state when the Turnstile token is missing", async ({
  page,
}) => {
  const api = await stubContactDependencies(page, {
    status: 400,
    body: { ok: false, message: "Missing Turnstile token" },
  });

  await openContactPage(page);
  await fillRequiredFields(page);
  await page.locator("button[type='submit']").click();

  await expect(page.locator("#contact-status")).toHaveText(
    "Failed to send. Please try again later.",
  );
  expect(api.count()).toBe(1);
  expect(api.bodies[0]).not.toContain("cf-turnstile-response");
  expect(await page.evaluate(() => window.__turnstileResetCount)).toBe(0);
});

test("restores the form controls after an API error", async ({ page }) => {
  const api = await stubContactDependencies(page, {
    status: 500,
    body: { ok: false, message: "Contact API failed" },
  });

  await openContactPage(page);
  await fillRequiredFields(page);
  await addTurnstileToken(page);
  await page.locator("button[type='submit']").click();

  await expect(page.locator("#contact-status")).toHaveText(
    "Failed to send. Please try again later.",
  );
  await expect(page.locator("button[type='submit']")).toBeEnabled();
  await expect(page.locator("button[type='submit']")).toHaveText(
    "Send Message",
  );
  await expect(page.locator("input[name='name']")).toHaveValue("Test User");
  expect(api.count()).toBe(1);
});

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
  await addTurnstileToken(page);
  await page.locator("#contact-form").evaluate((form) => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });

  await expect.poll(api.count).toBe(1);
  await expect(page.locator("button[type='submit']")).toBeDisabled();

  releaseRequest();

  await expect(page.locator("#contact-status")).toHaveText("Message sent.");
  expect(api.count()).toBe(1);
});
