function decodeHtml(text) {
  return String(text)
    .replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function cleanUrl(url) {
  try {
    const parsedUrl = new URL(decodeHtml(url || "").trim());

    if (parsedUrl.protocol !== "https:") {
      return "";
    }

    parsedUrl.hash = "";
    return parsedUrl.href;
  } catch (error) {
    return "";
  }
}

function getFirstMatch(text, patterns, fallback = "") {
  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match?.[1]) {
      return decodeHtml(match[1].trim());
    }
  }

  return fallback;
}

function getEntryBlock(xml) {
  return (
    xml.match(/<item[\s\S]*?<\/item>/)?.[0] ||
    xml.match(/<entry[\s\S]*?<\/entry>/)?.[0] ||
    xml
  );
}

function getTitle(entry, fallback) {
  return getFirstMatch(
    entry,
    [
      /<title><!\[CDATA\[(.*?)\]\]><\/title>/,
      /<title[^>]*>([\s\S]*?)<\/title>/,
    ],
    fallback
  );
}

function getLink(entry, fallbackLink) {
  const atomLinks = [...entry.matchAll(/<link[^>]*href=["']([^"']+)["'][^>]*>/g)]
    .map((match) => match[1])
    .filter((url) => !url.includes("/feeds/"))
    .filter((url) => !url.includes("/comments/"))
    .filter((url) => !url.includes("#comment-form"));

  const atomLink = atomLinks.map(cleanUrl).find(Boolean);

  if (atomLink) {
    return atomLink;
  }

  const rssLink = getFirstMatch(entry, [/<link>(.*?)<\/link>/], fallbackLink);

  return cleanUrl(rssLink) || cleanUrl(fallbackLink);
}

const PRODUCTION_ALLOWED_ORIGINS = new Set([
  "https://huihui.dev",
  "https://www.huihui.dev",
]);

function isBetaSiteHostname(hostname) {
  const normalizedHostname = String(hostname).toLowerCase();

  return (
    normalizedHostname === "beta.huihui.dev" ||
    normalizedHostname === "huihuidev-beta.pages.dev" ||
    normalizedHostname.endsWith(".huihuidev-beta.pages.dev")
  );
}

function allowedCorsOrigin(request, env) {
  const origin = request.headers.get("Origin") || "";

  if (env?.WORKER_ENV !== "beta") {
    return PRODUCTION_ALLOWED_ORIGINS.has(origin) ? origin : "";
  }

  let originUrl;

  try {
    originUrl = new URL(origin);
  } catch (error) {
    return "";
  }

  if (
    originUrl.protocol !== "https:" ||
    originUrl.username ||
    originUrl.password ||
    originUrl.port ||
    originUrl.pathname !== "/" ||
    originUrl.search ||
    originUrl.hash ||
    originUrl.origin.toLowerCase() !== origin.toLowerCase()
  ) {
    return "";
  }

  return isBetaSiteHostname(originUrl.hostname) ? origin : "";
}

function applyCors(response, request, env) {
  response.headers.delete("Access-Control-Allow-Origin");

  const origin = allowedCorsOrigin(request, env);

  if (origin) {
    response.headers.set("Access-Control-Allow-Origin", origin);
  } else {
    response.headers.delete("Access-Control-Allow-Methods");
    response.headers.delete("Access-Control-Allow-Headers");
  }

  const vary = response.headers.get("Vary");
  const varyValues = vary
    ? vary.split(",").map((value) => value.trim().toLowerCase())
    : [];

  if (!varyValues.includes("origin")) {
    response.headers.set("Vary", vary ? `${vary}, Origin` : "Origin");
  }

  return response;
}

function jsonResponse(data, headers = {}, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

function methodNotAllowedResponse(allowedMethod) {
  return jsonResponse(
    { ok: false, error: "Method Not Allowed" },
    {
      Allow: allowedMethod,
      "Cache-Control": "no-store",
    },
    405
  );
}

async function handleReadOnlyRoute(request, handler) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        Allow: "GET, OPTIONS",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
    });
  }

  if (request.method !== "GET") {
    return methodNotAllowedResponse("GET, OPTIONS");
  }

  return handler();
}

