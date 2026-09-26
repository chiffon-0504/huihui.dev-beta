import { readdir, readFile } from "node:fs/promises";
import { resolve, relative } from "node:path";

// Decimal bytes. Baseline, headroom and update procedure: v2/README.md.
export const budgets = Object.freeze({
  html: 11_950,
  js: 116_000, // Public JEV: measured +5,721 B; scoped 6,000 B allowance.
  css: 26_400, // Public JEV: measured +312 B; scoped 400 B allowance.
  images: 706_000,
  total: 854_150,
  largestJs: 79_000,
  largestCss: 14_600,
  largestImage: 129_000,
});

export const loadingBudgets = Object.freeze({
  shellRequests: 5, // document, classic bootstrap, app module, CSS, SVG sprite
  shellBytes: 119_400, // Same five resources; public JEV JS/CSS allowance only.
  homeImageRequests: 1, // one selected local Memories candidate, Home only
  homeImageBytes: 43_500, // largest 640px candidate (41,396 B) + about 5%
  worksImageRequests: 3, // one selected candidate per photo; no lazy-distance assumption
  worksImageBytes: 365_000, // upper bound: all three largest local candidates + 5%
});

export async function readFiles(directory) {
  const root = resolve(directory);
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return Promise.all(entries.filter((entry) => entry.isFile()).map(async (entry) => {
    const path = resolve(entry.parentPath, entry.name);
    return { fileName: relative(root, path).replaceAll("\\", "/"), source: await readFile(path) };
  }));
}

export function measurePerformance(files) {
  const inventory = files.map((file) => {
    const data = file.code ?? file.source;
    if (typeof data !== "string" && !(data instanceof Uint8Array)) throw new Error(`Missing bytes: ${file.fileName}`);
    return { file: file.fileName, bytes: Buffer.byteLength(data) };
  }).sort((a, b) => a.file.localeCompare(b.file));
  if (new Set(inventory.map(({ file }) => file)).size !== inventory.length) throw new Error("Duplicate build file");
  const group = (pattern) => inventory.filter(({ file }) => pattern.test(file));
  const html = group(/\.html$/i);
  const js = group(/\.(?:m?js|cjs)$/i);
  const css = group(/\.css$/i);
  const images = group(/\.(?:webp|svg|avif|png|jpe?g|gif|ico)$/i);
  const webp = group(/\.webp$/i);
  const sum = (entries) => entries.reduce((total, entry) => total + entry.bytes, 0);
  const largest = (entries) => Math.max(0, ...entries.map(({ bytes }) => bytes));
  return {
    totals: { html: sum(html), js: sum(js), css: sum(css), images: sum(images), total: sum(inventory),
      largestJs: largest(js), largestCss: largest(css), largestImage: largest(images) },
    webpBytes: sum(webp),
    documents: html,
    bundles: [...js, ...css],
    inventory,
  };
}

export function budgetFailures(actual, allowed) {
  return Object.entries(allowed).flatMap(([name, limit]) => {
    if (!Number.isSafeInteger(limit) || limit < 0) throw new Error(`Invalid budget: ${name}`);
    const value = actual[name];
    return !Number.isSafeInteger(value) || value < 0 || value > limit
      ? [`${name}: actual ${value}, allowed ${limit}`] : [];
  });
}

export function assertPerformance(report) {
  // A missing/empty build must not appear faster. Route ownership remains in the build contracts.
  if (report.documents.length !== 14 || !report.documents.some(({ file }) => file === "404.html")
    || !report.documents.some(({ file }) => file === "tools/jev/index.html")) {
    throw new Error(`HTML inventory: actual ${report.documents.length}, allowed 14 including 404.html and private Jev`);
  }
  for (const kind of ["html", "js", "css", "images"]) {
    if (report.totals[kind] <= 0) throw new Error(`Missing ${kind} build output`);
  }
  const failures = budgetFailures(report.totals, budgets);
  if (failures.length) throw new Error(`V2 performance budget exceeded:\n${failures.join("\n")}`);
}
