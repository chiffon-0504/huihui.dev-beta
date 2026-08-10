import { expect, test } from "@playwright/test";

const localeCases = [
  {
    id: "zh",
    aboutRoute: "/about/",
    worksRoute: "/works/",
    rhythm: {
      favorite: "最愛",
      best: "最佳成績",
      level: "等級",
      bestScore: "最佳分數",
    },
    imageAlts: [
      "maimai DX 最愛歌曲",
      "maimai DX 最佳成績",
      "Arcaea 最愛歌曲",
      "Arcaea 最佳成績",
    ],
    copyright:
      "圖片 © 各自權利人所有（SEGA、lowiro、VISUAL ARTS/Key、YUZUSOFT、sprite、NekoNyan Ltd.、Sister Position 等）。",
    works: {
      showcase: "作品展示",
      websiteProject: "huihui.dev 專案",
      tierMakerTool: "分級表製作器工具",
    },
  },
  {
    id: "en",
    aboutRoute: "/en/about/",
    worksRoute: "/en/works/",
    rhythm: {
      favorite: "Favorite",
      best: "Best",
      level: "Level",
      bestScore: "Best Score",
    },
    imageAlts: [
      "Favorite maimai DX song",
      "Best maimai DX record",
      "Favorite Arcaea song",
      "Best Arcaea record",
    ],
    copyright:
      "Images © respective owners (SEGA, lowiro, VISUAL ARTS/Key, YUZUSOFT, sprite, NekoNyan Ltd., Sister Position, etc.)",
    works: {
      showcase: "Works showcase",
      websiteProject: "huihui.dev project",
      tierMakerTool: "Tier Maker tool",
    },
  },
  {
    id: "ja",
    aboutRoute: "/ja/about/",
    worksRoute: "/ja/works/",
    rhythm: {
      favorite: "お気に入り",
      best: "ベスト",
      level: "レベル",
      bestScore: "ベストスコア",
    },
    imageAlts: [
      "お気に入りのmaimai DX楽曲",
      "maimai DXのベスト記録",
      "お気に入りのArcaea楽曲",
      "Arcaeaのベスト記録",
    ],
    copyright:
      "画像 © 各権利者（SEGA、lowiro、VISUAL ARTS/Key、YUZUSOFT、sprite、NekoNyan Ltd.、Sister Position など）",
    works: {
      showcase: "作品紹介",
      websiteProject: "huihui.dev プロジェクト",
      tierMakerTool: "Tier Maker ツール",
    },
  },
];

const secondaryImageSources = [
  "/images/1002_amf.webp",
  "/images/1003_amb.webp",
  "/images/1005_aaf.webp",
  "/images/1006_aab.webp",
];

async function stubExternalDependencies(page) {
  await page.route("https://api.huihui.dev/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, games: [] }),
    }),
  );
}

async function expectValidI18nMarkup(page, localeId) {
  const diagnostics = await page.evaluate((activeLocale) => {
    const attributes = [
      "data-i18n",
      "data-i18n-alt",
      "data-i18n-title",
      "data-i18n-aria-label",
      "data-i18n-placeholder",
    ];
    const messages = window.HUIHUI_I18N?.[activeLocale];
    const brokenReferences = [];

    for (const element of document.querySelectorAll(
      attributes.map((attribute) => `[${attribute}]`).join(","),
    )) {
      for (const attribute of attributes) {
        const key = element.getAttribute(attribute);
        if (!key) continue;

        const value = key
          .split(".")
          .reduce((current, part) => current?.[part], messages);
        if (typeof value !== "string") brokenReferences.push(`${attribute}:${key}`);
      }
    }

    const ids = [...document.querySelectorAll("[id]")].map((element) => element.id);
    const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
    return { brokenReferences, duplicateIds: [...new Set(duplicateIds)] };
  }, localeId);

  expect(diagnostics).toEqual({ brokenReferences: [], duplicateIds: [] });
}

for (const locale of localeCases) {
  test(`${locale.id} localizes the audited About and Works copy`, async ({
    page,
  }) => {
    await stubExternalDependencies(page);

    const aboutResponse = await page.goto(locale.aboutRoute, {
      waitUntil: "load",
    });
    expect(aboutResponse?.status()).toBe(200);

    await expect(page.locator(".rhythm-record-text h4")).toHaveText([
      locale.rhythm.favorite,
      locale.rhythm.best,
      locale.rhythm.favorite,
      locale.rhythm.best,
    ]);
    await expect(
      page.locator('[data-i18n="about.rhythm.level"]'),
    ).toHaveText(locale.rhythm.level);
    await expect(
      page.locator('[data-i18n="about.rhythm.bestScore"]'),
    ).toHaveText(locale.rhythm.bestScore);

    for (const [index, src] of secondaryImageSources.entries()) {
      await expect(page.locator(`img[src="${src}"]`)).toHaveAttribute(
        "alt",
        locale.imageAlts[index],
      );
    }

    await expect(page.locator(".interest-note")).toHaveText(locale.copyright);
    await expectValidI18nMarkup(page, locale.id);

    const worksResponse = await page.goto(locale.worksRoute, {
      waitUntil: "load",
    });
    expect(worksResponse?.status()).toBe(200);

    const showcase = page.locator(".works-showcase-grid");
    const websiteProject = page.locator(".showcase-project-card").first();
    const tierMakerTool = page.locator(".showcase-tier-card");
    await expect(showcase).toHaveAccessibleName(locale.works.showcase);
    await expect(websiteProject).toHaveAccessibleName(
      locale.works.websiteProject,
    );
    await expect(tierMakerTool).toHaveAccessibleName(locale.works.tierMakerTool);

    if (locale.id !== "en") {
      await expect(showcase).not.toHaveAccessibleName("Works showcase");
      await expect(websiteProject).not.toHaveAccessibleName(
        "huihui.dev project",
      );
      await expect(tierMakerTool).not.toHaveAccessibleName("Tier Maker tool");
    }

    await expectValidI18nMarkup(page, locale.id);
  });
}
