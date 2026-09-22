import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test.describe(`Private Jev ${viewport.width}`, () => {
    test.use({ viewport });
    test.beforeEach(async ({ page, baseURL }) => {
      // Synthetic UI fixture only. Live Access verification is a separate rollout gate.
      await page.route("**/*", route => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
      await page.goto("/tools/jev/");
      await page.getByLabel("語言", { exact: true }).selectOption("en");
    });
    test("edits modes and stable choices, renders probabilities and keeps the layout bounded", async ({ page }, testInfo) => {
      const requests: unknown[] = [];
      await page.route("**/api/jev", async route => {
        const form = route.request().postDataJSON(); requests.push(form);
        expect(route.request().method()).toBe("POST");
        const result = form.mode === "noul" ? { mode: "noul", probability: 0.73 }
          : form.mode === "score" ? { mode: "score", score: 0.25, confidence: 0.5, distribution: [{ id: "0", probability: 0.75 }, { id: "1", probability: 0.25 }] }
            : { mode: "choice", choice: form.options[1].id, confidence: 0.5, distribution: form.options.map((item: { id: string }, i: number) => ({ id: item.id, probability: i === 1 ? 0.75 : 0.25 })) };
        await route.fulfill({ json: { ok: true, result } });
      });
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Personal Jev Console");
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
      await page.getByLabel("Question", { exact: true }).fill("Should I choose soup?");
      await page.getByRole("button", { name: "Add context", exact: true }).click();
      await page.getByLabel("Context 1", { exact: true }).fill("Budget: 150");
      await page.getByRole("button", { name: "Add context", exact: true }).click();
      await page.getByRole("button", { name: "Remove Context 2", exact: true }).click();
      await page.getByRole("button", { name: "Ask Jev", exact: true }).click();
      await expect(page.getByRole("status")).toHaveText("Result updated.");
      await expect(page.getByRole("progressbar", { name: "True · Yes: 73%" })).toHaveAttribute("value", "0.73");
      await page.getByRole("radio", { name: "Score", exact: true }).check();
      await expect(page.getByLabel("Question", { exact: true })).toHaveValue("Should I choose soup?");
      await page.getByLabel("Scoring criteria 0", { exact: true }).fill("Low risk");
      await page.getByLabel("Scoring criteria 1", { exact: true }).fill("High risk");
      await page.getByRole("button", { name: "Add criterion", exact: true }).click();
      await page.getByRole("button", { name: "Remove Scoring criteria 2", exact: true }).click();
      await page.getByRole("button", { name: "Ask Jev", exact: true }).click();
      await expect(page.locator(".jev-score")).toHaveText("Score: 0.25");
      await expect(page.locator(".jev-result-body")).toContainText("0 · Low risk — 1 · High risk");
      await page.getByRole("radio", { name: "Choice", exact: true }).check();
      await page.getByLabel("Options 1", { exact: true }).fill("Soup");
      await page.getByLabel("Options 2", { exact: true }).fill("Rice");
      await page.getByRole("button", { name: "Add option", exact: true }).click();
      await page.getByLabel("Options 3", { exact: true }).fill("Noodles");
      const stableId = await page.getByLabel("Options 3", { exact: true }).getAttribute("id");
      await page.getByRole("button", { name: "Remove Options 2", exact: true }).click();
      await expect(page.getByLabel("Options 2", { exact: true })).toHaveAttribute("id", stableId!);
      await page.getByRole("button", { name: "Ask Jev", exact: true }).click();
      await expect(page.locator(".jev-probability").filter({ hasText: "Noodles" })).toContainText("Highest probability");
      expect(requests).toHaveLength(3);
      expect(requests[0]).toEqual({ mode: "noul", question: "Should I choose soup?", context: ["Budget: 150"] });
      await expect(page).toHaveURL(/\/tools\/jev\/$/);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      for (const control of await page.locator("button, select, .jev-mode span").all()) {
        const box = await control.boundingBox(); if (box) expect(box.height).toBeGreaterThanOrEqual(44);
      }
      await page.screenshot({ path: testInfo.outputPath(`jev-${viewport.width}.png`), fullPage: true });
    });
    test("prevents duplicate spending, retains inputs after errors, and supports explicit retry", async ({ page }) => {
      const release = Promise.withResolvers<void>(); let calls = 0;
      await page.route("**/api/jev", async route => { calls++; await release.promise; await route.fulfill({ status: 429, json: { ok: false, error: "rate_limited" } }); });
      await page.getByLabel("Question", { exact: true }).fill("A synthetic decision");
      await page.getByRole("button", { name: "Ask Jev", exact: true }).click();
      await expect(page.getByRole("status")).toHaveText("Jev is considering…");
      await expect(page.getByRole("button", { name: "Ask Jev", exact: true })).toBeDisabled();
      await expect(page.getByRole("radio", { name: "Choice", exact: true })).toBeDisabled();
      await page.locator("form").evaluate(form => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
      expect(calls).toBe(1); release.resolve();
      await expect(page.getByRole("status")).toContainText("wait a minute");
      await expect(page.getByLabel("Question", { exact: true })).toHaveValue("A synthetic decision");
      await expect(page.getByRole("button", { name: "Ask Jev", exact: true })).toBeEnabled();
      await page.unroute("**/api/jev");
      await page.route("**/api/jev", route => route.fulfill({ json: { ok: true, result: { mode: "noul", probability: 0.5 } } }));
      await page.getByRole("button", { name: "Ask Jev", exact: true }).click();
      await expect(page.getByRole("status")).toHaveText("Result updated.");
    });
    test("native keyboard mode controls and long text reflow", async ({ page }) => {
      const noul = page.getByRole("radio", { name: "Noul", exact: true }); await noul.focus();
      await page.keyboard.press("ArrowRight");
      await expect(page.getByRole("radio", { name: "Score", exact: true })).toBeChecked();
      await expect(page.getByRole("radio", { name: "Score", exact: true })).toBeFocused();
      await page.keyboard.press("Tab"); await expect(page.getByLabel("Question", { exact: true })).toBeFocused();
      await page.getByLabel("Question", { exact: true }).fill("x".repeat(1000));
      await page.getByRole("button", { name: "Add criterion", exact: true }).focus();
      expect(await page.getByRole("button", { name: "Add criterion", exact: true }).evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe("none");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.getByLabel("Language", { exact: true }).selectOption("ja");
      await expect(page.locator("html")).toHaveAttribute("lang", "ja");
      await expect(page.getByLabel("質問", { exact: true })).toHaveValue("x".repeat(1000));
    });
  });
}

test("does not add a public entry point", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('a[href*="/tools/jev"]')).toHaveCount(0);
});
