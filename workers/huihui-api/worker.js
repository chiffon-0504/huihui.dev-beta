function decodeHtml(text) {
  return String(text)
    .replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (entity, hex, decimal) => {
      const codePoint = Number.parseInt(hex || decimal, hex ? 16 : 10);

      if (
        !Number.isInteger(codePoint) ||
        codePoint < 0 ||
        codePoint > 0x10ffff ||
        (codePoint >= 0xd800 && codePoint <= 0xdfff)
      ) {
        return entity;
      }

      return String.fromCodePoint(codePoint);
    });
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
    ""
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
export const INFRASTRUCTURE_STATUS_PROVIDER_DEADLINE_MS = 3500;
export const SYSTEM_STATUS_WEBSITE_DEADLINE_MS = 4000;
export const SYSTEM_STATUS_HISTORY_DEADLINE_MS = 4000;
export const SYSTEM_STATUS_INCIDENTS_DEADLINE_MS = 4000;
export const APOD_ATTEMPT_DEADLINE_MS = 3000;
export const APOD_TOTAL_BUDGET_MS = 6000;
export const STEAM_UPSTREAM_DEADLINE_MS = 5000;
export const CONTACT_REQUEST_MAX_BYTES = 64 * 1024;
export const TECH_NEWS_RESPONSE_MAX_BYTES = 2 * 1024 * 1024;
export const INFRASTRUCTURE_STATUS_RESPONSE_MAX_BYTES = 1024 * 1024;
export const SYSTEM_STATUS_WEBSITE_RESPONSE_MAX_BYTES = 256 * 1024;
export const SYSTEM_STATUS_HISTORY_RESPONSE_MAX_BYTES = 1024 * 1024;
export const SYSTEM_STATUS_INCIDENTS_RESPONSE_MAX_BYTES = 512 * 1024;
export const APOD_RESPONSE_MAX_BYTES = 256 * 1024;
export const STEAM_RESPONSE_MAX_BYTES = 2 * 1024 * 1024;
export const TURNSTILE_RESPONSE_MAX_BYTES = 64 * 1024;

export class BodySizeLimitError extends Error {
  constructor() {
    super("Body size limit exceeded");
    this.name = "BodySizeLimitError";
  }
}

class UpstreamHttpStatusError extends Error {
  constructor(httpStatus) {
    super("Upstream HTTP status failure");
    this.name = "UpstreamHttpStatusError";
    this.httpStatus = httpStatus;
  }
}

class UpstreamInvalidResponseError extends Error {
  constructor() {
    super("Invalid upstream response");
    this.name = "UpstreamInvalidResponseError";
  }
}

class WorkerConfigurationError extends Error {
  constructor() {
    super("Worker configuration failure");
    this.name = "WorkerConfigurationError";
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

function classifyUpstreamFailure(error) {
  if (error instanceof UpstreamHttpStatusError) {
    return { category: "http_status", httpStatus: error.httpStatus };
  }

  if (error instanceof UpstreamDeadlineError) {
    return { category: "timeout" };
  }

  if (error instanceof BodySizeLimitError) {
    return { category: "size_limit" };
  }

  if (error instanceof SyntaxError) {
    return { category: "parse" };
  }

  if (error instanceof UpstreamInvalidResponseError) {
    return { category: "invalid_response" };
  }

  return { category: "network" };
}

function createWorkerDiagnostic(
  event,
  route,
  upstream,
  category,
  httpStatus,
  attemptDayOffset
) {
  const diagnostic = { event, route, upstream, category };

  if (
    Number.isInteger(httpStatus) &&
    httpStatus >= 100 &&
    httpStatus <= 599
  ) {
    diagnostic.httpStatus = httpStatus;
  }

  if (
    upstream === "nasa_apod" &&
    Number.isInteger(attemptDayOffset) &&
    attemptDayOffset >= 0 &&
    attemptDayOffset <= APOD_LOOKBACK_DAYS
  ) {
    diagnostic.attemptDayOffset = attemptDayOffset;
  }

  return diagnostic;
}

function warnUpstreamFailure(route, upstream, error, attemptDayOffset) {
  const { category, httpStatus } = classifyUpstreamFailure(error);
  console.warn(
    createWorkerDiagnostic(
      "worker_upstream_failure",
      route,
      upstream,
      category,
      httpStatus,
      attemptDayOffset
    )
  );
}

function errorUpstreamFailure(route, upstream, error) {
  const { category, httpStatus } = classifyUpstreamFailure(error);
  console.error(
    createWorkerDiagnostic(
      "worker_upstream_failure",
      route,
      upstream,
      category,
      httpStatus
    )
  );
}

function errorConfigurationFailure(route, upstream) {
  console.error(
    createWorkerDiagnostic(
      "worker_configuration_failure",
      route,
      upstream,
      "missing_config"
    )
  );
}

function errorUnhandledFailure(route) {
  console.error(
    createWorkerDiagnostic(
      "worker_unhandled_failure",
      route,
      "worker",
      "unhandled"
    )
  );
}

function getDiagnosticRoute(pathname) {
  switch (pathname) {
    case "/api/tech-news":
    case "/api/infrastructure-status":
    case "/api/system-status":
    case "/api/system-status/history":
    case "/api/system-status/incidents":
    case "/api/health":
    case "/api/contact/health":
    case "/api/apod":
    case "/api/steam-library":
    case "/api/contact":
      return pathname;
    default:
      return "/api/unknown";
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
    upstream: "openai_rss",
    category: "OpenAI",
    tag: "News",
    source: "OpenAI News",
    url: "https://openai.com/news/rss.xml",
    fallbackLink: "https://openai.com/news",
  },
  {
    upstream: "anthropic_newsroom",
    category: "Anthropic",
    tag: "Newsroom",
    source: "Anthropic Newsroom",
    url: "https://www.anthropic.com/news",
    fallbackLink: "https://www.anthropic.com/news",
    format: "anthropic_newsroom",
  },
  {
    upstream: "apple_rss",
    category: "Apple",
    tag: "Developer",
    source: "Apple Developer News",
    url: "https://developer.apple.com/news/rss/news.rss",
    fallbackLink: "https://developer.apple.com/news/",
  },
];

function getAnthropicNewsroomItem(html, fallbackLink) {
  const candidates = [];
  const articlePattern =
    /<a\b[^>]*href=["'](\/news\/[^"'?#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(articlePattern)) {
    const articleBody = match[2];
    const publishedText = getFirstMatch(articleBody, [
      /<time\b[^>]*>([\s\S]*?)<\/time>/i,
    ]);
    const publishedAt = new Date(publishedText).getTime();
    const spanMatches = [
      ...articleBody.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/gi),
    ];

    if (!Number.isFinite(publishedAt) || spanMatches.length < 2) {
      continue;
    }

    const titleMarkup = spanMatches[spanMatches.length - 1][1];
    const title = decodeHtml(titleMarkup.replace(/<[^>]*>/g, "")).trim();
    const link = cleanUrl(new URL(match[1], fallbackLink).href);

    if (!title || !link) {
      continue;
    }

    candidates.push({ link, pubDate: publishedText, publishedAt, title });
  }

  candidates.sort((left, right) => right.publishedAt - left.publishedAt);
  return candidates[0] || null;
}

function getTechNewsSourceItem(source, body) {
  if (source.format === "anthropic_newsroom") {
    return getAnthropicNewsroomItem(body, source.fallbackLink);
  }

  const entry = getEntryBlock(body);

  if (!entry) {
    return null;
  }

  return {
    link: getLink(entry, source.fallbackLink),
    pubDate: getFirstMatch(entry, [
      /<pubDate>(.*?)<\/pubDate>/,
      /<updated>(.*?)<\/updated>/,
    ]),
    title: getTitle(entry, source.source),
  };
}

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
        const body = await withUpstreamDeadline(
          TECH_NEWS_SOURCE_DEADLINE_MS,
          async (signal) => {
            const res = await fetch(source.url, {
              headers: {
                Accept:
                  source.format === "anthropic_newsroom"
                    ? "text/html"
                    : "application/rss+xml, application/atom+xml, application/xml, text/xml",
                "User-Agent": "huihui.dev tech-news worker",
              },
              signal,
            });

            if (!res.ok) {
              throw new UpstreamHttpStatusError(res.status);
            }

            return readResponseTextWithLimit(
              res,
              TECH_NEWS_RESPONSE_MAX_BYTES
            );
          }
        );
        const item = getTechNewsSourceItem(source, body);