export const TECH_NEWS_SOURCE_DEADLINE_MS = 5000;
export const APOD_ATTEMPT_DEADLINE_MS = 3000;
export const APOD_TOTAL_BUDGET_MS = 6000;
export const STEAM_UPSTREAM_DEADLINE_MS = 5000;
export const CONTACT_REQUEST_MAX_BYTES = 64 * 1024;
export const TECH_NEWS_RESPONSE_MAX_BYTES = 2 * 1024 * 1024;
export const APOD_RESPONSE_MAX_BYTES = 256 * 1024;
export const STEAM_RESPONSE_MAX_BYTES = 2 * 1024 * 1024;
export const TURNSTILE_RESPONSE_MAX_BYTES = 64 * 1024;

export class BodySizeLimitError extends Error {
  constructor() {
    super("Body size limit exceeded");
    this.name = "BodySizeLimitError";
  }
}

function contentLengthExceedsLimit(headers, maxBytes) {
  const value = headers.get("Content-Length");

  if (value === null || !/^\d+$/.test(value.trim())) {
    return false;
  }

  return Number(value) > maxBytes;
}

async function cancelBody(body) {
  if (!body) return;

  try {
    await body.cancel();
  } catch (error) {
    // Cancellation is best-effort; preserve the original body handling error.
  }
}

async function cancelReader(reader) {
  try {
    await reader.cancel();
  } catch (error) {
    // Cancellation is best-effort; preserve the original body handling error.
  }
}

async function readBodyBytesWithLimit(body, maxBytes) {
  if (!body) {
    return new Uint8Array();
  }

  const reader = body.getReader();
  const chunks = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      const chunk =
        value instanceof Uint8Array ? value : new Uint8Array(value);

      if (chunk.byteLength > maxBytes - totalBytes) {
        await cancelReader(reader);
        throw new BodySizeLimitError();
      }

      chunks.push(chunk);
      totalBytes += chunk.byteLength;
    }
  } catch (error) {
    if (!(error instanceof BodySizeLimitError)) {
      await cancelReader(reader);
    }

    throw error;
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
}

async function readResponseBytesWithLimit(response, maxBytes) {
  if (contentLengthExceedsLimit(response.headers, maxBytes)) {
    await cancelBody(response.body);
    throw new BodySizeLimitError();
  }

  return readBodyBytesWithLimit(response.body, maxBytes);
}

export async function readResponseTextWithLimit(response, maxBytes) {
  const bytes = await readResponseBytesWithLimit(response, maxBytes);
  return new TextDecoder().decode(bytes);
}

export async function readResponseJsonWithLimit(response, maxBytes) {
  const text = await readResponseTextWithLimit(response, maxBytes);
  return JSON.parse(text);
}

async function readRequestFormDataWithLimit(request, maxBytes) {
  if (contentLengthExceedsLimit(request.headers, maxBytes)) {
    await cancelBody(request.body);
    throw new BodySizeLimitError();
  }

  const bytes = await readBodyBytesWithLimit(request.body, maxBytes);
  const headers = new Headers(request.headers);
  headers.delete("Content-Length");
  const boundedRequest = new Request(request.url, {
    method: request.method,
    headers,
    body: bytes,
  });

  return boundedRequest.formData();
}

export class UpstreamDeadlineError extends Error {
  constructor() {
    super("Upstream request timed out");
    this.name = "UpstreamDeadlineError";
  }
}

