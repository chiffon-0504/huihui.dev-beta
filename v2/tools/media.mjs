import { readFile, writeFile, realpath } from "node:fs/promises";
import { createHash, createHmac } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isAbsolute, relative, resolve } from "node:path";

export const ids = ["fuji", "tsutenkaku", "shiba"];
export const origin = "https://assets-beta.huihui.dev";
export const bucket = "huihui-v2-media-beta";
export const cacheControl = "public, max-age=31536000, immutable";
const root = fileURLToPath(new URL("../../", import.meta.url));
export const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

// Authoring dependency only; never install implicitly or import into the client.
export function imageCodec() {
  assert(process.env.MEDIA_NODE_MODULES, "Set MEDIA_NODE_MODULES to an existing authoring runtime containing sharp");
  return createRequire(pathToFileURL(resolve(process.env.MEDIA_NODE_MODULES, "package.json")))("sharp");
}

export async function inspect(bytes, sharp) {
  assert(bytes[0] === 0xff && bytes[1] === 0xd8, "Expected JPEG signature");
  const metadata = await sharp(bytes, { failOn: "warning" }).metadata();
  assert(metadata.format === "jpeg", "Expected JPEG format");
  // Full decode is mandatory. Metadata presence is never a failure condition.
  const { info } = await sharp(bytes, { failOn: "warning" }).rotate().raw().toBuffer({ resolveWithObject: true });
  return { mime: "image/jpeg", width: info.width, height: info.height, bytes: bytes.length,
    sha256: hash(bytes), encodedWidth: metadata.width, encodedHeight: metadata.height,
    orientation: metadata.orientation ?? 1, megapixels: info.width * info.height / 1_000_000,
    photographicMetadataPresent: Boolean(metadata.exif || metadata.xmp || metadata.iptc) };
}

export function descriptor(id, info) {
  assert(ids.includes(id), "Unapproved pilot identity");
  const { mime, width, height, bytes, sha256 } = info;
  assert(mime === "image/jpeg" && /^[a-f0-9]{64}$/.test(sha256)
    && [width, height, bytes].every((n) => Number.isSafeInteger(n) && n > 0), "Invalid JPEG descriptor");
  return { url: `${origin}/photos/${id}-${sha256}.jpg`, mime, width, height, bytes, sha256 };
}

export async function verifyResponse(response, expected, sharp) {
  assert(response.status === 200 && !response.redirected, "Object must return HTTP 200 without redirects");
  assert(response.headers.get("content-type")?.trim().toLowerCase() === "image/jpeg", "Incorrect object MIME");
  assert(response.headers.get("cache-control") === cacheControl, "Incorrect immutable cache policy");
  assert(!response.headers.get("content-encoding"), "Unexpected encoded response");
  const length = response.headers.get("content-length");
  assert(length === null || /^\d+$/.test(length) && Number(length) === expected.bytes, "Incorrect Content-Length");
  const bytes = Buffer.from(await response.arrayBuffer());
  assert(bytes.length === expected.bytes && hash(bytes) === expected.sha256, "Object bytes differ from source JPEG");
  const actual = await inspect(bytes, sharp);
  assert(actual.width === expected.width && actual.height === expected.height, "Incorrect decoded dimensions");
  return { sha256: actual.sha256, bytes: actual.bytes, width: actual.width, height: actual.height,
    contentType: response.headers.get("content-type"), cacheControl: response.headers.get("cache-control"),
    cacheStatus: response.headers.get("cf-cache-status"), status: response.status };
}

export async function verifyPublic(expected, sharp, request = fetch) {
  const id = ids.find((id) => expected.url === descriptor(id, expected).url);
  assert(id, "Unapproved public object URL");
  const response = await request(expected.url, { redirect: "error", signal: AbortSignal.timeout(120_000) });
  assert(response.url === expected.url, "Unexpected public response URL");
  return verifyResponse(response, expected, sharp);
}

// Minimal S3 SigV4 transport. Credentials are read only inside the publish action.
// No credential, Authorization header, response body or raw network error is logged.
export async function s3Request(method, key, body, request = fetch) {
  const account = process.env.R2_BETA_ACCOUNT_ID;
  const access = process.env.R2_BETA_ACCESS_KEY_ID;
  const secret = process.env.R2_BETA_SECRET_ACCESS_KEY;
  assert(/^[a-f0-9]{32}$/.test(account ?? "") && access && secret, "Beta publishing credentials unavailable");
  assert(/^photos\/(fuji|tsutenkaku|shiba)-[a-f0-9]{64}\.jpg$/.test(key), "Unapproved object key");
  assert(method === "GET" || method === "PUT", "Unsupported publication operation");
  const host = `${account}.r2.cloudflarestorage.com`;
  const path = `/${bucket}/${key}`;
  const date = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = date.slice(0, 8);
  const headers = { host, "x-amz-date": date, "x-amz-content-sha256": hash(body ?? Buffer.alloc(0)) };
  if (method === "PUT") Object.assign(headers, { "content-type": "image/jpeg", "cache-control": cacheControl, "if-none-match": "*" });
  const names = Object.keys(headers).sort();
  const signed = names.join(";");
  const canonical = [method, path, "", names.map((name) => `${name}:${headers[name]}\n`).join(""), signed, headers["x-amz-content-sha256"]].join("\n");
  const scope = `${day}/auto/s3/aws4_request`;
  const hmac = (key, data) => createHmac("sha256", key).update(data).digest();
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secret}`, day), "auto"), "s3"), "aws4_request");
  const signature = hmac(signingKey, `AWS4-HMAC-SHA256\n${date}\n${scope}\n${hash(canonical)}`).toString("hex");
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${access}/${scope}, SignedHeaders=${signed}, Signature=${signature}`;
  return request(`https://${host}${path}`, { method, headers, body, redirect: "error", signal: AbortSignal.timeout(120_000) });
}

