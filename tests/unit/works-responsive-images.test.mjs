import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const worksPages = [
  "works/index.html",
  "en/works/index.html",
  "ja/works/index.html",
];
const largeImageSizes =
  "(max-width: 722px) 680px, (max-width: 900px) calc(100vw - 42px), 1074px";
const portraitImageSizes =
  "(max-width: 900px) calc(100vw - 42px), (max-width: 942px) 383px, (max-width: 1200px) calc(66.667vw - 245px), min(660px, calc(66.667vw - 298px))";
const tallImageSizes =
  "(max-width: 526px) 484px, (max-width: 900px) calc(100vw - 42px), 1146px";
const standardImageSizes =
  "(max-width: 439px) 397px, (max-width: 900px) calc(100vw - 42px), 554px";
const worksImages = [
  {
    id: "2001",
    width: 3024,
    height: 1859,
    lazy: false,
    sizes: largeImageSizes,
    sourceWidths: [900, 1600, 2400],
  },
  {
    id: "2002",
    width: 3024,
    height: 3078,
    lazy: true,
    sizes: portraitImageSizes,
    sourceWidths: [900, 1600, 1800],
  },
  {
    id: "2003",
    width: 4615,
    height: 2660,
    lazy: true,
    sizes: tallImageSizes,
    sourceWidths: [900, 1600, 2400],
  },
  {
    id: "2004",
    width: 5043,
    height: 3538,
    lazy: true,
    sizes: standardImageSizes,
    sourceWidths: [900, 1600, 1800],
  },
];
const derivativeDimensions = new Map([
  ["2001", [[900, 553], [1600, 984], [2400, 1475]]],
  ["2002", [[900, 916], [1600, 1629], [1800, 1832]]],
  [
    "2003",
    [
      [900, 519],
      [1600, 922],
      [2400, 1383],
    ],
  ],
  ["2004", [[900, 631], [1600, 1123], [1800, 1263]]],
]);
const saturatedDesktopContracts = new Map([
  [
    "2001",
    { slotWidth: 1074, coverWidth: 1073.6094674556214, coverHeight: 660 },
  ],
  [
    "2002",
    { slotWidth: 660, coverWidth: 658.65625, coverHeight: 670.41796875 },
  ],
  [
    "2003",
    { slotWidth: 1146, coverWidth: 1145.0751879699246, coverHeight: 660 },
  ],
  [
    "2004",
    { slotWidth: 554, coverWidth: 553.048049745619, coverHeight: 388 },
  ],
]);

