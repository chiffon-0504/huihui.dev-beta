import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { beforeAll, describe, expect, test } from "vitest";

const root = process.cwd();
const localeFiles = [
  "js/locales/zh.js",
  "js/locales/en.js",
  "js/locales/ja.js",
];
const aboutPages = [
  "about/index.html",
  "en/about/index.html",
  "ja/about/index.html",
];
const locales = ["zh", "en", "ja"];
const expectedRenderedAlts = {
  zh: [
    "maimai DX",
    "maimai DX 最愛歌曲",
    "maimai DX 最佳成績",
    "Arcaea",
    "Arcaea 最愛歌曲",
    "Arcaea 最佳成績",
    "Summer Pockets REFLECTION BLUE",
  ],
  en: [
    "maimai DX",
    "Favorite maimai DX song",
    "Best maimai DX record",
    "Arcaea",
    "Favorite Arcaea song",
    "Best Arcaea record",
    "Summer Pockets REFLECTION BLUE",
  ],
  ja: [
    "maimai DX",
    "お気に入りのmaimai DX楽曲",
    "maimai DXのベスト記録",
    "Arcaea",
    "お気に入りのArcaea楽曲",
    "Arcaeaのベスト記録",
    "Summer Pockets REFLECTION BLUE",
  ],
};
const expectedLocalSources = [
  "/images/1001_am.webp",
  "/images/1002_amf.webp",
  "/images/1003_amb.webp",
  "/images/1005_aaf.webp",
  "/images/1006_aab.webp",
  "/images/1014_aa.webp",
  "/images/1032_a.webp",
  "/images/games/Cafe-Stella-and-the-Reapers-Butterflies.webp",
  "/images/games/Sickly-Days-and-Summer-Traces.webp",
  "/images/games/summer-pockets-rb-wide.webp",
  "/images/games/summer-pockets-rb.webp",
];

let context;

function createElement(tagName) {
  return {
    tagName: tagName.toUpperCase(),
    children: [],
    dataset: {},
    append(...children) {
      this.children.push(...children);
    },
    addEventListener() {},
    removeAttribute(name) {
      if (name === "data-fallback-src") delete this.dataset.fallbackSrc;
      else delete this[name];
    },
  };
}

async function createAboutContext() {
  const testContext = {
    AbortController,
    URL,
    clearTimeout,
    currentLocale: "zh",
    document: {
      addEventListener() {},
      createElement,
    },
    getHuihuiApiBase: () => "https://api.huihui.dev",
    setTimeout,
    window: {},
  };
  testContext.getCurrentLocale = () => testContext.currentLocale;
  vm.createContext(testContext);

  for (const relativePath of localeFiles) {
    const source = await readFile(path.join(root, relativePath), "utf8");
    vm.runInContext(source, testContext, { filename: relativePath });
  }

  const aboutSource = await readFile(
    path.join(root, "js", "about-page.js"),
    "utf8",
  );
  vm.runInContext(aboutSource, testContext, { filename: "js/about-page.js" });

  return testContext;
}

function readJsonExpression(expression) {
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

function parseImageMarkup(markup) {
  return [...markup.matchAll(/<img\s+([\s\S]*?)\/>/g)].map((match) =>
    Object.fromEntries(
      [...match[1].matchAll(/([a-z0-9-]+)="([^"]*)"/g)].map((attribute) => [
        attribute[1],
        attribute[2],
      ]),
    ),
  );
}

function getLocalizedValue(messages, keyPath) {
  return keyPath
    .split(".")
    .reduce((value, key) => (value ? value[key] : undefined), messages);
}

beforeAll(async () => {
  context = await createAboutContext();
});