export async function withUpstreamDeadline(timeoutMs, operation) {
  const controller = new AbortController();
  let didTimeout = false;
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      didTimeout = true;
      controller.abort();
      reject(new UpstreamDeadlineError());
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      operation(controller.signal),
      timeoutPromise,
    ]);
  } catch (error) {
    if (didTimeout && !(error instanceof UpstreamDeadlineError)) {
      throw new UpstreamDeadlineError();
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/* =========================
   Tech News
========================= */

const SOURCES = [
  {
    category: "AI",
    tag: "OpenAI",
    source: "OpenAI News",
    url: "https://openai.com/news/rss.xml",
    fallbackLink: "https://openai.com/news",
  },
  {
    category: "iOS",
    tag: "Apple",
    source: "Apple Developer News",
    url: "https://developer.apple.com/news/rss/news.rss",
    fallbackLink: "https://developer.apple.com/news/",
  },
  {
    category: "Android",
    tag: "Google",
    source: "Android Developers Blog",
    url: "https://android-developers.googleblog.com/feeds/posts/default",
    fallbackLink: "https://android-developers.googleblog.com/",
  },
];

function getTimeAgo(dateString) {
  const pastTime = new Date(dateString).getTime();

  if (!Number.isFinite(pastTime)) return "";

  const diffMs = Date.now() - pastTime;

  if (diffMs <= 0) return "just now";

  const diff = Math.floor(diffMs / 1000);

  const minutes = Math.floor(diff / 60);
  const hours = Math.floor(diff / 3600);
  const days = Math.floor(diff / 86400);

  if (minutes < 60) return `${minutes} mins ago`;
  if (hours < 24) return `${hours} hours ago`;
  return `${days} days ago`;
}

async function getTechNews() {
  return Promise.all(
    SOURCES.map(async (source) => {
      try {
        const xml = await withUpstreamDeadline(
          TECH_NEWS_SOURCE_DEADLINE_MS,
          async (signal) => {
            const res = await fetch(source.url, {
              headers: {
                "User-Agent": "huihui.dev tech-news worker",
              },
              signal,
            });

            if (!res.ok) {
              throw new Error(`Failed to fetch ${source.source}`);
            }

            return readResponseTextWithLimit(
              res,
              TECH_NEWS_RESPONSE_MAX_BYTES
            );
          }
        );
        const entry = getEntryBlock(xml);
        const link = getLink(entry, source.fallbackLink);
        const pubDate = getFirstMatch(entry, [
          /<pubDate>(.*?)<\/pubDate>/,
          /<updated>(.*?)<\/updated>/,
        ]);

        return {
          category: source.category,
          title: getTitle(entry, source.source),
          description: `最新來源：${source.source}`,
          tag: source.tag,
          source: source.source,
          timeAgo: pubDate ? getTimeAgo(pubDate) : "",
          link,
        };
      } catch (error) {
        return {
          category: source.category,
          title: source.source,
          description: "來源暫時無法讀取",
          tag: source.tag,
          source: source.source,
          timeAgo: "",
          link: cleanUrl(source.fallbackLink),
        };
      }
    })
  );
}

async function handleTechNews(request, env, ctx) {
  const cache = caches.default;
  const cacheKey = new Request(new URL(request.url).origin + "/api/tech-news?v3");

  const cachedResponse = await cache.match(cacheKey);

  if (cachedResponse) {
    const response = new Response(cachedResponse.body, cachedResponse);
    response.headers.set("X-Cache", "HIT");
    return response;
  }

  const techNews = await getTechNews();

  const response = jsonResponse(
    { ok: true, techNews },
    {
      "Cache-Control": "public, max-age=300",
      "X-Cache": "MISS",
    }
  );

  ctx.waitUntil(cache.put(cacheKey, response.clone()));

  return response;
}

/* =========================
   NASA APOD
========================= */

const NASA_APOD_URL = "https://api.nasa.gov/planetary/apod";
const APOD_CACHE_TTL_SECONDS = 60 * 60 * 12;
const APOD_LOOKBACK_DAYS = 7;

function formatUtcDate(daysBack = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysBack);

  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

async function fetchApodByDate(apiKey, dateString, deadlineMs) {
  return withUpstreamDeadline(deadlineMs, async (signal) => {
    const res = await fetch(
      `${NASA_APOD_URL}?api_key=${apiKey}&date=${dateString}&thumbs=true`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "huihui.dev apod worker",
        },
        signal,
      }
    );

    if (!res.ok) {
      throw new Error(`NASA APOD failed: ${res.status}`);
    }

    return readResponseJsonWithLimit(res, APOD_RESPONSE_MAX_BYTES);
  });
}

async function getApod(env) {
  const apiKey = env.NASA_API_KEY || "DEMO_KEY";
  const budgetStartedAt = Date.now();

  for (let daysBack = 0; daysBack <= APOD_LOOKBACK_DAYS; daysBack++) {
    const elapsedMs = Date.now() - budgetStartedAt;
    const remainingBudgetMs = APOD_TOTAL_BUDGET_MS - elapsedMs;

    if (remainingBudgetMs < APOD_ATTEMPT_DEADLINE_MS) {
      break;
    }

    const dateString = formatUtcDate(daysBack);

    try {
      const data = await fetchApodByDate(
        apiKey,
        dateString,
        APOD_ATTEMPT_DEADLINE_MS
      );

      if (data.media_type !== "image" || !data.url) {
        continue;
      }

      return {
        ok: true,
        source: "NASA APOD",
        title: data.title || "Astronomy Picture of the Day",
        date: data.date || dateString,
        explanation: data.explanation || "",
        mediaType: "image",
        imageUrl: data.url,
        originalUrl: data.hdurl || data.url || "https://apod.nasa.gov/apod/",
        copyright: data.copyright || "",
        fallback: daysBack > 0,
        fallbackReason: daysBack > 0 ? "today_apod_was_not_image" : "",
        daysBack,
      };
    } catch (error) {
      continue;
    }
  }

  throw new Error("No image APOD found in recent days");
}