function readAttributes(tag) {
  return Object.fromEntries(
    [...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((match) => [
      match[1],
      match[2],
    ]),
  );
}

function normalizeImagePath(value) {
  return value.replace(/^\.\.\/images\//, "/images/");
}

function getWorksImageAttributes(html, id) {
  const tag = [...html.matchAll(/<img\b[\s\S]*?\/>/g)].find((match) =>
    readAttributes(match[0]).src?.endsWith(`/images/${id}_w.webp`),
  )?.[0];

  expect(tag, `${id} image tag`).toBeDefined();
  return readAttributes(tag);
}

function readWebp(buffer) {
  if (
    buffer.length < 20 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WEBP"
  ) {
    throw new Error("Invalid WebP file");
  }

  const chunks = [];
  let dimensions;
  let chunkOffset = 12;

  while (chunkOffset + 8 <= buffer.length) {
    const chunkType = buffer.toString("ascii", chunkOffset, chunkOffset + 4);
    const chunkLength = buffer.readUInt32LE(chunkOffset + 4);
    const dataOffset = chunkOffset + 8;

    if (dataOffset + chunkLength > buffer.length) {
      throw new Error("Invalid WebP chunk length");
    }

    chunks.push(chunkType);

    if (chunkType === "VP8X" && chunkLength >= 10) {
      dimensions = {
        width: buffer.readUIntLE(dataOffset + 4, 3) + 1,
        height: buffer.readUIntLE(dataOffset + 7, 3) + 1,
      };
    } else if (
      chunkType === "VP8 " &&
      chunkLength >= 10 &&
      buffer[dataOffset + 3] === 0x9d &&
      buffer[dataOffset + 4] === 0x01 &&
      buffer[dataOffset + 5] === 0x2a
    ) {
      dimensions = {
        width: buffer.readUInt16LE(dataOffset + 6) & 0x3fff,
        height: buffer.readUInt16LE(dataOffset + 8) & 0x3fff,
      };
    }

    chunkOffset = dataOffset + chunkLength + (chunkLength % 2);
  }

  if (!dimensions) throw new Error("WebP dimensions not found");
  return { chunks, dimensions };
}

function candidateThresholdDprs(contract, sources) {
  const breakpoints = new Set([1, 1.25, 1.5, 1.75, 2]);
  const addBreakpoint = (value) => {
    if (value >= 1 && value <= 2) breakpoints.add(value);
  };

  for (const source of sources) {
    addBreakpoint(source.width / contract.slotWidth);
    addBreakpoint(source.width / contract.coverWidth);
    addBreakpoint(source.height / contract.coverHeight);
  }

  const boundaries = [...breakpoints].sort((a, b) => a - b);
  const samples = new Set(boundaries);

  for (const boundary of boundaries) {
    addBreakpoint(boundary - 1e-6);
    addBreakpoint(boundary + 1e-6);
  }
  for (let index = 1; index < boundaries.length; index += 1) {
    samples.add((boundaries[index - 1] + boundaries[index]) / 2);
  }

  for (const breakpoint of breakpoints) samples.add(breakpoint);
  return [...samples].sort((a, b) => a - b);
}

describe("responsive Works images", () => {
  test("ZH, EN, and JA expose equivalent responsive and Lightbox contracts", async () => {
    const localeContracts = [];

    for (const pagePath of worksPages) {
      const html = await readFile(path.join(root, pagePath), "utf8");
      const contracts = worksImages.map((image) => {
        const attributes = getWorksImageAttributes(html, image.id);

        return {
          src: normalizeImagePath(attributes.src),
          srcset: attributes.srcset,
          sizes: attributes.sizes,
          fullSrc: attributes["data-full-src"],
          width: attributes.width,
          height: attributes.height,
          loading: attributes.loading || null,
          decoding: attributes.decoding,
          altKey: attributes["data-i18n-alt"],
          className: attributes.class,
        };
      });

      expect(contracts).toEqual(
        worksImages.map((image) => ({
          src: `/images/${image.id}_w.webp`,
          srcset: image.sourceWidths
            .map((width) => `/images/${image.id}_w-${width}.webp ${width}w`)
            .join(", "),
          sizes: image.sizes,
          fullSrc: `/images/${image.id}_w.webp`,
          width: String(image.width),
          height: String(image.height),
          loading: image.lazy ? "lazy" : null,
          decoding: "async",
          altKey: `works.images.${
            { "2001": "fuji", "2002": "tsutenkaku", "2003": "yokohama", "2004": "train" }[image.id]
          }`,
          className: "zoomable",
        })),
      );
      localeContracts.push(contracts);
    }

    expect(localeContracts[1]).toEqual(localeContracts[0]);
    expect(localeContracts[2]).toEqual(localeContracts[0]);
  });

  test("derivatives preserve aspect ratio, reduce decode pixels, and strip private metadata", async () => {
    for (const image of worksImages) {
      const originalPixels = image.width * image.height;

      for (const [width, height] of derivativeDimensions.get(image.id)) {
        const derivativePath = path.join(
          root,
          "images",
          `${image.id}_w-${width}.webp`,
        );
        const { chunks, dimensions } = readWebp(
          await readFile(derivativePath),
        );

        expect(dimensions, derivativePath).toEqual({ width, height });
        expect(width / height, derivativePath).toBeCloseTo(
          image.width / image.height,
          2,
        );
        expect(width * height, derivativePath).toBeLessThan(originalPixels);
        expect(chunks, derivativePath).not.toContain("EXIF");
        expect(chunks, derivativePath).not.toContain("XMP ");
      }
    }
  });

  test("saturated desktop candidate intervals remain cover-sufficient across intermediate DPRs", () => {
    for (const image of worksImages) {
      const contract = saturatedDesktopContracts.get(image.id);
      const sources = derivativeDimensions
        .get(image.id)
        .map(([width, height]) => ({ width, height }));
      const dprs = candidateThresholdDprs(contract, sources);

      expect(dprs).toEqual(
        expect.arrayContaining([1, 1.25, 1.5, 1.75, 2]),
      );

      for (const dpr of dprs) {
        const selectedSource =
          sources.find(
            (source) => source.width >= contract.slotWidth * dpr,
          ) || sources.at(-1);
        const requirement = {
          width: Math.ceil(contract.coverWidth * dpr),
          height: Math.ceil(contract.coverHeight * dpr),
        };
        const diagnostic = `${image.id} at DPR ${dpr}`;

        expect(selectedSource.width, diagnostic).toBeGreaterThanOrEqual(
          requirement.width,
        );
        expect(selectedSource.height, diagnostic).toBeGreaterThanOrEqual(
          requirement.height,
        );
      }
    }
  });

  test("the original full-resolution Works images remain tracked", () => {
    const originalPaths = worksImages.map(
      (image) => `images/${image.id}_w.webp`,
    );
    const trackedPaths = execFileSync(
      "git",
      ["ls-files", "--", ...originalPaths],
      { cwd: root, encoding: "utf8" },
    )
      .trim()
      .split(/\r?\n/);

    expect(trackedPaths).toEqual(originalPaths);
  });
});