describe("About media metadata", () => {
  test("every local source has positive intrinsic dimensions matching its WebP header", async () => {
    const metadata = readJsonExpression("ABOUT_LOCAL_IMAGE_METADATA");

    expect(Object.keys(metadata).sort()).toEqual([...expectedLocalSources].sort());

    for (const [src, dimensions] of Object.entries(metadata)) {
      expect(Number.isInteger(dimensions.width), `${src}:width`).toBe(true);
      expect(Number.isInteger(dimensions.height), `${src}:height`).toBe(true);
      expect(dimensions.width, `${src}:width`).toBeGreaterThan(0);
      expect(dimensions.height, `${src}:height`).toBeGreaterThan(0);

      const imageBuffer = await readFile(
        path.join(root, src.replace(/^\//, "")),
      );
      expect(readWebpDimensions(imageBuffer), src).toEqual(dimensions);
    }
  });

  test("the static renderer preserves dimensions, order, localized alt, and lazy policy", () => {
    const metadata = readJsonExpression("ABOUT_LOCAL_IMAGE_METADATA");
    const renderedByLocale = {};

    for (const locale of locales) {
      context.currentLocale = locale;
      const markup = vm.runInContext("renderAboutInterestCards()", context);
      const messages = readJsonExpression(`window.HUIHUI_I18N.${locale}`);
      const images = parseImageMarkup(markup).map((image) => ({
        src: image.src,
        alt: image["data-i18n-alt"]
          ? getLocalizedValue(messages, image["data-i18n-alt"])
          : image.alt,
        width: image.width,
        height: image.height,
        loading: image.loading,
        decoding: image.decoding,
      }));

      expect(images).toHaveLength(7);
      for (const image of images) {
        expect(image.width, image.src).toBe(String(metadata[image.src].width));
        expect(image.height, image.src).toBe(String(metadata[image.src].height));
        expect(image.loading, image.src).toBe("lazy");
        expect(image.decoding, image.src).toBe("async");
        expect(image.alt, image.src).toBeTruthy();
      }

      renderedByLocale[locale] = images;
    }

    for (const locale of locales) {
      expect(renderedByLocale[locale].map((image) => image.alt)).toEqual(
        expectedRenderedAlts[locale],
      );
    }
  });

  test("the on-demand Lightbox preview keeps default loading behavior", async () => {
    for (const relativePath of aboutPages) {
      const html = await readFile(path.join(root, relativePath), "utf8");
      const previewMarkup = html.match(
        /<img\b[^>]*\bid="lightboxImg"[^>]*>/,
      )?.[0];

      expect(previewMarkup, relativePath).toBeTruthy();
      expect(previewMarkup, relativePath).toContain('src=""');
      expect(previewMarkup, relativePath).not.toMatch(/\bloading=/);
      expect(previewMarkup, relativePath).not.toMatch(/\bdecoding=/);
    }
  });

  test("dynamic Steam cards only apply intrinsic dimensions to local covers", () => {
    const cardState = (appid, coverUrl) =>
      readJsonExpression(`(() => {
        const card = createSteamGameCard({
          appid: ${appid},
          name: "Fixture ${appid}",
          playtimeHours: 12.5,
          coverUrl: ${JSON.stringify(coverUrl)},
          capsuleUrl: "https://cdn.cloudflare.steamstatic.com/header.jpg",
          storeUrl: "https://store.steampowered.com/app/${appid}/"
        }, ABOUT_PAGE_CONFIG.en);
        const image = card.children[0];
        return {
          src: image.src,
          loading: image.loading,
          decoding: image.decoding,
          width: Object.hasOwn(image, "width") ? image.width : null,
          height: Object.hasOwn(image, "height") ? image.height : null
        };
      })()`);

    expect(
      cardState(
        2458530,
        "https://cdn.cloudflare.steamstatic.com/steam/apps/2458530/library_600x900.jpg",
      ),
    ).toEqual({
      src: "https://cdn.cloudflare.steamstatic.com/steam/apps/2458530/library_600x900.jpg",
      loading: "lazy",
      decoding: "async",
      width: null,
      height: null,
    });
    expect(
      cardState(
        1829980,
        "https://cdn.cloudflare.steamstatic.com/steam/apps/1829980/library_600x900.jpg",
      ),
    ).toEqual({
      src: "/images/games/Cafe-Stella-and-the-Reapers-Butterflies.webp",
      loading: "lazy",
      decoding: "async",
      width: 600,
      height: 900,
    });
  });

  test("fallback selector and one-shot error handler keep source dimensions accurate", () => {
    const fallbackState = (fallbackSrc) =>
      readJsonExpression(`(() => {
        let selector;
        let errorHandler;
        let options;
        const image = {
          src: "/images/source.webp",
          width: 600,
          height: 900,
          dataset: { fallbackSrc: ${JSON.stringify(fallbackSrc)} },
          removeAttribute(name) {
            if (name === "data-fallback-src") delete this.dataset.fallbackSrc;
            if (name === "width") delete this.width;
            if (name === "height") delete this.height;
          },
          addEventListener(type, listener, listenerOptions) {
            if (type === "error") {
              errorHandler = listener;
              options = listenerOptions;
            }
          }
        };
        attachImageFallbacks({
          querySelectorAll(value) {
            selector = value;
            return [image];
          }
        });
        errorHandler();
        return {
          selector,
          once: options.once,
          src: image.src,
          width: Object.hasOwn(image, "width") ? image.width : null,
          height: Object.hasOwn(image, "height") ? image.height : null,
          fallbackAttributeRemoved: !("fallbackSrc" in image.dataset)
        };
      })()`);

    expect(fallbackState("/images/1032_a.webp")).toEqual({
      selector: "img[data-fallback-src]",
      once: true,
      src: "/images/1032_a.webp",
      width: 850,
      height: 347,
      fallbackAttributeRemoved: true,
    });
    expect(
      fallbackState("https://cdn.cloudflare.steamstatic.com/header.jpg"),
    ).toEqual({
      selector: "img[data-fallback-src]",
      once: true,
      src: "https://cdn.cloudflare.steamstatic.com/header.jpg",
      width: null,
      height: null,
      fallbackAttributeRemoved: true,
    });
  });
});