function getFallbackApod() {
  return {
    ok: true,
    source: "NASA APOD",
    title: "Daily Space Inspiration",
    date: "",
    explanation: "NASA APOD is temporarily unavailable.",
    mediaType: "image",
    imageUrl: "/images/0001_hp.webp",
    originalUrl: "https://apod.nasa.gov/apod/",
    copyright: "",
    fallback: true,
    fallbackReason: "no_recent_image_found",
    daysBack: null,
  };
}

async function handleApod(request, env, ctx) {
  const cache = caches.default;
  const cacheKey = new Request(new URL(request.url).origin + "/api/apod-v2");

  const cachedResponse = await cache.match(cacheKey);

  if (cachedResponse) {
    const response = new Response(cachedResponse.body, cachedResponse);
    response.headers.set("X-Cache", "HIT");
    return response;
  }

  try {
    const apod = await getApod(env);

    const response = jsonResponse(apod, {
      "Cache-Control": `public, max-age=${APOD_CACHE_TTL_SECONDS}`,
      "X-Cache": "MISS",
    });

    ctx.waitUntil(cache.put(cacheKey, response.clone()));

    return response;
  } catch (error) {
    return jsonResponse(getFallbackApod(), {
      "Cache-Control": "public, max-age=3600",
      "X-Cache": "FALLBACK",
    });
  }
}

/* =========================
   Steam Library
========================= */

const STEAM_LIBRARY_CACHE_TTL_SECONDS = 60 * 60;
const STEAM_PUBLIC_APPIDS = [3418570, 2458530, 1829980, 1044620, 3682050];

function getSteamCoverUrl(appid) {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`;
}

async function getSteamLibrary(env) {
  if (!env.STEAM_API_KEY) {
    throw new Error("Missing STEAM_API_KEY");
  }

  if (!env.STEAM_ID) {
    throw new Error("Missing STEAM_ID");
  }

  const apiUrl =
    `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/` +
    `?key=${env.STEAM_API_KEY}` +
    `&steamid=${env.STEAM_ID}` +
    `&include_appinfo=true` +
    `&include_played_free_games=true` +
    `&format=json`;

  const data = await withUpstreamDeadline(
    STEAM_UPSTREAM_DEADLINE_MS,
    async (signal) => {
      const res = await fetch(apiUrl, {
        headers: {
          Accept: "application/json",
          "User-Agent": "huihui.dev steam library worker",
        },
        signal,
      });

      if (!res.ok) {
        throw new Error(`Steam API failed: ${res.status}`);
      }

      return readResponseJsonWithLimit(res, STEAM_RESPONSE_MAX_BYTES);
    }
  );
  const games = data.response?.games || [];

  return STEAM_PUBLIC_APPIDS
    .map((appid) => games.find((game) => game.appid === appid))
    .filter(Boolean)
    .map((game) => ({
      appid: game.appid,
      name: game.name,
      playtimeHours: Math.round(((game.playtime_forever || 0) / 60) * 10) / 10,
      coverUrl: getSteamCoverUrl(game.appid),
      capsuleUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appid}/header.jpg`,
      storeUrl: `https://store.steampowered.com/app/${game.appid}/`,
    }));
}

async function handleSteamLibrary(request, env, ctx) {
  const cache = caches.default;
  const cacheKey = new Request(
    new URL(request.url).origin + "/api/steam-library-v6"
  );

  const cachedResponse = await cache.match(cacheKey);

  if (cachedResponse) {
    const response = new Response(cachedResponse.body, cachedResponse);
    response.headers.set("X-Cache", "HIT");
    return response;
  }

  try {
    const games = await getSteamLibrary(env);

    const response = jsonResponse(
      {
        ok: true,
        source: "Steam",
        count: games.length,
        games,
      },
      {
        "Cache-Control": `public, max-age=${STEAM_LIBRARY_CACHE_TTL_SECONDS}`,
        "X-Cache": "MISS",
      }
    );

    ctx.waitUntil(cache.put(cacheKey, response.clone()));

    return response;
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        source: "Steam",
        message: "Steam library temporarily unavailable",
        games: [],
      },
      {
        "Cache-Control": "public, max-age=300",
        "X-Cache": "FALLBACK",
      },
      500
    );
  }
}