        if (!item) {
          throw new UpstreamInvalidResponseError();
        }

        return {
          category: source.category,
          title: item.title,
          description: `最新來源：${source.source}`,
          tag: source.tag,
          source: source.source,
          timeAgo: item.pubDate ? getTimeAgo(item.pubDate) : "",
          link: item.link,
        };
      } catch (error) {
        warnUpstreamFailure("/api/tech-news", source.upstream, error);
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
  const cacheKey = new Request(new URL(request.url).origin + "/api/tech-news?v4");

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
   Infrastructure Status
========================= */

const INFRASTRUCTURE_STATUS_CACHE_TTL_SECONDS = 60;
const INFRASTRUCTURE_STATUS_DEFINITIONS = Object.freeze([
  {
    id: "cloudflare",
    name: "Cloudflare",
    upstream: "cloudflare_status",
    apiUrl: "https://www.cloudflarestatus.com/api/v2/summary.json",
    statusUrl: "https://www.cloudflarestatus.com/",
    components: [
      { id: "pages", name: "Pages", upstreamName: "Pages" },
      { id: "workers", name: "Workers", upstreamName: "Workers" },
      { id: "dns", name: "DNS", upstreamName: "Authoritative DNS" },
      { id: "cdn", name: "CDN", upstreamName: "CDN/Cache" },
    ],
  },
  {
    id: "github",
    name: "GitHub",
    upstream: "github_status",
    apiUrl: "https://www.githubstatus.com/api/v2/summary.json",
    statusUrl: "https://www.githubstatus.com/",
    components: [
      { id: "actions", name: "Actions", upstreamName: "Actions" },
      {
        id: "api_requests",
        name: "API Requests",
        upstreamName: "API Requests",
      },
      {
        id: "git_operations",
        name: "Git Operations",
        upstreamName: "Git Operations",
      },
    ],
  },
]);
const INFRASTRUCTURE_STATUS_RANK = Object.freeze({
  operational: 0,
  under_maintenance: 1,
  degraded_performance: 2,
  partial_outage: 3,
  major_outage: 4,
});

function normalizeInfrastructureComponentStatus(value) {
  return Object.hasOwn(INFRASTRUCTURE_STATUS_RANK, value)
    ? value
    : "unknown";
}

function aggregateInfrastructureStatus(components) {
  if (components.some((component) => component.status === "unknown")) {
    return "unknown";
  }

  return components.reduce(
    (worst, component) =>
      INFRASTRUCTURE_STATUS_RANK[component.status] >
      INFRASTRUCTURE_STATUS_RANK[worst]
        ? component.status
        : worst,
    "operational"
  );
}

function unknownInfrastructureProvider(definition) {
  const components = definition.components.map((component) => ({
    id: component.id,
    name: component.name,
    status: "unknown",
  }));

  return {
    id: definition.id,
    name: definition.name,
    status: "unknown",
    url: definition.statusUrl,
    components,
  };
}

function normalizeInfrastructureProvider(definition, data) {
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    data.page?.name !== definition.name ||
    !Array.isArray(data.components)
  ) {
    throw new UpstreamInvalidResponseError();
  }

  let hasInvalidComponent = false;
  const components = definition.components.map((component) => {
    const matches = data.components.filter(
      (candidate) =>
        candidate &&
        typeof candidate === "object" &&
        !Array.isArray(candidate) &&
        candidate.name === component.upstreamName
    );
    const status =
      matches.length === 1
        ? normalizeInfrastructureComponentStatus(matches[0].status)
        : "unknown";

    if (matches.length !== 1 || status === "unknown") {
      hasInvalidComponent = true;
    }

    return {
      id: component.id,
      name: component.name,
      status,
    };
  });

  return {
    hasInvalidComponent,
    provider: {
      id: definition.id,
      name: definition.name,
      status: aggregateInfrastructureStatus(components),
      url: definition.statusUrl,
      components,
    },
  };
}

