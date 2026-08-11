import { expect, test } from "@playwright/test";

const milestoneIds = [
  "ave-mujica-exitus-taipei-day2-2026-08-09",
  "arcaea-course-mode-phase-10-clear-2026-07-31",
  "arcaea-boss-song-ex-scores-2026-06-28",
  "arcaea-potential-12-2026-06-27",
  "arcaea-potential-11-90-2026-05-03",
  "arcaea-cyaegha-ex-plus-2026-04-19",
  "hello-world-2026-04-14",
];
const phase10MilestoneImages = [
  "/images/3011_p.webp",
  "/images/3012_p.webp",
];
const exitusImageSrcset =
  "/images/3013_p-800.webp 800w, /images/3013_p-1600.webp 1600w";
const exitusImageSizes =
  "(max-width: 900px) calc(100vw - 44px - clamp(36px, 6vw, 56px)), (max-width: 1200px) min(700px, calc(100vw - 360px - clamp(36px, 6vw, 56px))), 700px";
const arcaeaHashtagUrl = "https://x.com/hashtag/arcaea?src=hashtag_click";
const exitusHashtags = [
  {
    label: "#Exitus_TAIPEI",
    href: "https://x.com/hashtag/Exitus_TAIPEI?src=hashtag_click",
  },
  {
    label: "#AveMujica",
    href: "https://x.com/hashtag/AveMujica?src=hashtag_click",
  },
];

const localeCases = [
  {
    locale: "zh",
    route: "/milestones/",
    date: "2026年8月9日",
    requiredText: [
      "謝謝！",
      "這是最棒的演唱會！",
      "Course Mode Phase 10 完成！！",
      "初代魔王 Grievous Lady",
      "12.00 摘星達成!!!!!!",
      "11.90 到達!!!",
    ],
    forbiddenText: [],
    imageAlt: "Ave Mujica LIVE TOUR 2026「Exitus」台北公演 DAY2 演唱會現場",
    phase10ImageAlt: "Arcaea Course Mode Phase 10 成績截圖",
    phase10Caption: "Arcaea 圖像與相關內容之權利屬於 © lowiro。",
  },
  {
    locale: "en",
    route: "/en/milestones/",
    date: "August 9, 2026",
    requiredText: [
      "Thank you!",
      "This was the best concert ever!",
      "Course Mode Phase 10 CLEAR!!",
      "The original boss song, Grievous Lady",
      "Reached Potential 12.00 at last!!!!!!",
      "Reached Potential 11.90!!!",
    ],
    forbiddenText: ["初代魔王", "3.0 魔王", "摘星", "從 2021 年開始玩"],
    imageAlt: 'Ave Mujica LIVE TOUR 2026 "Exitus" Taipei DAY2 concert venue',
    phase10ImageAlt: "Arcaea Course Mode Phase 10 score screenshot",
    phase10Caption: "Arcaea images and properties belong to © lowiro.",
  },
  {
    locale: "ja",
    route: "/ja/milestones/",
    date: "2026年8月9日",
    requiredText: [
      "ありがとう！",
      "最高のライブでした！",
      "Course Mode Phase 10 完走！！",
      "初代ボス曲 Grievous Lady",
      "ついにPotential 12.00到達!!!!!!",
      "Potential 11.90到達!!!",
    ],
    forbiddenText: ["初代魔王", "3.0 魔王", "摘星", "從 2021 年開始玩"],
    imageAlt: "Ave Mujica LIVE TOUR 2026「Exitus」台北公演 DAY2 ライブ会場",
    phase10ImageAlt: "Arcaea Course Mode Phase 10 スコア画面",
    phase10Caption: "Arcaeaの画像および関連コンテンツの権利は© lowiroに帰属します。",
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
      "2026-08-09",
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
    await expect(firstImages).toHaveCount(1);
    await expect(firstImages.first()).toHaveAttribute(
      "src",
      "/images/3013_p.webp",
    );
    await expect(firstImages.first()).toHaveAttribute("alt", localeCase.imageAlt);
    await expect(firstImages.first()).toHaveAttribute("width", "8064");
    await expect(firstImages.first()).toHaveAttribute("height", "6048");
    await expect(firstImages.first()).toHaveAttribute(
      "srcset",
      exitusImageSrcset,
    );
    await expect(firstImages.first()).toHaveAttribute("sizes", exitusImageSizes);
    await expect(firstImages.first()).toHaveAttribute("decoding", "async");
    await expect(firstImages.first()).toHaveAttribute(
      "data-full-src",
      "/images/3013_p.webp",
    );
    await expect(firstImages.first()).toHaveAttribute(
      "data-image-id",
      "ave-mujica-exitus-taipei-day2-venue",
    );

    for (const hashtag of exitusHashtags) {
      const link = firstCard.getByRole("link", {
        name: hashtag.label,
        exact: true,
      });

      await expect(link).toHaveCount(1);
      await expect(link).toHaveAttribute("href", hashtag.href);
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noopener noreferrer");
      await expect(link).toHaveClass(/\bhashtag\b/);
    }

    const phase10Card = cards.nth(1);
    const phase10Images = phase10Card.locator("img.zoomable");
    expect(
      await phase10Images.evaluateAll((images) =>
        images.map((image) => image.getAttribute("src")),
      ),
    ).toEqual(phase10MilestoneImages);
    await expect(phase10Images.first()).toHaveAttribute(
      "alt",
      localeCase.phase10ImageAlt,
    );
    await expect(phase10Card.locator("figcaption.post-caption")).toHaveText(
      localeCase.phase10Caption,
    );

    const hashtagLinks = page.locator(
      '.post-content a.hashtag[href*="x.com/hashtag/arcaea"]',
    );
    await expect(hashtagLinks).toHaveCount(5);
    for (const link of await hashtagLinks.all()) {
      await expect(link).toHaveAttribute("href", arcaeaHashtagUrl);
      await expect(link).toHaveText("#arcaea");
    }
    await expect(page.locator(".post-content a.hashtag")).toHaveCount(7);

    await firstImages.first().click();
    await expect(page.locator("#lightbox")).toHaveClass(/\bshow\b/);
    await expect(page.locator("#lightboxImg")).toHaveAttribute(
      "alt",
      localeCase.imageAlt,
    );
    await expect(page.locator("#lightboxImg")).toHaveAttribute(
      "src",
      /\/images\/3013_p\.webp$/,
    );
    await page.locator("#lightboxClose").click();
    await expect(page.locator("#lightbox")).not.toHaveAttribute("open", "");
  });
}
