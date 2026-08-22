import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { htmlDocuments } from "../support/routes.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const expectedLinks = [
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
  {
    rel: "icon",
    href: "/favicon.ico",
    sizes: "16x16 32x32 48x48",
  },
  {
    rel: "apple-touch-icon",
    href: "/apple-touch-icon.png",
    sizes: "180x180",
  },
];

function getHead(html) {
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1];
  expect(head, "document must have a head element").toBeDefined();
  return head;
}

function getAttributes(tag) {
  const attributes = {};
  const pattern = /\s([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;

  for (const match of tag.matchAll(pattern)) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? "";
  }

  return attributes;
}

function getIconLinks(source) {
  return [...source.matchAll(/<link\b[^>]*>/gi)]
    .map((match) => getAttributes(match[0]))
    .filter(({ rel }) => rel === "icon" || rel === "apple-touch-icon");
}

function readPngDimensions(buffer) {
  expect(buffer.subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  expect(buffer.subarray(12, 16).toString("ascii")).toBe("IHDR");

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function readIcoDirectory(buffer) {
  expect(buffer.readUInt16LE(0)).toBe(0);
  expect(buffer.readUInt16LE(2)).toBe(1);

  const count = buffer.readUInt16LE(4);
  return Array.from({ length: count }, (_, index) => {
    const offset = 6 + index * 16;
    const imageOffset = buffer.readUInt32LE(offset + 12);
    const byteLength = buffer.readUInt32LE(offset + 8);

    return {
      width: buffer.readUInt8(offset) || 256,
      height: buffer.readUInt8(offset + 1) || 256,
      planes: buffer.readUInt16LE(offset + 4),
      bitsPerPixel: buffer.readUInt16LE(offset + 6),
      byteLength,
      imageOffset,
      signature: buffer.subarray(imageOffset, imageOffset + 8),
    };
  });
}

describe("favicon contracts", () => {
  test("every static document declares the shared root favicon assets", async () => {
    for (const document of htmlDocuments) {
      const html = await readFile(path.join(root, document.file), "utf8");
      const links = getIconLinks(html);

      expect(links, `${document.file}: favicon links`).toEqual(expectedLinks);
      expect(
        getIconLinks(getHead(html)),
        `${document.file}: favicon links must be in head`,
      ).toEqual(links);
    }
  });

  test("the SVG is scalable and uses a path-based lowercase h", async () => {
    const svg = await readFile(path.join(root, "favicon.svg"), "utf8");

    expect(svg).toMatch(/<svg\b[^>]*\bviewBox="0 0 32 32"/);
    expect(svg).toContain('d="M10 8.5V23.5');
    expect(svg).not.toMatch(/<text\b/i);
    expect(svg).not.toMatch(/(?:href|src)="(?:https?:|data:)/i);
  });

  test("the Apple touch icon is an exact 180px PNG", async () => {
    const png = await readFile(path.join(root, "apple-touch-icon.png"));

    expect(readPngDimensions(png)).toEqual({ width: 180, height: 180 });
  });

  test("the ICO embeds clear 16px, 32px, and 48px PNG variants", async () => {
    const ico = await readFile(path.join(root, "favicon.ico"));
    const entries = readIcoDirectory(ico);

    expect(entries.map(({ width, height }) => [width, height])).toEqual([
      [16, 16],
      [32, 32],
      [48, 48],
    ]);

    for (const entry of entries) {
      expect(entry.planes).toBe(1);
      expect(entry.bitsPerPixel).toBe(32);
      expect(entry.byteLength).toBeGreaterThan(0);
      expect(entry.imageOffset + entry.byteLength).toBeLessThanOrEqual(
        ico.length,
      );
      expect(entry.signature).toEqual(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      );
    }
  });
});