async function getInfrastructureProvider(definition) {
  try {
    const data = await withUpstreamDeadline(
      INFRASTRUCTURE_STATUS_PROVIDER_DEADLINE_MS,
      async (signal) => {
        const response = await fetch(definition.apiUrl, {
          headers: {
            Accept: "application/json",
            "User-Agent": "huihui.dev infrastructure-status worker",
          },
          signal,
        });

        if (!response.ok) {
          throw new UpstreamHttpStatusError(response.status);
        }

        return readResponseJsonWithLimit(
          response,
          INFRASTRUCTURE_STATUS_RESPONSE_MAX_BYTES
        );
      }
    );
    const normalized = normalizeInfrastructureProvider(definition, data);

    if (normalized.hasInvalidComponent) {
      warnUpstreamFailure(
        "/api/infrastructure-status",
        definition.upstream,
        new UpstreamInvalidResponseError()
      );
    }

    return normalized.provider;
  } catch (error) {
    warnUpstreamFailure(
      "/api/infrastructure-status",
      definition.upstream,
      error
    );
    return unknownInfrastructureProvider(definition);
  }
}

async function handleInfrastructureStatus(request, env, ctx) {
  const cache = caches.default;
  const cacheKey = new Request(
    new URL(request.url).origin + "/api/infrastructure-status?v2"
  );
  const cachedResponse = await cache.match(cacheKey);

  if (cachedResponse) {
    const response = new Response(cachedResponse.body, cachedResponse);
    response.headers.set("X-Cache", "HIT");
    return response;
  }

  const providers = await Promise.all(
    INFRASTRUCTURE_STATUS_DEFINITIONS.map(getInfrastructureProvider)
  );
  const isComplete = providers.every(
    (provider) => provider.status !== "unknown"
  );
  const response = jsonResponse(
    { ok: true, providers },
    {
      "Cache-Control": isComplete
        ? `public, max-age=${INFRASTRUCTURE_STATUS_CACHE_TTL_SECONDS}`
        : "no-store",
      "X-Cache": isComplete ? "MISS" : "BYPASS",
    }
  );

  if (isComplete) {
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
  }

  return response;
}

/* =========================
   huihui.dev System Status
========================= */

