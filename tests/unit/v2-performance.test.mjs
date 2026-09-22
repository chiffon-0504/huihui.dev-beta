import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { assertPerformance, budgetFailures, budgets, measurePerformance, readFiles } from "../../v2/tools/performance.mjs";

const asset = (fileName, source) => ({ fileName, source });

test("counts UTF-8 bytes, binary images, chunks and copied files without depending on hashes", () => {
  const files = [asset("index.html", "中文"), { fileName: "assets/main-abcd.js", code: "1234" },
    asset("assets/bootstrap.js", "12"), asset("assets/main.css", "abc"),
    asset("photo.webp", new Uint8Array(7)), asset("icon.svg", "12345"), asset("_headers", "12"),
    asset("new-font.woff2", new Uint8Array(10))];
  const report = measurePerformance(files);
  expect(report.totals).toEqual({ html: 6, js: 6, css: 3, images: 12, total: 39,
    largestJs: 4, largestCss: 3, largestImage: 7 });
  expect(report.webpBytes).toBe(7);
  expect(report.bundles).toHaveLength(3);
  expect(measurePerformance(files.map((file) => ({ ...file, fileName: file.fileName.replace("abcd", "WXYZ") }))).totals).toEqual(report.totals);
});

test.each(Object.keys(budgets))("%s accepts the exact limit and reports a one-byte regression", (name) => {
  expect(budgetFailures({ [name]: budgets[name] }, { [name]: budgets[name] })).toEqual([]);
  expect(budgetFailures({ [name]: budgets[name] + 1 }, { [name]: budgets[name] }))
    .toEqual([`${name}: actual ${budgets[name] + 1}, allowed ${budgets[name]}`]);
});

test.each([undefined, NaN, Infinity, -1, 1.5])("rejects invalid measured value %s", (value) => {
  expect(budgetFailures({ bytes: value }, { bytes: 10 })).toHaveLength(1);
});

test("reports all failures and fails closed on empty or malformed inventories", () => {
  expect(budgetFailures({ js: 21, css: 11 }, { js: 20, css: 10 })).toEqual([
    "js: actual 21, allowed 20", "css: actual 11, allowed 10",
  ]);
  expect(() => budgetFailures({}, { js: NaN })).toThrow("Invalid budget");
  expect(() => assertPerformance(measurePerformance([]))).toThrow("HTML inventory");
  expect(() => measurePerformance([asset("a.js", "a"), asset("a.js", "b")])).toThrow("Duplicate");
  expect(() => measurePerformance([{ fileName: "missing.js" }])).toThrow("Missing bytes");
  const report = { documents: [{ file: "404.html" }, { file: "tools/jev/index.html" }, ...Array.from({ length: 12 }, (_, i) => ({ file: `${i}/index.html` }))], totals: { ...budgets } };
  expect(() => assertPerformance({ ...report, totals: { ...budgets, js: 0 } })).toThrow("Missing js");
  expect(() => assertPerformance({ ...report, totals: { ...budgets, js: budgets.js + 1 } }))
    .toThrow(`js: actual ${budgets.js + 1}, allowed ${budgets.js}`);
});

test("disk inventory recursively includes copied public resources and matches build-output accounting", async () => {
  const root = await mkdtemp(join(tmpdir(), "v2-performance-"));
  try {
    await mkdir(join(root, "nested"));
    await writeFile(join(root, "nested", "app.js"), "中文");
    await writeFile(join(root, "_headers"), "12");
    const disk = measurePerformance(await readFiles(root));
    expect(disk).toEqual(measurePerformance([asset("nested/app.js", "中文"), asset("_headers", "12")]));
    await expect(readFiles(join(root, "missing"))).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
