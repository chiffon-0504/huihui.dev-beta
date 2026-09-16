import { build } from "vite";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { securityHeaders } from "./v2-beta-contract.mjs";

export async function readV2Headers() {
  return securityHeaders(await readFile(new URL("../../v2/public/_headers", import.meta.url), "utf8"));
}

// A synthetic 2x3 JPEG, not a source photograph or a credential-bearing fixture.
export const jpeg = Buffer.from("/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAADAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKgAD//Z", "base64");
export const digest = createHash("sha256").update(jpeg).digest("hex");
export const remoteUrl = (id) => `https://assets-beta.huihui.dev/photos/${id}-${digest}.jpg`;
let compilation;
async function bundle() {
  if (!compilation) compilation = (async () => {
    const viewer = fileURLToPath(new URL("../../v2/src/components/image-viewer.ts", import.meta.url)).replaceAll("\\", "/");
    const locale = fileURLToPath(new URL("../../v2/src/locales/en.ts", import.meta.url)).replaceAll("\\", "/");
    const code = `import { createImageViewer } from ${JSON.stringify(viewer)};
      import copy from ${JSON.stringify(locale)};
      const images = ["fuji", "tsutenkaku", "shiba"].map(id => ({ alt: id, sizes: "100vw", asset: {
        id, src: "/preview.webp", width: 480, height: 640, sources: [{src: "/preview.webp", width: 480}],
        highResolution: {url: "https://assets-beta.huihui.dev/photos/" + id + "-${digest}.jpg", mime: "image/jpeg", width: 2, height: 3, bytes: ${jpeg.length}, sha256: "${digest}"}
      }}));
      const viewer = createImageViewer(images, copy.worksPage.viewer);
      images.forEach((image, index) => { const button = document.createElement("button"); button.textContent = image.alt;
        button.addEventListener("click", () => viewer.open(index, button)); document.body.append(button); });
      document.body.append(viewer.dialog);
      window.violations = [];
      document.addEventListener("securitypolicyviolation", e => window.violations.push({directive:e.effectiveDirective, disposition:e.disposition}));
      const probe = document.createElement("button"); probe.textContent = "Unknown host probe";
      probe.onclick = () => { const image = document.createElement("img"); image.src = "https://unapproved.example.test/photo.jpg"; document.body.append(image); };
      document.body.append(probe);`;
    const entry = fileURLToPath(new URL("./viewer-fixture-entry.js", import.meta.url)).replaceAll("\\", "/");
    const result = await build({ configFile: false, logLevel: "silent", publicDir: false,
      plugins: [{ name: "viewer-fixture", resolveId: (id) => id.replaceAll("\\", "/") === entry ? "\0viewer-fixture" : null,
        load: (id) => id === "\0viewer-fixture" ? code : null }],
      build: { write: false, minify: false, lib: { entry, formats: ["iife"], name: "ViewerFixture" } } });
    return (Array.isArray(result) ? result : [result]).flatMap((entry) => entry.output).find((item) => item.type === "chunk").code;
  })();
  return compilation;
}

export async function openViewerFixture(page, baseURL, policyMode = "enforce") {
  const [script, headers, files] = await Promise.all([bundle(), readV2Headers(), readdir(new URL("../../v2/dist/assets/", import.meta.url))]);
  if (policyMode === "report") headers["content-security-policy-report-only"] = headers["content-security-policy"];
  if (policyMode !== "enforce") delete headers["content-security-policy"];
  const css = await readFile(new URL(`../../v2/dist/assets/${files.find((file) => file.endsWith(".css"))}`, import.meta.url));
  await page.route(`${baseURL}/viewer-fixture**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith(".js")) return route.fulfill({ contentType: "text/javascript; charset=utf-8", body: script });
    if (path.endsWith(".css")) return route.fulfill({ contentType: "text/css", body: css });
    return route.fulfill({ headers, contentType: "text/html; charset=utf-8", body: '<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="stylesheet" href="/viewer-fixture.css"><script defer src="/viewer-fixture.js"></script><title>Viewer fixture</title></head><body></body></html>' });
  });
  await page.route(`${baseURL}/preview.webp`, (route) => route.fulfill({ contentType: "image/webp", path: fileURLToPath(new URL("../../v2/src/media/assets/fuji-480.webp", import.meta.url)) }));
  await page.goto(`${baseURL}/viewer-fixture`);
}