export async function publish(bytes, expected, sharp, transport = s3Request, verify = verifyPublic) {
  assert(hash(bytes) === expected.sha256 && bytes.length === expected.bytes, "Source changed before publication");
  const key = new URL(expected.url).pathname.slice(1);
  const existing = await transport("GET", key);
  if (existing.status === 200) await verifyResponse(existing, expected, sharp);
  else {
    assert(existing.status === 404, "Cannot establish object absence; publication stopped");
    const result = await transport("PUT", key, bytes);
    // A concurrent writer never grants overwrite permission; read and verify.
    assert(result.status === 200 || result.status === 412, "Conditional upload failed");
    await verifyResponse(await transport("GET", key), expected, sharp);
  }
  return verify(expected, sharp);
}

async function main() {
  const [action, ...args] = process.argv.slice(2);
  assert(["prepare", "publish", "activate"].includes(action) && args.length === 6, "Usage: media.mjs prepare|publish|activate --fuji <external JPG> --tsutenkaku <external JPG> --shiba <external JPG>");
  const inputs = new Map();
  for (let i = 0; i < args.length; i += 2) {
    const id = args[i].slice(2);
    assert(args[i] === `--${id}` && ids.includes(id) && !inputs.has(id), "Supply exactly the three pilot inputs");
    inputs.set(id, args[i + 1]);
  }
  const sharp = imageCodec();
  const inventoryText = action === "prepare" ? null : await readFile(new URL("../src/media/pilot-sources.ts", import.meta.url), "utf8");
  const inventory = inventoryText ? JSON.parse(inventoryText.slice(inventoryText.indexOf("= ") + 2, inventoryText.lastIndexOf(" as const;"))) : null;
  const sources = {};
  const active = {};
  for (const id of ids) {
    const path = await realpath(inputs.get(id));
    const fromRepo = relative(await realpath(root), path);
    assert(isAbsolute(fromRepo) || fromRepo.startsWith(".."), "Source JPEG must remain outside the repository");
    const bytes = await readFile(path);
    const info = await inspect(bytes, sharp);
    const candidate = descriptor(id, info);
    if (inventory) {
      const prepared = inventory[id];
      assert(prepared && ["sha256", "bytes", "width", "height"].every((field) => prepared[field] === info[field]), "Source differs from prepared preview inventory");
      for (const variant of prepared.variants) {
        assert(variant.file === `${id}-${variant.width}.webp`, "Invalid preview filename");
        const preview = await readFile(new URL(`../src/media/assets/${variant.file}`, import.meta.url));
        assert(hash(preview) === variant.sha256 && preview.length === variant.bytes, "Preview differs from prepared inventory");
        await sharp(preview, { failOn: "warning" }).raw().toBuffer();
      }
    }
    if (action === "prepare") {
      const variants = [];
      for (const width of [480, 800, 1200]) {
        const { data, info: dimensions } = await sharp(bytes, { failOn: "warning" }).rotate()
          .resize({ width, withoutEnlargement: true, kernel: "lanczos3" }).webp({ quality: 80, effort: 6 })
          .toBuffer({ resolveWithObject: true });
        await sharp(data, { failOn: "warning" }).raw().toBuffer();
        const file = `${id}-${width}.webp`;
        await writeFile(new URL(`../src/media/assets/${file}`, import.meta.url), data);
        variants.push({ file, width: dimensions.width, height: dimensions.height, bytes: data.length, sha256: hash(data) });
      }
      sources[id] = { ...info, objectKey: new URL(candidate.url).pathname.slice(1), variants };
    } else {
      const report = action === "publish" ? await publish(bytes, candidate, sharp) : await verifyPublic(candidate, sharp);
      active[id] = candidate;
      console.log(JSON.stringify({ id, ...report }));
    }
    assert(hash(await readFile(path)) === info.sha256, "Source changed during operation");
  }
  if (action === "prepare") {
    await writeFile(new URL("../src/media/pilot-sources.ts", import.meta.url),
      `// Generated by the offline prepare action. No source paths or credentials.\nexport const pilotSources = ${JSON.stringify(sources, null, 2)} as const;\n`);
    console.log(JSON.stringify({ encoder: sharp.versions, sources }, null, 2));
  }
  if (action === "activate") {
    await writeFile(new URL("../src/media/published.ts", import.meta.url),
      `import type { HighResolution } from "./types";\nimport type { PhotoId } from "./high-resolution";\n\n// Public JPEG bytes verified before activation.\nexport const verifiedHighResolution: Partial<Record<PhotoId, HighResolution>> = ${JSON.stringify(active, null, 2)};\n`);
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(() => { console.error("Media action failed; no activation completed. Check inputs, codec, credentials and verified beta configuration. No automatic retry."); process.exitCode = 1; });
}
