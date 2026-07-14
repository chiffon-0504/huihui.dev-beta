import { expect, test } from "@playwright/test";

const milestoneIds = [
  "arcaea-boss-song-ex-scores-2026-06-28",
  "arcaea-potential-12-2026-06-27",
  "arcaea-potential-11-90-2026-05-03",
  "arcaea-cyaegha-ex-plus-2026-04-19",
  "hello-world-2026-04-14",
];
const firstMilestoneImages = [
  "/images/3008_p.webp",
  "/images/3009_p.webp",
  "/images/3010_p.webp",
];
const arcaeaHashtagUrl = "https://x.com/hashtag/arcaea?src=hashtag_click";

const localeCases = [
  {
    locale: "zh",
    route: "/milestones/",
    date: "2026年6月28日",
    requiredText: [
      "初代魔王 Grievous Lady",
      "12.00 摘星達成!!!!!!",
      "11.90 到達!!!",
    ],
    forbiddenText: [],
    firstImageAlt: "Arcaea Grievous Lady EX 成績截圖",
    caption: "Arcaea 圖像與相關內容之權利屬於 © lowiro。",
  },
  {
    locale: "en",
    route: "/en/milestones/",
    date: "June 28, 2026",
    requiredText: [
      "The original boss song, Grievous Lady",
      "Reached Potential 12.00 at last!!!!!!",
      "Reached Potential 11.90!!!",
    ],
    forbiddenText: ["初代魔王", "3.0 魔王", "摘星", "從 2021 年開始玩"],
    firstImageAlt: "Arcaea Grievous Lady EX score screenshot",
    caption: "Arcaea images and properties belong to © lowiro.",
  },
  {
    locale: "ja",
    route: "/ja/milestones/",
    date: "2026年6月28日",
    requiredText: [
      "初代ボス曲 Grievous Lady",
      "ついにPotential 12.00到達!!!!!!",
      "Potential 11.90到達!!!",
    ],
    forbiddenText: ["初代魔王", "3.0 魔王", "摘星", "從 2021 年開始玩"],
    firstImageAlt: "Arcaea Grievous Lady EX スコア画面",
    caption: "Arcaeaの画像および関連コンテンツの権利は© lowiroに帰属します。",
  },
];

for (const localeCase of localeCases) {
  test(`${localeCase.locale} milestones render localized bodies, dates, and media`, async ({
    page,
  }) => {
    const response = await page.goto(localeCase.route, { waitUntil: "load" });
    const cards = page.locator("#postsList .post-card");

    expect(response?.status()).toBe(200);
    await expect(cards).toHaveCount(milestoneIds.length);
    expect(
      await cards.evaluateAll((elements) =>
        elements.map((element) => element.dataset.postId),
      ),
    ).toEqual(milestoneIds);

    const firstCard = cards.first();
    await expect(firstCard.locator("time.post-date")).toHaveAttribute(
      "datetime",
      "2026-06-28",
    );
    await expect(firstCard.locator("time.post-date")).toHaveText(localeCase.date);

    const body = page.locator("#postsList");
    for (const text of localeCase.requiredText) {
      await expect(body).toContainText(text);
    }
    for (const text of localeCase.forbiddenText) {
      await expect(body).not.toContainText(text);
    }

    const firstImages = firstCard.locator("img.zoomable");
    expect(
      await firstImages.evaluateAll((images) =>
        images.map((image) => image.getAttribute("src")),
      ),
    ).toEqual(firstMilestoneImages);
    await expect(firstImages.first()).toHaveAttribute(
      "alt",
      localeCase.firstImageAlt,
    );
    await expect(firstCard.locator("figcaption.post-caption")).toHaveText(
      localeCase.caption,
    );

    const hashtagLinks = page.locator(
      '.post-content a.hashtag[href*="x.com/hashtag/arcaea"]',
    );
    await expect(hashtagLinks).toHaveCount(4);
    for (const link of await hashtagLinks.all()) {
      await expect(link).toHaveAttribute("href", arcaeaHashtagUrl);
      await expect(link).toHaveText("#arcaea");
    }

    await firstImages.first().click();
    await expect(page.locator("#lightbox")).toHaveClass(/\bshow\b/);
    await expect(page.locator("#lightboxImg")).toHaveAttribute(
      "alt",
      localeCase.firstImageAlt,
    );
  });
}
