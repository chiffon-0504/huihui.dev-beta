import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, test } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const locales = ["zh", "en", "ja"];
const exitusImageSrcset =
  "/images/3013_p-800.webp 800w, /images/3013_p-1600.webp 1600w";
const exitusImageSizes =
  "(max-width: 900px) calc(100vw - 44px - clamp(36px, 6vw, 56px)), (max-width: 1200px) min(700px, calc(100vw - 360px - clamp(36px, 6vw, 56px))), 700px";
const c2SingleImageSizes =
  "(max-width: 900px) calc(100vw - 43px - clamp(36px, 6vw, 56px)), (max-width: 1200px) min(700px, calc(100vw - 359px - clamp(36px, 6vw, 56px))), 700px";
const c2MultiImageSizes =
  "(max-width: 900px) calc(100vw - 41px - clamp(36px, 6vw, 56px)), (max-width: 1200px) min(600px, calc(100vw - 357px - clamp(36px, 6vw, 56px))), 600px";
const c2Basenames = new Set([
  "3002",
  "3006",
  "3007",
  "3008",
  "3009",
  "3010",
  "3011",
  "3012",
]);

function c2ResponsiveFields(basename, sizes) {
  return {
    srcset: `/images/${basename}_p-800.webp 800w, /images/${basename}_p-1800.webp 1800w, /images/${basename}_p.webp 2560w`,
    sizes,
    fullSrc: `/images/${basename}_p.webp`,
    decoding: "async",
  };
}

async function createMilestoneContext(pathname = "/milestones/") {
  const container = { innerHTML: "" };
  const context = {
    document: {
      addEventListener() {},
      getElementById(id) {
        return id === "postsList" ? container : null;
      },
    },
    window: {
      location: { pathname },
    },
  };

  vm.createContext(context);

  for (const relativePath of ["js/posts-data.js", "js/posts-render.js"]) {
    const source = await readFile(path.join(root, relativePath), "utf8");
    vm.runInContext(source, context, { filename: relativePath });
  }

  return { context, container };
}

function readJsonExpression(context, expression) {
  return JSON.parse(vm.runInContext(`JSON.stringify(${expression})`, context));
}

function readWebpDimensions(buffer) {
  if (
    buffer.length < 20 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WEBP"
  ) {
    throw new Error("Invalid WebP file");
  }

  let chunkOffset = 12;

  while (chunkOffset + 8 <= buffer.length) {
    const chunkType = buffer.toString("ascii", chunkOffset, chunkOffset + 4);
    const chunkLength = buffer.readUInt32LE(chunkOffset + 4);
    const dataOffset = chunkOffset + 8;

    if (dataOffset + chunkLength > buffer.length) {
      throw new Error("Invalid WebP chunk length");
    }

    if (chunkType === "VP8X" && chunkLength >= 10) {
      return {
        width: buffer.readUIntLE(dataOffset + 4, 3) + 1,
        height: buffer.readUIntLE(dataOffset + 7, 3) + 1,
      };
    }

    if (
      chunkType === "VP8 " &&
      chunkLength >= 10 &&
      buffer[dataOffset + 3] === 0x9d &&
      buffer[dataOffset + 4] === 0x01 &&
      buffer[dataOffset + 5] === 0x2a
    ) {
      return {
        width: buffer.readUInt16LE(dataOffset + 6) & 0x3fff,
        height: buffer.readUInt16LE(dataOffset + 8) & 0x3fff,
      };
    }

    if (
      chunkType === "VP8L" &&
      chunkLength >= 5 &&
      buffer[dataOffset] === 0x2f
    ) {
      const bits = buffer.readUInt32LE(dataOffset + 1);

      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >>> 14) & 0x3fff) + 1,
      };
    }

    chunkOffset = dataOffset + chunkLength + (chunkLength % 2);
  }

  throw new Error("WebP dimensions not found");
}

