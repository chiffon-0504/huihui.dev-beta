import { expect, test } from "@playwright/test";

async function stubHomeDependencies(
  page,
  { techNews = [], techNewsStatus = 200, techNewsGate } = {},
) {
  await page.route("https://cdn.jsdelivr.net/**", async (route) => {
    const isStyle = route.request().resourceType() === "stylesheet";
    await route.fulfill({
      status: 200,
      contentType: isStyle ? "text/css" : "application/javascript",
      body: "",
    });
  });

  await page.route("https://challenges.cloudflare.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: "",
    }),
  );

  await page.route(
    "https://api.huihui.dev/**",
    async (route) => {
      const pathname = new URL(route.request().url()).pathname;

      if (pathname === "/api/tech-news") {
        await techNewsGate;
        await route.fulfill({
          status: techNewsStatus,
          contentType: "application/json",
          body: JSON.stringify({ ok: techNewsStatus === 200, techNews }),
        });
        return;
      }

      const body = pathname === "/api/github-updates"
        ? { ok: true, updatedText: "", link: "/" }
        : { ok: true };

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    },
  );
}

test("renders hostile feed values as text and only links HTTPS cards", async ({
  page,
}) => {
  const hostileTitle =
    '</h3><img src=x onerror="window.__techNewsPayloadRan=true">';
  const htmlTitle =
    "<script>window.__techNewsPayloadRan=true</script>";
  const validUrl = "https://example.test/articles/secure?from=rss#section";

  await page.addInitScript(() => {
    window.__techNewsPayloadRan = false;
  });
  await stubHomeDependencies(page, {
    techNews: [
      {
        category: "AI",
        title: hostileTitle,
        source: "Hostile RSS",
        timeAgo: "1 min ago",
        tag: "Security",
        link: "javascript:alert(1)",
      },
      {
        category: "Web",
        title: htmlTitle,
        source: "Malformed RSS",
        timeAgo: "",
        tag: "HTML",
        link: "://not a valid URL",
      },
      {
        category: "Platform",
        title: "Valid HTTPS article",
        source: "Safe RSS",
        timeAgo: "2 mins ago",
        tag: "HTTPS",
        link: validUrl,
      },
    ],
  });

  await page.goto("/", { waitUntil: "load" });

  const cards = page.locator("#techNewsCards > .tech-news-card");
  await expect(cards).toHaveCount(3);
  expect(await cards.nth(0).locator("h3").textContent()).toBe(hostileTitle);
  expect(await cards.nth(1).locator("h3").textContent()).toBe(htmlTitle);
  await expect(page.locator("#techNewsCards img, #techNewsCards script")).toHaveCount(0);
  expect(await page.evaluate(() => window.__techNewsPayloadRan)).toBe(false);

  expect(await cards.nth(0).getAttribute("href")).toBeNull();
  expect(await cards.nth(1).getAttribute("href")).toBeNull();
  await expect(cards.nth(2)).toHaveAttribute("href", validUrl);
  await expect(cards.nth(2)).toHaveAttribute("target", "_blank");
  await expect(cards.nth(2)).toHaveAttribute("rel", "noopener noreferrer");

  expect(
    await cards.nth(0).locator(":scope > *").evaluateAll((elements) =>
      elements.map((element) => ({
        tag: element.tagName,
        className: element.className,
      })),
    ),
  ).toEqual([
    { tag: "DIV", className: "tech-news-category" },
    { tag: "H3", className: "" },
    { tag: "P", className: "" },
    { tag: "SPAN", className: "tech-news-tag" },
  ]);
  await expect(cards.nth(0).locator("p")).toHaveText(
    "最新來源：Hostile RSS · 1 min ago",
  );
});

test("preserves the loading and request-failure states", async ({ page }) => {
  let releaseTechNews;
  const techNewsGate = new Promise((resolve) => {
    releaseTechNews = resolve;
  });

  await stubHomeDependencies(page, { techNewsStatus: 500, techNewsGate });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("#techNewsCards .tech-news-loading")).toHaveText(
    "正在載入最新消息...",
  );

  releaseTechNews();
  await expect(page.locator("#techNewsCards .tech-news-error")).toHaveText(
    "Failed to load tech updates.",
  );
  await expect(page.locator("#techNewsCards > *")).toHaveCount(1);
});