const SYSTEM_STATUS_RANK = Object.freeze({
  operational: 0,
  degraded_performance: 1,
  partial_outage: 2,
  major_outage: 3,
});
const SYSTEM_STATUS_WEBSITE_TARGETS = Object.freeze({
  production: "https://huihui.dev/",
  beta: "https://beta.huihui.dev/",
});
const SYSTEM_STATUS_WEBSITE_MARKER =
  /<link\s+rel=["']canonical["']\s+href=["']https:\/\/huihui\.dev\/["']\s*\/?>/i;
const SYSTEM_STATUS_COMPONENT_IDS = Object.freeze([
  "website",
  "api",
  "contact",
]);

export function aggregateSystemStatus(components) {
  if (components.some((component) => component.status === "unknown")) {
    return "unknown";
  }

  return components.reduce(
    (worst, component) =>
      SYSTEM_STATUS_RANK[component.status] > SYSTEM_STATUS_RANK[worst]
        ? component.status
        : worst,
    "operational"
  );
}

function systemStatusComponent(id, status) {
  return { id, status };
}

function getSystemStatusWebsiteTarget(env) {
  return env?.WORKER_ENV === "beta"
    ? SYSTEM_STATUS_WEBSITE_TARGETS.beta
    : SYSTEM_STATUS_WEBSITE_TARGETS.production;
}

async function checkSystemWebsite(env) {
  try {
    return await withUpstreamDeadline(
      SYSTEM_STATUS_WEBSITE_DEADLINE_MS,
      async (signal) => {
        const response = await fetch(getSystemStatusWebsiteTarget(env), {
          method: "GET",
          headers: {
            Accept: "text/html",
            "User-Agent": "huihui.dev system-status worker",
          },
          redirect: "manual",
          cache: "no-store",
          signal,
        });

        if (response.status !== 200) {
          warnUpstreamFailure(
            "/api/system-status",
            "system_website",
            new UpstreamHttpStatusError(response.status)
          );
          await cancelBody(response.body);
          return systemStatusComponent(
            "website",
            response.status >= 500 ? "major_outage" : "partial_outage"
          );
        }

        const contentType = response.headers.get("Content-Type") || "";
        const isHtml = contentType
          .split(";", 1)[0]
          .trim()
          .toLowerCase() === "text/html";
        const body = await readResponseTextWithLimit(
          response,
          SYSTEM_STATUS_WEBSITE_RESPONSE_MAX_BYTES
        );

        if (!isHtml || !SYSTEM_STATUS_WEBSITE_MARKER.test(body)) {
          warnUpstreamFailure(
            "/api/system-status",
            "system_website",
            new UpstreamInvalidResponseError()
          );
          return systemStatusComponent("website", "partial_outage");
        }

        return systemStatusComponent("website", "operational");
      }
    );
  } catch (error) {
    warnUpstreamFailure("/api/system-status", "system_website", error);
    return systemStatusComponent("website", "unknown");
  }
}

function createApiHealthPayload() {
  return {
    ok: true,
    status: "operational",
    scope: "worker_request_path",
  };
}

export function normalizeApiReadinessPayload(payload) {
  return payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    payload.ok === true &&
    payload.status === "operational" &&
    payload.scope === "worker_request_path"
    ? "operational"
    : "unknown";
}

function checkApiReadiness() {
  const status = normalizeApiReadinessPayload(createApiHealthPayload());

  if (status === "unknown") {
    warnUpstreamFailure(
      "/api/system-status",
      "system_api",
      new UpstreamInvalidResponseError()
    );
  }

  return systemStatusComponent("api", status);
}

function isConfiguredSecret(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidContactEndpoint(value) {
  if (!isConfiguredSecret(value)) return false;

  try {
    const endpoint = new URL(value);
    return (
      endpoint.protocol === "https:" &&
      !endpoint.username &&
      !endpoint.password &&
      !endpoint.hash
    );
  } catch (error) {
    return false;
  }
}

function checkContactReadiness(env, diagnosticRoute = "/api/system-status") {
  const hasTurnstileSecret = isConfiguredSecret(env?.TURNSTILE_SECRET_KEY);
  const hasFormspreeEndpoint = isConfiguredSecret(env?.FORMSPREE_ENDPOINT);

  if (!hasTurnstileSecret || !hasFormspreeEndpoint) {
    errorConfigurationFailure(diagnosticRoute, "contact_readiness");
    return systemStatusComponent("contact", "unknown");
  }

  if (!isValidContactEndpoint(env.FORMSPREE_ENDPOINT)) {
    warnUpstreamFailure(
      diagnosticRoute,
      "contact_readiness",
      new UpstreamInvalidResponseError()
    );
    return systemStatusComponent("contact", "unknown");
  }

  return systemStatusComponent("contact", "operational");
}

function handleApiHealth() {
  return jsonResponse({ ok: true, service: "huihui-api" }, {
    "Cache-Control": "no-store",
  });
}

function handleContactHealth() {
  return jsonResponse({ ok: true, service: "contact" }, {
    "Cache-Control": "no-store",
  });
}

async function handleSystemStatus(env) {
  const components = await Promise.all([
    checkSystemWebsite(env),
    Promise.resolve(checkApiReadiness()),
    Promise.resolve(checkContactReadiness(env)),
  ]);

  return jsonResponse(
    {
      ok: true,
      status: aggregateSystemStatus(components),
      components: SYSTEM_STATUS_COMPONENT_IDS.map((id) =>
        components.find((component) => component.id === id)
      ),
      checkedAt: new Date().toISOString(),
    },
    { "Cache-Control": "no-store" }
  );
}

/* =========================
   Independent System Status history (Better Stack public JSON)
========================= */

const SYSTEM_STATUS_HISTORY_ROUTE = "/api/system-status/history";
const SYSTEM_STATUS_HISTORY_UPSTREAM = "better_stack_status_page";
const SYSTEM_STATUS_HISTORY_WINDOW_DAYS = 90;
const SYSTEM_STATUS_HISTORY_CACHE_TTL_SECONDS = 60;
const BETTER_STACK_RESOURCES = Object.freeze([
  { id: "website", publicName: "Website" },
  { id: "api", publicName: "API" },
  { id: "contact", publicName: "Contact Service" },
]);
const BETTER_STACK_CURRENT_STATUS_MAP = Object.freeze({
  operational: "operational",
  degraded: "degraded_performance",
  downtime: "major_outage",
  maintenance: "unknown",
  not_monitored: "unknown",
});

function isBetterStackCurrentStatus(value) {
  return typeof value === "string" && Object.hasOwn(BETTER_STACK_CURRENT_STATUS_MAP, value);
}

function isBetterStackHistoryStatus(value) {
  return isBetterStackCurrentStatus(value) || value === "recovered";
}

export function normalizeBetterStackAvailability(value) {
  if (!Number.isFinite(value) || value < 0 || value > 100) return null;
  return value <= 1 ? value * 100 : value;
}

function getBetterStackStatusPageUrl(env) {
  const value = env?.BETTER_STACK_STATUS_PAGE_JSON_URL;

  if (typeof value !== "string" || !value.trim()) {
    errorConfigurationFailure(SYSTEM_STATUS_HISTORY_ROUTE, SYSTEM_STATUS_HISTORY_UPSTREAM);
    throw new WorkerConfigurationError();
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new UpstreamInvalidResponseError();
  }

  if (
    url.protocol !== "https:" ||
    url.username || url.password || url.hash || url.search ||
    url.pathname !== "/index.json"
  ) {
    throw new UpstreamInvalidResponseError();
  }

  return url.href;
}

function unknownSystemHistoryComponent({ id }) {
  return {
    id,
    status: "unknown",
    availabilityPercent: null,
    observedDays: 0,
    historyStartDate: null,
    historyEndDate: null,
    history: [],
  };
}

function normalizeBetterStackHistory(items) {
  if (!Array.isArray(items)) throw new UpstreamInvalidResponseError();

  const days = new Set();
  const history = items.map((item) => {
    if (
      !item || typeof item !== "object" || Array.isArray(item) ||
      typeof item.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(item.day) ||
      !Number.isFinite(Date.parse(`${item.day}T00:00:00.000Z`)) ||
      new Date(`${item.day}T00:00:00.000Z`).toISOString().slice(0, 10) !== item.day ||
      days.has(item.day) || !isBetterStackHistoryStatus(item.status) ||
      !Number.isFinite(item.downtime_duration) || item.downtime_duration < 0 ||
      !Number.isFinite(item.maintenance_duration) || item.maintenance_duration < 0
    ) {
      throw new UpstreamInvalidResponseError();
    }

    days.add(item.day);
    // Provider padding and paused days are unobserved, but still require full validation.
    if (item.status === "not_monitored") return null;
    // Observed in provider history only: recovery must not erase that day's downtime.
    const status = item.status === "recovered"
      ? (item.downtime_duration > 0 ? "major_outage" : "unknown")
      : BETTER_STACK_CURRENT_STATUS_MAP[item.status];
    return {
      date: item.day,
      status,
      downtimeSeconds: item.downtime_duration,
      maintenanceSeconds: item.maintenance_duration,
    };
  });

  // Validate every source record before filtering/trimming; never fill gaps or invent days.
  const observedHistory = history.filter((item) => item !== null);
  observedHistory.sort((left, right) => left.date.localeCompare(right.date));
  return observedHistory.slice(-SYSTEM_STATUS_HISTORY_WINDOW_DAYS);
}

function normalizeBetterStackStatusPage(data) {
  if (
    !data || typeof data !== "object" || Array.isArray(data) ||
    data.data?.type !== "status_page" || !Array.isArray(data.included)
  ) {
    throw new UpstreamInvalidResponseError();
  }

  let hasInvalidComponent = false;
  const components = BETTER_STACK_RESOURCES.map((definition) => {
    const matches = data.included.filter((item) =>
      item?.type === "status_page_resource" &&
      item.attributes?.public_name === definition.publicName
    );

    try {
      const attributes = matches[0]?.attributes;
      const availabilityPercent = normalizeBetterStackAvailability(attributes?.availability);
      if (
        matches.length !== 1 || attributes?.resource_type !== "Monitor" ||
        !isBetterStackCurrentStatus(attributes.status) || availabilityPercent === null
      ) {
        throw new UpstreamInvalidResponseError();
      }

      const history = normalizeBetterStackHistory(attributes.status_history);
      return {
        id: definition.id,
        status: BETTER_STACK_CURRENT_STATUS_MAP[attributes.status],
        availabilityPercent,
        observedDays: history.length,
        historyStartDate: history[0]?.date ?? null,
        historyEndDate: history.at(-1)?.date ?? null,
        history,
      };
    } catch {
      hasInvalidComponent = true;
      return unknownSystemHistoryComponent(definition);
    }
  });

  return { components, hasInvalidComponent };
}

function systemHistoryResponse(components) {
  const complete = components.every((component) =>
    component.status !== "unknown" && component.availabilityPercent !== null &&
    component.history.every((item) => item.status !== "unknown")
  );
  return jsonResponse(
    {
      ok: complete,
      source: "better_stack",
      complete,
      windowDays: SYSTEM_STATUS_HISTORY_WINDOW_DAYS,
      components: components.map((component) => ({
        ...component,
        availabilityPercent: component.availabilityPercent === null
          ? null
          : Number(component.availabilityPercent.toFixed(8)),
      })),
      // Fetch completion time, not a monitor check time or status-page updated_at.
      fetchedAt: new Date().toISOString(),
    },
    {
      "Cache-Control": complete
        ? `public, max-age=${SYSTEM_STATUS_HISTORY_CACHE_TTL_SECONDS}`
        : "no-store",
      "X-Cache": complete ? "MISS" : "BYPASS",
    }
  );
}

async function handleSystemStatusHistory(request, env, ctx) {
  try {
    // Validate configuration before cache lookup, and isolate caches by configuration.
    const upstreamUrl = getBetterStackStatusPageUrl(env);
    const cache = caches.default;
    const cacheKey = new Request(
      new URL(request.url).origin + SYSTEM_STATUS_HISTORY_ROUTE +
      "?v1&source=" + encodeURIComponent(upstreamUrl)
    );
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      const response = new Response(cachedResponse.body, cachedResponse);
      response.headers.set("X-Cache", "HIT");
      return response;
    }

    const data = await withUpstreamDeadline(
      SYSTEM_STATUS_HISTORY_DEADLINE_MS,
      async (signal) => {
        const response = await fetch(upstreamUrl, {
          method: "GET",
          headers: {
            Accept: "application/json",
            "User-Agent": "huihui.dev system-status-history worker",
          },
          redirect: "manual",
          // Workers have no browser credentials mode; never copy inbound headers.
          cache: "no-store",
          signal,
        });
        if (!response.ok) {
          await cancelBody(response.body);
          throw new UpstreamHttpStatusError(response.status);
        }
        return readResponseJsonWithLimit(response, SYSTEM_STATUS_HISTORY_RESPONSE_MAX_BYTES);
      }
    );
    const { components, hasInvalidComponent } = normalizeBetterStackStatusPage(data);
    if (hasInvalidComponent) {
      warnUpstreamFailure(
        SYSTEM_STATUS_HISTORY_ROUTE,
        SYSTEM_STATUS_HISTORY_UPSTREAM,
        new UpstreamInvalidResponseError()
      );
    }

    const response = systemHistoryResponse(components);
    if (response.headers.get("X-Cache") === "MISS") {
      ctx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => {
        errorUnhandledFailure(SYSTEM_STATUS_HISTORY_ROUTE);
      }));
    }
    return response;
  } catch (error) {
    if (!(error instanceof WorkerConfigurationError)) {
      warnUpstreamFailure(SYSTEM_STATUS_HISTORY_ROUTE, SYSTEM_STATUS_HISTORY_UPSTREAM, error);
    }
    return systemHistoryResponse(BETTER_STACK_RESOURCES.map(unknownSystemHistoryComponent));
  }
}

