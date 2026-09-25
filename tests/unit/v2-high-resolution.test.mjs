import { readFile } from "node:fs/promises";
import { expect, test, vi } from "vitest";
import { validateHighResolution, fileSizeLabel } from "../../v2/src/media/high-resolution.ts";
import { pilotSources } from "../../v2/src/media/pilot-sources.ts";
import { workImages } from "../../v2/src/media/works.ts";
import { verifiedHighResolution } from "../../v2/src/media/published.ts";
import { descriptor, hash, verifyResponse, verifyPublic, publish, s3Request, cacheControl } from "../../v2/tools/media.mjs";

test("the verified pilot activates exactly the three approved photos", () => {
  expect(Object.keys(verifiedHighResolution).sort()).toEqual(["fuji", "shiba", "tsutenkaku"]);
  for (const [id, source] of Object.entries(pilotSources)) {
    expect(verifiedHighResolution[id]).toEqual(descriptor(id, source));
    expect(workImages[id].highResolution).toEqual(verifiedHighResolution[id]);
  }
});

test.each(Object.entries(pilotSources))("%s has an immutable beta descriptor and verified Pages previews", async (id, source) => {
  const candidate = descriptor(id, source);
  expect(validateHighResolution(candidate, id)).toEqual(candidate);
  expect(source.objectKey).toBe(new URL(candidate.url).pathname.slice(1));
  expect(workImages[id].id).toBe(id);
  expect(workImages[id].sources.map((item) => item.width)).toEqual([480, 800, 1200]);
  for (const variant of source.variants) {
    const bytes = await readFile(new URL(`../../v2/src/media/assets/${variant.file}`, import.meta.url));
    expect(bytes.length).toBe(variant.bytes);
    expect(hash(bytes)).toBe(variant.sha256);
    expect(variant.width / variant.height).toBeCloseTo(source.width / source.height, 2);
    expect(variant.width).toBeLessThanOrEqual(source.width);
  }
  expect(workImages[id].src).not.toMatch(/^https?:/);
  if (verifiedHighResolution[id]) expect(verifiedHighResolution[id]).toEqual(candidate);
});

const candidate = descriptor("fuji", pilotSources.fuji);
test.each([
  { url: candidate.url.replace("assets-beta", "assets") },
  { url: candidate.url.replace("huihui.dev", "huihui.dev.evil.test") },
  { url: `${candidate.url}?v=1` }, { url: `${candidate.url}#fragment` },
  { url: candidate.url.replace("photos/fuji-", "photos/../fuji-") },
  { url: candidate.url.replace("https:", "http:") },
  { url: "https://assets-beta.huihui.dev/photos/latest.jpg" },
  { mime: "image/webp" }, { sha256: "a" }, { bytes: 0 }, { bytes: 1.5 },
  { width: NaN }, { height: undefined },
])("rejects invalid descriptor %j", (change) => {
  expect(() => validateHighResolution({ ...candidate, ...change }, "fuji")).toThrow();
});
test("descriptor binds the pilot identity and discloses decimal MB", () => {
  expect(() => validateHighResolution(candidate, "shiba")).toThrow();
  expect(() => descriptor("yokohama", pilotSources.fuji)).toThrow();
  expect(fileSizeLabel(pilotSources.shiba.bytes)).toBe("3.3 MB");
});

// Deliberately synthetic transport bytes; the codec double isolates HTTP/hash behavior.
const bytes = Buffer.from([255, 216, 255, 217]);
const expected = descriptor("fuji", { mime: "image/jpeg", width: 2, height: 3, bytes: bytes.length, sha256: hash(bytes) });
const codec = () => ({ metadata: async () => ({ format: "jpeg", width: 2, height: 3 }),
  rotate: () => ({ raw: () => ({ toBuffer: async () => ({ info: { width: 2, height: 3 } }) }) }) });
const response = (options = {}) => new Response(options.body ?? bytes, { status: options.status ?? 200,
  headers: { "content-type": "image/jpeg", "cache-control": cacheControl, ...options.headers } });