function readWebpChunks(buffer) {
  const chunks = [];
  let chunkOffset = 12;

  while (chunkOffset + 8 <= buffer.length) {
    const chunkType = buffer.toString("ascii", chunkOffset, chunkOffset + 4);
    const chunkLength = buffer.readUInt32LE(chunkOffset + 4);
    const dataOffset = chunkOffset + 8;

    if (dataOffset + chunkLength > buffer.length) {
      throw new Error("Invalid WebP chunk length");
    }

    chunks.push(chunkType.trim());
    chunkOffset = dataOffset + chunkLength + (chunkLength % 2);
  }

  return chunks;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe("milestone localization", () => {
  test("every milestone defines complete zh, en, and ja content", async () => {
    const { context } = await createMilestoneContext();
    const posts = readJsonExpression(context, "HUIHUI_POSTS");
    const ids = posts.map((post) => post.id);

    expect(posts).toHaveLength(7);
    expect(new Set(ids).size).toBe(ids.length);

    for (const post of posts) {
      expect(post.id).toMatch(/^[a-z0-9-]+$/);
      expect(post.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Object.keys(post.content).sort()).toEqual([...locales].sort());

      for (const locale of locales) {
        expect(post.content[locale].trim(), `${post.id}:${locale}`).not.toBe("");
      }

      expect(Array.isArray(post.images)).toBe(true);
      expect(Array.isArray(post.links)).toBe(true);

      for (const image of post.images) {
        expect(image.id).toMatch(/^[a-z0-9-]+$/);
        expect(Number.isInteger(image.width), `${image.id}:width`).toBe(true);
        expect(Number.isInteger(image.height), `${image.id}:height`).toBe(true);
        expect(image.width, `${image.id}:width`).toBeGreaterThan(0);
        expect(image.height, `${image.id}:height`).toBeGreaterThan(0);
        expect(image.srcset, `${image.id}:srcset`).toMatch(
          /^\/images\/[a-z0-9_-]+\.webp \d+w, \/images\/[a-z0-9_-]+\.webp \d+w(?:, \/images\/[a-z0-9_-]+\.webp \d+w)?$/,
        );
        expect(image.sizes, `${image.id}:sizes`).not.toBe("");
        expect(image.fullSrc, `${image.id}:fullSrc`).toBe(image.src);
        expect(image.decoding, `${image.id}:decoding`).toBe("async");
        expect(Object.keys(image.alt).sort()).toEqual([...locales].sort());
        for (const locale of locales) {
          expect(image.alt[locale].trim(), `${image.id}:${locale}`).not.toBe("");
        }
      }

      if (post.caption) {
        expect(Object.keys(post.caption).sort()).toEqual([...locales].sort());
      }
    }
  });

  test("keeps the Ave Mujica Exitus Taipei DAY2 milestone first with localized hashtags", async () => {
    const { context } = await createMilestoneContext();
    const [exitusPost] = readJsonExpression(context, "HUIHUI_POSTS");

    expect(exitusPost).toEqual({
      id: "ave-mujica-exitus-taipei-day2-2026-08-09",
      authorName: "huihui",
      authorHandle: "@huihui",
      date: "2026-08-09",
      content: {
        zh: "謝謝！\n這是最棒的演唱會！",
        en: "Thank you!\nThis was the best concert ever!",
        ja: "ありがとう！\n最高のライブでした！",
      },
      images: [
        {
          id: "ave-mujica-exitus-taipei-day2-venue",
          src: "/images/3013_p.webp",
          srcset: exitusImageSrcset,
          sizes: exitusImageSizes,
          fullSrc: "/images/3013_p.webp",
          width: 8064,
          height: 6048,
          decoding: "async",
          alt: {
            zh: "Ave Mujica LIVE TOUR 2026「Exitus」台北公演 DAY2 演唱會現場",
            en: 'Ave Mujica LIVE TOUR 2026 "Exitus" Taipei DAY2 concert venue',
            ja: "Ave Mujica LIVE TOUR 2026「Exitus」台北公演 DAY2 ライブ会場",
          },
        },
      ],
      links: [
        {
          id: "exitus-taipei-hashtag",
          href: "https://x.com/hashtag/Exitus_TAIPEI?src=hashtag_click",
          label: "#Exitus_TAIPEI",
          className: "hashtag",
          target: "_blank",
          rel: "noopener noreferrer",
        },
        {
          id: "ave-mujica-hashtag",
          href: "https://x.com/hashtag/AveMujica?src=hashtag_click",
          label: "#AveMujica",
          className: "hashtag",
          target: "_blank",
          rel: "noopener noreferrer",
        },
      ],
    });
    expect(
      vm.runInContext(
        "HUIHUI_POSTS[0].links[0] === EXITUS_TAIPEI_HASHTAG_LINK",
        context,
      ),
    ).toBe(true);
    expect(
      vm.runInContext(
        "HUIHUI_POSTS[0].links[1] === AVE_MUJICA_HASHTAG_LINK",
        context,
      ),
    ).toBe(true);
    expect(Object.values(exitusPost.content).join("\n")).not.toMatch(
      /#(?:Exitus_TAIPEI|AveMujica)/,
    );
  });

  test("preserves the Course Mode Phase 10 milestone with localized media", async () => {
    const { context } = await createMilestoneContext();
    const [, phase10Post] = readJsonExpression(context, "HUIHUI_POSTS");

    expect(phase10Post.id).toBe(
      "arcaea-course-mode-phase-10-clear-2026-07-31",
    );
    expect(phase10Post.date).toBe("2026-07-31");
    expect(phase10Post.content).toEqual({
      zh: 'Course Mode <span class="beyond">Phase 10</span> 完成！！',
      en: 'Course Mode <span class="beyond">Phase 10</span> CLEAR!!',
      ja: 'Course Mode <span class="beyond">Phase 10</span> 完走！！',
    });
    expect(phase10Post.images).toEqual([
      {
        id: "course-mode-phase-10-score",
        src: "/images/3011_p.webp",
        ...c2ResponsiveFields("3011", c2MultiImageSizes),
        width: 2560,
        height: 1600,
        alt: {
          zh: "Arcaea Course Mode Phase 10 成績截圖",
          en: "Arcaea Course Mode Phase 10 score screenshot",
          ja: "Arcaea Course Mode Phase 10 スコア画面",
        },
      },
      {
        id: "course-mode-phase-10-banner-select",
        src: "/images/3012_p.webp",
        ...c2ResponsiveFields("3012", c2MultiImageSizes),
        width: 2560,
        height: 1600,
        alt: {
          zh: "Arcaea Course Mode Phase 10 名牌選擇畫面",
          en: "Arcaea Course Mode Phase 10 banner selection screen",
          ja: "Arcaea Course Mode Phase 10 バナー選択画面",
        },
      },
    ]);

    for (const image of phase10Post.images) {
      for (const locale of locales) {
        expect(image.alt[locale].trim()).not.toBe("");
      }
    }

    expect(
      vm.runInContext(
        "HUIHUI_POSTS[1].links[0] === ARCAEA_HASHTAG_LINK",
        context,
      ),
    ).toBe(true);
    expect(
      vm.runInContext("HUIHUI_POSTS[1].caption === ARCAEA_CAPTION", context),
    ).toBe(true);
    expect(Object.values(phase10Post.content).join("\n")).not.toContain(
      "#arcaea",
    );
  });

  test("English and Japanese views use their own bodies without Chinese fallback", async () => {
    const { context } = await createMilestoneContext();
    const sourcePosts = readJsonExpression(context, "HUIHUI_POSTS");
    const englishPosts = readJsonExpression(context, 'getLocalizedPosts("en")');
    const japanesePosts = readJsonExpression(context, 'getLocalizedPosts("ja")');

    for (const [index, sourcePost] of sourcePosts.entries()) {
      expect(englishPosts[index].content).toBe(sourcePost.content.en);
      expect(japanesePosts[index].content).toBe(sourcePost.content.ja);
    }

    const englishBody = englishPosts.map((post) => post.content).join("\n");
    const japaneseBody = japanesePosts.map((post) => post.content).join("\n");

    const chineseOnlyTexts = [
      "初代魔王",
      "3.0 魔王",
      "摘星",
      "從 2021 年開始玩",
      "11.90</span> 到達",
    ];

    for (const chineseOnlyText of chineseOnlyTexts) {
      expect(englishBody).not.toContain(chineseOnlyText);
      expect(japaneseBody).not.toContain(chineseOnlyText);
    }
  });

  test("milestone originals and responsive derivatives match their semantic data contracts", async () => {
    const { context } = await createMilestoneContext();
    const posts = readJsonExpression(context, "HUIHUI_POSTS");
    const images = posts.flatMap((post) => post.images);
    const c2Images = images.filter((image) =>
      c2Basenames.has(path.basename(image.src, "_p.webp")),
    );

    expect(images).toHaveLength(9);
    expect(c2Images).toHaveLength(8);
    expect(
      c2Images
        .map((image) => path.basename(image.src, "_p.webp"))
        .sort(),
    ).toEqual([...c2Basenames].sort());

    for (const post of posts) {
      for (const image of post.images) {
        expect(image.src).toMatch(/^\/images\/[a-z0-9_-]+\.webp$/);
        expect(image.fullSrc).toBe(image.src);
        expect(image.decoding).toBe("async");

        const originalBuffer = await readFile(
          path.join(root, image.src.replace(/^\//, "")),
        );
        const originalDimensions = readWebpDimensions(originalBuffer);
        const candidates = image.srcset.split(", ").map((candidate) => {
          const [src, descriptor] = candidate.split(" ");

          return { src, width: Number.parseInt(descriptor, 10) };
        });
        const basename = path.basename(image.src, "_p.webp");
        const isC2Image = c2Basenames.has(basename);
        const expectedWidths = isC2Image ? [800, 1800, 2560] : [800, 1600];
        const expectedSizes = isC2Image
          ? post.images.length > 1
            ? c2MultiImageSizes
            : c2SingleImageSizes
          : exitusImageSizes;

        expect(originalDimensions, image.src).toEqual({
          width: image.width,
          height: image.height,
        });
        expect(image.sizes).toBe(expectedSizes);
        expect(candidates.map((candidate) => candidate.width)).toEqual(
          expectedWidths,
        );

        for (const candidate of candidates) {
          const isOriginalCandidate = candidate.width === image.width;

          expect(candidate.src).toBe(
            isOriginalCandidate
              ? image.src
              : `/images/${basename}_p-${candidate.width}.webp`,
          );

          const candidateBuffer = await readFile(
            path.join(root, candidate.src.replace(/^\//, "")),
          );
          const dimensions = readWebpDimensions(candidateBuffer);

          expect(dimensions.width).toBe(candidate.width);
          expect(dimensions.height).toBe(
            candidate.width * (image.height / image.width),
          );
          expect(dimensions.width).toBeLessThanOrEqual(image.width);
          expect(dimensions.height).toBeLessThanOrEqual(image.height);
          if (isOriginalCandidate) {
            expect(dimensions.width * dimensions.height).toBe(
              image.width * image.height,
            );
          } else {
            expect(dimensions.width * dimensions.height).toBeLessThan(
              image.width * image.height,
            );
          }

          if (isC2Image && !isOriginalCandidate) {
            const chunks = readWebpChunks(candidateBuffer);

            expect(chunks).toContain("ICCP");
            expect(chunks).not.toContain("EXIF");
            expect(chunks).not.toContain("XMP");
          }
        }
      }
    }
  });

  test("keeps the original 3013 image for the Lightbox and two useful display derivatives", async () => {
    const { context } = await createMilestoneContext();
    const [exitusPost] = readJsonExpression(context, "HUIHUI_POSTS");
    const [image] = exitusPost.images;
    const candidates = image.srcset.split(", ").map((candidate) => {
      const [src, descriptor] = candidate.split(" ");

      return { src, width: Number.parseInt(descriptor, 10) };
    });

    expect(image).toMatchObject({
      src: "/images/3013_p.webp",
      srcset: exitusImageSrcset,
      sizes: exitusImageSizes,
      fullSrc: "/images/3013_p.webp",
      width: 8064,
      height: 6048,
      decoding: "async",
    });
    expect(candidates).toEqual([
      { src: "/images/3013_p-800.webp", width: 800 },
      { src: "/images/3013_p-1600.webp", width: 1600 },
    ]);

    for (const candidate of candidates) {
      const imageBuffer = await readFile(
        path.join(root, candidate.src.replace(/^\//, "")),
      );
      const dimensions = readWebpDimensions(imageBuffer);

      expect(dimensions).toEqual({
        width: candidate.width,
        height: candidate.width * 0.75,
      });
      expect(dimensions.width * dimensions.height).toBeLessThan(
        image.width * image.height,
      );
    }
  });

  test("C2 candidate thresholds remain sufficient from DPR 1 through 3", () => {
    const measuredCases = [
      { viewport: 390, singleWidth: 310, multiWidth: 312 },
      { viewport: 899, singleWidth: 801.0625, multiWidth: 803.0625 },
      { viewport: 900, singleWidth: 802, multiWidth: 804 },
      { viewport: 901, singleWidth: 486.96875, multiWidth: 488.96875 },
      { viewport: 1200, singleWidth: 700, multiWidth: 600 },
      { viewport: 1280, singleWidth: 700, multiWidth: 600 },
      { viewport: 1440, singleWidth: 700, multiWidth: 600 },
    ];
    const clamp = (minimum, value, maximum) =>
      Math.min(maximum, Math.max(minimum, value));
    const declaredSlots = (viewport) => {
      const padding = clamp(36, viewport * 0.06, 56);

      if (viewport <= 900) {
        return {
          single: viewport - 43 - padding,
          multi: viewport - 41 - padding,
        };
      }
      if (viewport <= 1200) {
        return {
          single: Math.min(700, viewport - 359 - padding),
          multi: Math.min(600, viewport - 357 - padding),
        };
      }

      return { single: 700, multi: 600 };
    };
    const sources = [
      { width: 800, height: 500 },
      { width: 1800, height: 1125 },
      { width: 2560, height: 1600 },
    ];

    for (const measured of measuredCases) {
      const slots = declaredSlots(measured.viewport);

      for (const type of ["single", "multi"]) {
        const actualWidth = measured[`${type}Width`];
        const lowerThreshold = 800 / slots[type];
        const upperThreshold = 1800 / slots[type];
        const dprs = [
          1,
          1.25,
          1.5,
          2,
          2.5,
          3,
          lowerThreshold,
          lowerThreshold + 0.0001,
          upperThreshold,
          upperThreshold + 0.0001,
        ].filter((dpr) => dpr >= 1 && dpr <= 3);

        for (const dpr of dprs) {
          const selectedSource =
            sources.find((source) => source.width >= slots[type] * dpr) ||
            sources.at(-1);
          const requiredWidth = Math.ceil(actualWidth * dpr);
          const requiredHeight = Math.ceil((actualWidth / 1.6) * dpr);
          const diagnostic = `${measured.viewport}px ${type} at DPR ${dpr}`;

          expect(selectedSource.width, `${diagnostic}:width`).toBeGreaterThanOrEqual(
            requiredWidth,
          );
          expect(selectedSource.height, `${diagnostic}:height`).toBeGreaterThanOrEqual(
            requiredHeight,
          );
        }
      }
    }
  });

  test("renderer preserves localized image, lazy-loading, and Lightbox contracts", async () => {
    const { context } = await createMilestoneContext();
    const sourcePosts = readJsonExpression(context, "HUIHUI_POSTS");

    for (const locale of locales) {
      const localizedPosts = readJsonExpression(
        context,
        `getLocalizedPosts(${JSON.stringify(locale)})`,
      );

      for (const [postIndex, sourcePost] of sourcePosts.entries()) {
        const markup = vm.runInContext(
          `renderPostImages(getLocalizedPosts(${JSON.stringify(locale)})[${postIndex}])`,
          context,
        );

        if (sourcePost.images.length === 0) {
          expect(markup).toBe("");
          continue;
        }

        if (sourcePost.caption) {
          expect(markup).toContain(
            `<figcaption class="post-caption">${sourcePost.caption[locale]}</figcaption>`,
          );
        } else {
          expect(markup).not.toContain('<figcaption class="post-caption">');
        }

        for (const image of sourcePost.images) {
          const escapedAlt = vm.runInContext(
            `escapeHtmlAttribute(${JSON.stringify(image.alt[locale])})`,
            context,
          );
          const responsiveAttributes = image.srcset
            ? [
                `srcset="${escapeRegExp(image.srcset)}"`,
                `sizes="${escapeRegExp(image.sizes)}"`,
              ]
            : [];
          const decodingAttribute = image.decoding
            ? [`decoding="${image.decoding}"`]
            : [];
          const fullSourceAttribute = image.fullSrc
            ? [`data-full-src="${escapeRegExp(image.fullSrc)}"`]
            : [];
          const imageContract = new RegExp(
            [
              `<img\\s+src="${escapeRegExp(image.src)}"`,
              ...responsiveAttributes,
              `alt="${escapeRegExp(escapedAlt)}"`,
              `width="${image.width}"`,
              `height="${image.height}"`,
              'class="zoomable"',
              'loading="lazy"',
              ...decodingAttribute,
              `data-image-id="${escapeRegExp(image.id)}"`,
              ...fullSourceAttribute,
              "\\s*/>",
            ].join("\\s+"),
            "s",
          );

          expect(markup, `${locale}:${image.id}`).toMatch(imageContract);
        }
      }
    }
  });

  test("formats ISO milestone dates for zh-Hant, en, and ja", async () => {
    const { context } = await createMilestoneContext();
    const expected = {
      zh: "2026年6月28日",
      en: "June 28, 2026",
      ja: "2026年6月28日",
    };

    for (const locale of locales) {
      const formatted = vm.runInContext(
        `formatPostDate("2026-06-28", ${JSON.stringify(locale)})`,
        context,
      );
      expect(formatted).toBe(expected[locale]);
    }
  });

  test("keeps milestone IDs, image arrays, and links consistent across locales", async () => {
    const { context } = await createMilestoneContext();
    const localizedPosts = Object.fromEntries(
      locales.map((locale) => [
        locale,
        readJsonExpression(
          context,
          `getLocalizedPosts(${JSON.stringify(locale)})`,
        ),
      ]),
    );
    const sharedShape = (post) => ({
      id: post.id,
      date: post.date,
      images: post.images.map(
        ({
          id,
          src,
          srcset,
          sizes,
          fullSrc,
          width,
          height,
          decoding,
        }) => ({
          id,
          src,
          srcset,
          sizes,
          fullSrc,
          width,
          height,
          decoding,
        }),
      ),
      links: post.links,
    });
    const expectedShape = localizedPosts.zh.map(sharedShape);

    expect(localizedPosts.en.map(sharedShape)).toEqual(expectedShape);
    expect(localizedPosts.ja.map(sharedShape)).toEqual(expectedShape);
  });
});