/* =========================
   Better Stack public incident updates (independent of current/daily status)
========================= */

const SYSTEM_STATUS_INCIDENTS_ROUTE = "/api/system-status/incidents";
const SYSTEM_STATUS_INCIDENTS_UPSTREAM = "better_stack_rss";
const SYSTEM_STATUS_INCIDENTS_CACHE_TTL_SECONDS = 60;
const INCIDENT_MAX_ITEMS = 512;
const INCIDENT_MAX_REPORTS = 20;
const INCIDENT_MAX_UPDATES = 20;
const INCIDENT_TITLE_MAX_LENGTH = 200;
const INCIDENT_MESSAGE_MAX_LENGTH = 4000;
const XML_ENTITIES = Object.freeze({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" });
const INCIDENT_HTML_ENTITIES = Object.freeze({
  ...XML_ENTITIES, nbsp: " ", copy: "©", reg: "®", trade: "™", ndash: "–", mdash: "—",
  hellip: "…", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", bull: "•", middot: "·",
  euro: "€", pound: "£", yen: "¥", ensp: " ", emsp: " ", thinsp: " ",
});

function assertIncident(condition) {
  if (!condition) throw new UpstreamInvalidResponseError();
}

function decodeIncidentEntities(value, html = false) {
  const entities = html ? INCIDENT_HTML_ENTITIES : XML_ENTITIES;
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);|&/gi, (entity, name) => {
    if (name?.startsWith("#")) {
      assertIncident(html || name[1] !== "X");
      const hex = name[1].toLowerCase() === "x";
      const point = Number.parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10);
      assertIncident(point === 9 || point === 10 || point === 13 ||
        (point >= 32 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) &&
          point !== 0xfffe && point !== 0xffff));
      return String.fromCodePoint(point);
    }
    if (Object.hasOwn(entities, name)) return entities[name];
    // HTML's unrecognized entities remain literal text. XML cannot invent entities.
    assertIncident(html);
    return entity;
  });
}