/* =========================
   Contact Form
========================= */

const CONTACT_FORM_CONTENT_TYPE_PATTERN =
  /^(?:multipart\/form-data|application\/x-www-form-urlencoded)(?:\s*;|$)/i;
const CONTACT_FIELD_LIMITS = Object.freeze({
  name: 100,
  email: 254,
  message: 5000,
  turnstileToken: 2048,
});
const CONTACT_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTACT_TURNSTILE_ACTION = "contact";
const TURNSTILE_TIMEOUT_MS = 5000;
const FORMSPREE_TIMEOUT_MS = 10000;
const TURNSTILE_ERROR_CODES = new Set([
  "missing-input-secret",
  "invalid-input-secret",
  "missing-input-response",
  "invalid-input-response",
  "bad-request",
  "timeout-or-duplicate",
  "internal-error",
]);

class ContactUpstreamTimeoutError extends Error {}

async function withContactUpstreamTimeout(timeoutMs, operation) {
  const controller = new AbortController();
  let didTimeout = false;
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      didTimeout = true;
      controller.abort();
      reject(new ContactUpstreamTimeoutError());
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      operation(controller.signal),
      timeoutPromise,
    ]);
  } catch (error) {
    if (didTimeout && !(error instanceof ContactUpstreamTimeoutError)) {
      throw new ContactUpstreamTimeoutError();
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function getTrimmedContactField(formData, name) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeTurnstileErrorCodes(errorCodes) {
  if (!Array.isArray(errorCodes)) {
    return [];
  }

  return errorCodes
    .filter(
      (code) =>
        typeof code === "string" &&
        TURNSTILE_ERROR_CODES.has(code)
    )
    .slice(0, 10);
}

function contactCorsHeaders() {
  return {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function contactJsonResponse(data, status = 200) {
  return jsonResponse(data, contactCorsHeaders(), status);
}

async function handleContact(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: contactCorsHeaders(),
    });
  }

  if (request.method !== "POST") {
    return contactJsonResponse(
      { ok: false, message: "Method Not Allowed" },
      405
    );
  }

  const requestOrigin = allowedCorsOrigin(request, env);

  if (!requestOrigin) {
    return contactJsonResponse(
      { ok: false, message: "Forbidden" },
      403
    );
  }

  const expectedTurnstileHostname = new URL(requestOrigin).hostname;

  const contentType = request.headers.get("Content-Type") || "";

  if (!CONTACT_FORM_CONTENT_TYPE_PATTERN.test(contentType)) {
    return contactJsonResponse(
      { ok: false, message: "Invalid request body" },
      400
    );
  }

  let formData;

  try {
    formData = await readRequestFormDataWithLimit(
      request,
      CONTACT_REQUEST_MAX_BYTES
    );
  } catch (error) {
    if (error instanceof BodySizeLimitError) {
      return contactJsonResponse(
        { ok: false, message: "Payload Too Large" },
        413
      );
    }

    return contactJsonResponse(
      { ok: false, message: "Invalid request body" },
      400
    );
  }

  const token = getTrimmedContactField(formData, "cf-turnstile-response");
  const name = getTrimmedContactField(formData, "name");
  const email = getTrimmedContactField(formData, "email");
  const message = getTrimmedContactField(formData, "message");

  if (!name || !email || !message) {
    return contactJsonResponse(
      { ok: false, message: "Missing required fields" },
      400
    );
  }

  if (!token) {
    return contactJsonResponse(
      { ok: false, message: "Missing Turnstile token" },
      400
    );
  }

  if (
    name.length > CONTACT_FIELD_LIMITS.name ||
    email.length > CONTACT_FIELD_LIMITS.email ||
    message.length > CONTACT_FIELD_LIMITS.message
  ) {
    return contactJsonResponse(
      { ok: false, message: "Contact field is too long" },
      400
    );
  }

  if (!CONTACT_EMAIL_PATTERN.test(email)) {
    return contactJsonResponse(
      { ok: false, message: "Invalid email address" },
      400
    );
  }

  if (token.length > CONTACT_FIELD_LIMITS.turnstileToken) {
    return contactJsonResponse(
      { ok: false, message: "Invalid Turnstile token" },
      400
    );
  }

  if (!env.TURNSTILE_SECRET_KEY || !env.FORMSPREE_ENDPOINT) {
    return contactJsonResponse(
      { ok: false, message: "Contact service unavailable" },
      500
    );
  }

  let verifyData;

  try {
    verifyData = await withContactUpstreamTimeout(
      TURNSTILE_TIMEOUT_MS,
      async (signal) => {
        const verifyRes = await fetch(
          "https://challenges.cloudflare.com/turnstile/v0/siteverify",
          {
            method: "POST",
            body: new URLSearchParams({
              secret: env.TURNSTILE_SECRET_KEY,
              response: token,
            }),
            signal,
          }
        );

        if (!verifyRes.ok) {
          throw new Error("Turnstile upstream response failed");
        }

        return readResponseJsonWithLimit(
          verifyRes,
          TURNSTILE_RESPONSE_MAX_BYTES
        );
      }
    );
  } catch (error) {
    return contactJsonResponse(
      {
        ok: false,
        message:
          error instanceof ContactUpstreamTimeoutError
            ? "Turnstile verification timed out"
            : "Turnstile verification unavailable",
      },
      error instanceof ContactUpstreamTimeoutError ? 504 : 502
    );
  }

  if (
    !verifyData ||
    typeof verifyData !== "object" ||
    typeof verifyData.success !== "boolean"
  ) {
    return contactJsonResponse(
      { ok: false, message: "Turnstile verification unavailable" },
      502
    );
  }

  if (
    !verifyData.success ||
    verifyData.action !== CONTACT_TURNSTILE_ACTION ||
    typeof verifyData.hostname !== "string" ||
    verifyData.hostname.toLowerCase() !== expectedTurnstileHostname
  ) {
    return contactJsonResponse(
      {
        ok: false,
        message: "Turnstile verification failed",
        errorCodes: sanitizeTurnstileErrorCodes(verifyData["error-codes"]),
      },
      403
    );
  }

  const forwardData = new FormData();
  forwardData.set("name", name);
  forwardData.set("email", email);
  forwardData.set("message", message);

  let forwardRes;

  try {
    forwardRes = await withContactUpstreamTimeout(
      FORMSPREE_TIMEOUT_MS,
      (signal) =>
        fetch(env.FORMSPREE_ENDPOINT, {
          method: "POST",
          headers: {
            Accept: "application/json",
          },
          body: forwardData,
          signal,
        })
    );
  } catch (error) {
    return contactJsonResponse(
      {
        ok: false,
        message:
          error instanceof ContactUpstreamTimeoutError
            ? "Contact form submission timed out"
            : "Failed to forward contact form",
      },
      error instanceof ContactUpstreamTimeoutError ? 504 : 502
    );
  }

  if (!forwardRes.ok) {
    return contactJsonResponse(
      { ok: false, message: "Failed to forward contact form" },
      502
    );
  }

  return contactJsonResponse(
    { ok: true, message: "Message sent" },
    200
  );
}

/* =========================
   Router
========================= */

async function routeRequest(request, env, ctx) {
  const url = new URL(request.url);

  if (url.pathname === "/api/tech-news") {
    return handleReadOnlyRoute(request, () =>
      handleTechNews(request, env, ctx)
    );
  }

  if (url.pathname === "/api/apod") {
    return handleReadOnlyRoute(request, () => handleApod(request, env, ctx));
  }

  if (url.pathname === "/api/steam-library") {
    return handleReadOnlyRoute(request, () =>
      handleSteamLibrary(request, env, ctx)
    );
  }

  if (url.pathname === "/api/contact") {
    return handleContact(request, env);
  }

  if (url.pathname.startsWith("/api/")) {
    return jsonResponse(
      { ok: false, error: "Not found" },
      { "Cache-Control": "no-store" },
      404
    );
  }

  return jsonResponse(
    {
      ok: true,
      message: "huihui.dev API",
      endpoints: [
        "/api/tech-news",
        "/api/apod",
        "/api/steam-library",
        "/api/contact",
      ],
    },
    {
      "Cache-Control": "no-store",
    }
  );
}

export default {
  async fetch(request, env, ctx) {
    let response;

    try {
      response = await routeRequest(request, env, ctx);
    } catch (error) {
      const url = new URL(request.url);
      const errorData = { ok: false, error: "Internal server error" };

      response =
        url.pathname === "/api/contact"
          ? contactJsonResponse(errorData, 500)
          : jsonResponse(errorData, {}, 500);
    }

    return applyCors(response, request, env);
  },
};