test("byte validation accepts the exact source, with or without Content-Length", async () => {
  expect((await verifyResponse(response(), expected, codec)).sha256).toBe(expected.sha256);
  await expect(verifyResponse(response({ headers: { "content-length": "4" } }), expected, codec)).resolves.toBeDefined();
});
test.each([
  { status: 302 }, { status: 404 }, { headers: { "content-type": "text/html" } },
  { headers: { "cache-control": "no-store" } }, { headers: { "content-length": "5" } },
  { headers: { "content-length": "invalid" } }, { headers: { "content-encoding": "gzip" } },
  { body: Buffer.from([255, 216, 0, 217]) },
])("public object verification fails closed: %j", async (options) => {
  await expect(verifyResponse(response(options), expected, codec)).rejects.toThrow();
});
test("decode and dimension failures remain fatal", async () => {
  await expect(verifyResponse(response(), expected, () => { throw Error("decode failed"); })).rejects.toThrow();
  await expect(verifyResponse(response(), { ...expected, width: 4 }, codec)).rejects.toThrow();
});
test("public verifier rejects redirects and arbitrary origins before requesting", async () => {
  const request = vi.fn();
  await expect(verifyPublic({ ...expected, url: expected.url + "?version=1" }, codec, request)).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
  request.mockResolvedValue({ ...response(), url: expected.url + "/" });
  await expect(verifyPublic(expected, codec, request)).rejects.toThrow();
  expect(request.mock.calls[0][1].redirect).toBe("error");
});
test("existing conflicts and ambiguous absence never upload", async () => {
  for (const first of [response({ body: Buffer.from([255, 216, 0, 217]) }), response({ status: 403 })]) {
    const transport = vi.fn().mockResolvedValue(first);
    await expect(publish(bytes, expected, codec, transport)).rejects.toThrow();
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][0]).toBe("GET");
  }
});
test("S3 publication uses conditional PUT, immutable headers and no redirects", async () => {
  vi.stubEnv("R2_BETA_ACCOUNT_ID", "a".repeat(32));
  vi.stubEnv("R2_BETA_ACCESS_KEY_ID", "synthetic-test-key");
  vi.stubEnv("R2_BETA_SECRET_ACCESS_KEY", "synthetic-test-secret");
  try {
    const request = vi.fn().mockResolvedValue(response());
    await s3Request("PUT", new URL(expected.url).pathname.slice(1), bytes, request);
    const [url, options] = request.mock.calls[0];
    expect(url).toContain("/huihui-v2-media-beta/photos/fuji-");
    expect(options.redirect).toBe("error");
    expect(options.headers["if-none-match"]).toBe("*");
    expect(options.headers["cache-control"]).toBe(cacheControl);
    expect(options.body).toBe(bytes);
    await expect(s3Request("DELETE", new URL(expected.url).pathname.slice(1))).rejects.toThrow();
  } finally { vi.unstubAllEnvs(); }
});

test("identical existing objects are reused and new objects are verified before public verification", async () => {
  for (const exists of [true, false]) {
    const transport = vi.fn();
    if (exists) transport.mockResolvedValueOnce(response());
    else transport.mockResolvedValueOnce(response({ status: 404 })).mockResolvedValueOnce(response()).mockResolvedValueOnce(response());
    const verify = vi.fn().mockResolvedValue({ verified: true });
    await publish(bytes, expected, codec, transport, verify);
    expect(transport.mock.calls.map(([method]) => method)).toEqual(exists ? ["GET"] : ["GET", "PUT", "GET"]);
    expect(verify).toHaveBeenCalledExactlyOnceWith(expected, codec);
    expect(verify.mock.invocationCallOrder[0]).toBeGreaterThan(transport.mock.invocationCallOrder.at(-1));
  }
});

test("only beta img-src expands; all unrelated policy directives are pinned", async () => {
  const headers = await readFile(new URL("../../v2/public/_headers", import.meta.url), "utf8");
  const policy = headers.match(/Content-Security-Policy: (.+)/)[1];
  expect(policy).toBe("default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://assets-beta.huihui.dev; connect-src 'self' https://huihui-api-beta.huihuigames01.workers.dev; frame-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'none';");
});