// A deliberately restricted XML 1.0 reader, not an HTML/RSS recovery parser.
// No DTDs, external entities, processing instructions, namespace rebinding or repairs.
function parseIncidentRss(xml) {
  assertIncident(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/u.test(xml));
  const document = { name: "#document", children: [], text: "" };
  const stack = [document];
  const token = /<!--(?:[^-]|-(?!-))*-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?xml[ \t\r\n]+version=(?:"1\.0"|'1\.0')(?:[ \t\r\n]+encoding=(?:"UTF-8"|'UTF-8'))?(?:[ \t\r\n]+standalone=(?:"(?:yes|no)"|'(?:yes|no)'))?[ \t\r\n]*\?>|<\/[A-Za-z_][\w.:-]*[ \t\r\n]*>|<[A-Za-z_][\w.:-]*(?:[ \t\r\n]+[A-Za-z_][\w.:-]*[ \t\r\n]*=[ \t\r\n]*(?:"[^"<]*"|'[^'<]*'))*[ \t\r\n]*\/?>|[^<]+/gy;
  let offset = 0;
  let nodes = 0;
  while (offset < xml.length) {
    token.lastIndex = offset;
    const match = token.exec(xml);
    assertIncident(match);
    const part = match[0];
    const parent = stack.at(-1);
    if (part.startsWith("<?")) {
      assertIncident(offset === 0);
    } else if (part.startsWith("<!--")) {
      // Comments carry no public data.
    } else if (part.startsWith("<![CDATA[")) {
      assertIncident(stack.length > 1);
      parent.text += part.slice(9, -3);
    } else if (part.startsWith("</")) {
      assertIncident(stack.length > 1 && part.slice(2, -1).trim() === parent.name);
      stack.pop();
    } else if (part.startsWith("<")) {
      const name = /^<([^\s/>]+)/.exec(part)[1];
      const attributes = Object.create(null);
      for (const attribute of part.matchAll(/([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
        assertIncident(!Object.hasOwn(attributes, attribute[1]));
        assertIncident(!attribute[1].includes(":") || ["xmlns:atom", "xml:lang"].includes(attribute[1]));
        attributes[attribute[1]] = decodeIncidentEntities(attribute[2] ?? attribute[3]);
        assertIncident(!attribute[1].startsWith("xmlns") ||
          (name === "rss" && stack.length === 1 && attribute[1] === "xmlns:atom" &&
            attributes[attribute[1]] === "http://www.w3.org/2005/Atom"));
      }
      assertIncident(!name.includes(":") || (name === "atom:link" &&
        document.children[0]?.attributes["xmlns:atom"] === "http://www.w3.org/2005/Atom"));
      assertIncident(++nodes <= 8192 && stack.length <= 16);
      const node = { name, attributes, children: [], text: "" };
      parent.children.push(node);
      if (!part.endsWith("/>")) stack.push(node);
    } else {
      assertIncident(!part.includes("]]>"));
      parent.text += decodeIncidentEntities(part);
    }
    offset = token.lastIndex;
  }
  assertIncident(stack.length === 1 && /^[ \t\r\n]*$/.test(document.text) && document.children.length === 1);
  const rss = document.children[0];
  assertIncident(rss.name === "rss" && rss.attributes.version === "2.0" &&
    !rss.text.trim() && rss.children.length === 1 && rss.children[0].name === "channel");
  const channel = rss.children[0];
  assertIncident(!channel.text.trim());
  const items = channel.children.filter((node) => node.name === "item");
  assertIncident(items.length <= INCIDENT_MAX_ITEMS);
  // Unknown metadata may be ignored only if it cannot conceal nested feed items.
  function validatePlacement(node, parentName) {
    if (node.name === "item") assertIncident(parentName === "channel" && channel.children.includes(node));
    for (const child of node.children) validatePlacement(child, node.name);
  }
  validatePlacement(rss, "#document");
  return { channel, items };
}

function incidentRssField(node, name) {
  const fields = node.children.filter((child) => child.name === name);
  assertIncident(fields.length === 1 && fields[0].children.length === 0);
  const value = fields[0].text.trim();
  assertIncident(value.length > 0);
  return value;
}

function incidentPlainText(value, limit) {
  // Decode once at each layer (XML above, formatted HTML here). Never emit markup.
  const html = decodeIncidentEntities(value, true);
  const hiddenElements = new Set(["script", "style", "iframe", "object", "template", "noscript", "svg", "math"]);
  const hidden = [];
  const output = [];
  let offset = 0;
  while (offset < html.length) {
    if (html.startsWith("<!--", offset)) {
      const end = html.indexOf("-->", offset + 4);
      assertIncident(end !== -1);
      offset = end + 3;
      continue;
    }
    if (html[offset] === "<") {
      // Scan quoted attributes linearly; malformed long tags must not cause regex backtracking.
      let end = offset + 1;
      let quote = "";
      for (; end < html.length; end++) {
        const character = html[end];
        if (quote) {
          if (character === quote) quote = "";
        } else if (character === '"' || character === "'") {
          quote = character;
        } else if (character === ">") {
          break;
        } else {
          assertIncident(character !== "<");
        }
      }
      assertIncident(end < html.length && !quote);
      const part = html.slice(offset, end + 1);
      const match = /^<\/?([a-z][a-z0-9:-]*)(?=[\s/>])/i.exec(part);
      assertIncident(match);
      const name = match[1].toLowerCase();
      if (hiddenElements.has(name)) {
        if (part.startsWith("</")) {
          assertIncident(hidden.at(-1) === name);
          hidden.pop();
        } else {
          assertIncident(hidden.length < 16);
          hidden.push(name);
        }
      }
      if (!hidden.length && /^(?:br|p|div|li|ul|ol|h[1-6]|blockquote|pre|hr|tr)$/.test(name)) output.push("\n");
      offset = end + 1;
    } else {
      const next = html.indexOf("<", offset);
      const end = next === -1 ? html.length : next;
      if (!hidden.length) output.push(html.slice(offset, end));
      offset = end;
    }
  }
  assertIncident(hidden.length === 0);
  const text = output.join("").replace(/\r\n?/g, "\n").replace(/[^\S\n]+/gu, " ")
    .replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  assertIncident(text.length > 0 && text.length <= limit && !text.includes("<"));
  return text;
}

function incidentPublishedAt(value) {
  const match = /^(?:(Sun|Mon|Tue|Wed|Thu|Fri|Sat),\s+)?(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{2}|\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?\s+([+-]\d{4}|UT|GMT|EST|EDT|CST|CDT|MST|MDT|PST|PDT)$/.exec(value);
  assertIncident(match);
  const [, weekday, day, month, yearValue, hour, minute, second = "0", zone] = match;
  let year = Number(yearValue);
  if (yearValue.length === 2) year += year < 50 ? 2000 : 1900;
  const monthIndex = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(month);
  const local = new Date(Date.UTC(year, monthIndex, Number(day), Number(hour), Number(minute), Number(second)));
  assertIncident(year >= 1900 && local.getUTCFullYear() === year && local.getUTCMonth() === monthIndex &&
    local.getUTCDate() === Number(day) && Number(hour) < 24 && Number(minute) < 60 && Number(second) < 60 &&
    (!weekday || ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][local.getUTCDay()] === weekday));
  const zones = { UT: 0, GMT: 0, EST: -300, EDT: -240, CST: -360, CDT: -300, MST: -420, MDT: -360, PST: -480, PDT: -420 };
  let offset = zones[zone];
  if (offset === undefined) {
    assertIncident(Number(zone.slice(1, 3)) < 24 && Number(zone.slice(3)) < 60);
    offset = (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(3))) * (zone[0] === "+" ? 1 : -1);
  }
  return new Date(local.getTime() - offset * 60_000).toISOString();
}

function incidentPublicUrl(value, origin) {
  // Check the raw path before URL normalization can erase dot segments or escapes.
  assertIncident(/^https:\/\/[^/?#\\@\s]+\/incident\/[A-Za-z0-9_-]{1,128}\/?$/.test(value));
  const url = new URL(value);
  assertIncident(url.origin === origin && !url.username && !url.password && !url.search && !url.hash);
  return url.origin + url.pathname.replace(/\/$/, "");
}

async function normalizeIncidentRss(xml, origin) {
  const { channel, items } = parseIncidentRss(xml);
  incidentPlainText(incidentRssField(channel, "title"), INCIDENT_TITLE_MAX_LENGTH);
  incidentPlainText(incidentRssField(channel, "description"), INCIDENT_MESSAGE_MAX_LENGTH);
  const channelLink = incidentRssField(channel, "link");
  assertIncident(channelLink === origin || channelLink === origin + "/");
  const guids = new Map();
  const records = [];
  for (const item of items) {
    assertIncident(!item.text.trim());
    const record = {
      url: incidentPublicUrl(incidentRssField(item, "link"), origin),
      title: incidentPlainText(incidentRssField(item, "title"), INCIDENT_TITLE_MAX_LENGTH),
      publishedAt: incidentPublishedAt(incidentRssField(item, "pubDate")),
      message: incidentPlainText(incidentRssField(item, "description"), INCIDENT_MESSAGE_MAX_LENGTH),
    };
    const guid = incidentRssField(item, "guid");
    assertIncident(guid.length <= 512 && !/[\s<>]/u.test(guid));
    const signature = JSON.stringify(record);
    assertIncident(!guids.has(guid) || guids.get(guid) === signature);
    if (!guids.has(guid)) records.push(record);
    guids.set(guid, signature);
  }
  // Validate all input before deduplication and presentation limits, including old items.
  records.sort((left, right) => right.publishedAt.localeCompare(left.publishedAt) ||
    left.url.localeCompare(right.url) || left.title.localeCompare(right.title) || left.message.localeCompare(right.message));
  const groups = new Map();
  for (const record of records) {
    if (!groups.has(record.url)) groups.set(record.url, { title: record.title, url: record.url, updates: [], seen: new Set() });
    const group = groups.get(record.url);
    const identity = JSON.stringify([record.publishedAt, record.message]);
    if (!group.seen.has(identity)) group.updates.push({ publishedAt: record.publishedAt, message: record.message });
    group.seen.add(identity);
  }
  return Promise.all([...groups.values()].slice(0, INCIDENT_MAX_REPORTS).map(async (group) => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(group.url));
    return {
      key: Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(""),
      title: group.title,
      url: group.url,
      updates: group.updates.slice(0, INCIDENT_MAX_UPDATES).reverse(),
    };
  }));
}

function incidentHistoryResponse(ok, reports = []) {
  return jsonResponse({ ok, source: "better_stack", reports, fetchedAt: new Date().toISOString() }, {
    "Cache-Control": ok ? `public, max-age=${SYSTEM_STATUS_INCIDENTS_CACHE_TTL_SECONDS}` : "no-store",
    "X-Cache": ok ? "MISS" : "BYPASS",
  });
}

async function handleSystemStatusIncidents(request, env, ctx) {
  try {
    const configured = env?.BETTER_STACK_STATUS_PAGE_JSON_URL;
    if (typeof configured !== "string" || !configured.trim()) {
      errorConfigurationFailure(SYSTEM_STATUS_INCIDENTS_ROUTE, SYSTEM_STATUS_INCIDENTS_UPSTREAM);
      throw new WorkerConfigurationError();
    }
    assertIncident(/^https:\/\/[^/?#\\@\s]+\/index\.json$/.test(configured));
    const pageUrl = new URL(getBetterStackStatusPageUrl(env));
    assertIncident(!pageUrl.port);
    const upstreamUrl = new URL("/feed.rss", pageUrl.origin).href;
    const cache = caches.default;
    const cacheKey = new Request(new URL(request.url).origin + SYSTEM_STATUS_INCIDENTS_ROUTE +
      "?v1&source=" + encodeURIComponent(upstreamUrl));
    const cached = await cache.match(cacheKey);
    if (cached) {
      const response = new Response(cached.body, cached);
      response.headers.set("X-Cache", "HIT");
      return response;
    }
    const reports = await withUpstreamDeadline(SYSTEM_STATUS_INCIDENTS_DEADLINE_MS, async (signal) => {
      const upstream = await fetch(upstreamUrl, {
        method: "GET",
        headers: { Accept: "application/rss+xml, application/xml, text/xml", "User-Agent": "huihui.dev system-status-incidents worker" },
        redirect: "manual", cache: "no-store", signal,
      });
      if (!upstream.ok) {
        await cancelBody(upstream.body);
        throw new UpstreamHttpStatusError(upstream.status);
      }
      const type = upstream.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase();
      if (!["application/rss+xml", "application/xml", "text/xml"].includes(type)) {
        await cancelBody(upstream.body);
        throw new UpstreamInvalidResponseError();
      }
      const bytes = await readResponseBytesWithLimit(upstream, SYSTEM_STATUS_INCIDENTS_RESPONSE_MAX_BYTES);
      let xml;
      try { xml = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
      catch { throw new UpstreamInvalidResponseError(); }
      return normalizeIncidentRss(xml, pageUrl.origin);
    });
    const response = incidentHistoryResponse(true, reports);
    ctx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => errorUnhandledFailure(SYSTEM_STATUS_INCIDENTS_ROUTE)));
    return response;
  } catch (error) {
    if (!(error instanceof WorkerConfigurationError)) {
      warnUpstreamFailure(SYSTEM_STATUS_INCIDENTS_ROUTE, SYSTEM_STATUS_INCIDENTS_UPSTREAM, error);
    }
    return incidentHistoryResponse(false);
  }
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
      throw new UpstreamHttpStatusError(res.status);
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

      if (!data || typeof data !== "object") {
        throw new UpstreamInvalidResponseError();
      }

      if (data.media_type === "video") {
        continue;
      }

      if (data.media_type !== "image" || !data.url) {
        throw new UpstreamInvalidResponseError();
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
      warnUpstreamFailure("/api/apod", "nasa_apod", error, daysBack);
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
    errorConfigurationFailure("/api/steam-library", "steam");
    throw new WorkerConfigurationError();
  }

  if (!env.STEAM_ID) {
    errorConfigurationFailure("/api/steam-library", "steam");
    throw new WorkerConfigurationError();
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
        throw new UpstreamHttpStatusError(res.status);
      }

      return readResponseJsonWithLimit(res, STEAM_RESPONSE_MAX_BYTES);
    }
  );
  let games;

  try {
    games = data.response?.games || [];
  } catch {
    throw new UpstreamInvalidResponseError();
  }

  if (
    !Array.isArray(games) ||
    games.some(
      (game) =>
        game === null ||
        typeof game !== "object" ||
        Array.isArray(game) ||
        !Number.isInteger(game.appid)
    )
  ) {
    throw new UpstreamInvalidResponseError();
  }

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
    if (!(error instanceof WorkerConfigurationError)) {
      warnUpstreamFailure("/api/steam-library", "steam", error);
    }

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
const TURNSTILE_CONFIGURATION_ERROR_CODES = new Set([
  "missing-input-secret",
  "invalid-input-secret",
]);
const TURNSTILE_UPSTREAM_ERROR_CODES = new Set([
  "bad-request",
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
    return jsonResponse(
      { ok: false, message: "Method Not Allowed" },
      { ...contactCorsHeaders(), Allow: "POST, OPTIONS" },
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

  const missingTurnstileConfiguration = !env.TURNSTILE_SECRET_KEY;
  const missingFormspreeConfiguration = !env.FORMSPREE_ENDPOINT;

  if (missingTurnstileConfiguration || missingFormspreeConfiguration) {
    if (missingTurnstileConfiguration) {
      errorConfigurationFailure("/api/contact", "turnstile");
    }

    if (missingFormspreeConfiguration) {
      errorConfigurationFailure("/api/contact", "formspree");
    }

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
          throw new UpstreamHttpStatusError(verifyRes.status);
        }

        return readResponseJsonWithLimit(
          verifyRes,
          TURNSTILE_RESPONSE_MAX_BYTES
        );
      }
    );
  } catch (error) {
    const failure =
      error instanceof ContactUpstreamTimeoutError
        ? new UpstreamDeadlineError()
        : error;
    warnUpstreamFailure("/api/contact", "turnstile", failure);

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
    warnUpstreamFailure(
      "/api/contact",
      "turnstile",
      new UpstreamInvalidResponseError()
    );
    return contactJsonResponse(
      { ok: false, message: "Turnstile verification unavailable" },
      502
    );
  }

  const malformedSuccessfulVerification =
    verifyData.success &&
    (typeof verifyData.action !== "string" ||
      typeof verifyData.hostname !== "string");

  if (malformedSuccessfulVerification) {
    warnUpstreamFailure(
      "/api/contact",
      "turnstile",
      new UpstreamInvalidResponseError()
    );
  }

  if (
    !verifyData.success ||
    malformedSuccessfulVerification ||
    verifyData.action !== CONTACT_TURNSTILE_ACTION ||
    verifyData.hostname.toLowerCase() !== expectedTurnstileHostname
  ) {
    const errorCodes = sanitizeTurnstileErrorCodes(
      verifyData["error-codes"]
    );

    if (
      !malformedSuccessfulVerification &&
      errorCodes.some((code) =>
        TURNSTILE_CONFIGURATION_ERROR_CODES.has(code)
      )
    ) {
      errorConfigurationFailure("/api/contact", "turnstile");
    } else if (
      !malformedSuccessfulVerification &&
      errorCodes.some((code) => TURNSTILE_UPSTREAM_ERROR_CODES.has(code))
    ) {
      warnUpstreamFailure(
        "/api/contact",
        "turnstile",
        new UpstreamInvalidResponseError()
      );
    }

    return contactJsonResponse(
      {
        ok: false,
        message: "Turnstile verification failed",
        errorCodes,
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
    const failure =
      error instanceof ContactUpstreamTimeoutError
        ? new UpstreamDeadlineError()
        : error;
    errorUpstreamFailure("/api/contact", "formspree", failure);

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
    errorUpstreamFailure(
      "/api/contact",
      "formspree",
      new UpstreamHttpStatusError(forwardRes.status)
    );
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

  if (url.pathname === "/api/infrastructure-status") {
    return handleReadOnlyRoute(request, () =>
      handleInfrastructureStatus(request, env, ctx)
    );
  }

  if (url.pathname === "/api/system-status") {
    return handleReadOnlyRoute(request, () => handleSystemStatus(env));
  }

  if (url.pathname === SYSTEM_STATUS_HISTORY_ROUTE) {
    return handleReadOnlyRoute(request, () => handleSystemStatusHistory(request, env, ctx));
  }

  if (url.pathname === SYSTEM_STATUS_INCIDENTS_ROUTE) {
    return handleReadOnlyRoute(request, () => handleSystemStatusIncidents(request, env, ctx));
  }

  if (url.pathname === "/api/health") {
    return handleReadOnlyRoute(request, handleApiHealth);
  }

  if (url.pathname === "/api/contact/health") {
    return handleReadOnlyRoute(request, handleContactHealth);
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
        "/api/infrastructure-status",
        "/api/system-status",
        "/api/system-status/history",
        "/api/system-status/incidents",
        "/api/health",
        "/api/contact/health",
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

      errorUnhandledFailure(getDiagnosticRoute(url.pathname));

      response =
        url.pathname === "/api/contact"
          ? contactJsonResponse(errorData, 500)
          : jsonResponse(errorData, {}, 500);
    }

    return applyCors(response, request, env);
  },
};
