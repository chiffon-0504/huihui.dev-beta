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
  return decodeHtml(url || "").split("#")[0];
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

  if (atomLinks.length > 0) {
    return cleanUrl(atomLinks[0]);
  }

  const rssLink = getFirstMatch(entry, [/<link>(.*?)<\/link>/], fallbackLink);

  return cleanUrl(rssLink);
}

function jsonResponse(data, headers = {}, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      ...headers,
    },
  });
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
  const now = new Date();
  const past = new Date(dateString);
  const diff = Math.floor((now.getTime() - past.getTime()) / 1000);

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
        const res = await fetch(source.url, {
          headers: {
            "User-Agent": "huihui.dev tech-news worker",
          },
        });

        if (!res.ok) {
          throw new Error(`Failed to fetch ${source.source}`);
        }

        const xml = await res.text();
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
          link: cleanUrl(link),
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
  const cacheKey = new Request(new URL(request.url).origin + "/api/tech-news?v2");

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

async function fetchApodByDate(apiKey, dateString) {
  const res = await fetch(
    `${NASA_APOD_URL}?api_key=${apiKey}&date=${dateString}&thumbs=true`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "huihui.dev apod worker",
      },
    }
  );

  if (!res.ok) {
    throw new Error(`NASA APOD failed: ${res.status}`);
  }

  return res.json();
}

async function getApod(env) {
  const apiKey = env.NASA_API_KEY || "DEMO_KEY";

  for (let daysBack = 0; daysBack <= APOD_LOOKBACK_DAYS; daysBack++) {
    const dateString = formatUtcDate(daysBack);

    try {
      const data = await fetchApodByDate(apiKey, dateString);

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
    imageUrl: "/images/fallback/apod-fallback.webp",
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
   GitHub Project Updates
========================= */

const GITHUB_REPO_OWNER = "chiffon-0504";
const GITHUB_REPO_NAME = "huihui_project-v1";
const GITHUB_REPO_API_URL =
  `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/commits?per_page=1`;

function formatGitHubTime(dateString) {
  if (!dateString) return "";

  const date = new Date(dateString);
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes} mins ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hrs ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays} days ago`;

  return date.toISOString().slice(0, 10);
}

async function getGitHubProjectUpdate(env) {
  if (!env.GITHUB_TOKEN) {
    throw new Error("Missing GITHUB_TOKEN");
  }

  const res = await fetch(GITHUB_REPO_API_URL, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "User-Agent": "huihui.dev github updates worker",
    },
  });

  if (!res.ok) {
    throw new Error(`GitHub API failed: ${res.status}`);
  }

  const commits = await res.json();
  const latest = commits?.[0];

  if (!latest) {
    throw new Error("No commits found");
  }

  const updatedAt =
    latest.commit?.committer?.date || latest.commit?.author?.date || "";

  return {
    ok: true,
    source: "GitHub",
    title: "新增 GitHub 專案更新卡片",
    description: "首頁改為顯示最近網站開發進度。",
    repo: GITHUB_REPO_NAME,
    updatedAt,
    updatedText: formatGitHubTime(updatedAt),
    link:
      latest.html_url ||
      `https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}`,
  };
}

async function handleGitHubUpdates(request, env, ctx) {
  const cache = caches.default;
  const cacheKey = new Request(
    new URL(request.url).origin + "/api/github-updates"
  );

  const cachedResponse = await cache.match(cacheKey);

  if (cachedResponse) {
    const response = new Response(cachedResponse.body, cachedResponse);
    response.headers.set("X-Cache", "HIT");
    return response;
  }

  try {
    const projectUpdate = await getGitHubProjectUpdate(env);

    const response = jsonResponse(projectUpdate, {
      "Cache-Control": "public, max-age=300",
      "X-Cache": "MISS",
    });

    ctx.waitUntil(cache.put(cacheKey, response.clone()));

    return response;
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        source: "GitHub",
        title: "GitHub 專案更新暫時無法讀取",
        description: "請稍後再試。",
        repo: GITHUB_REPO_NAME,
        updatedAt: "",
        updatedText: "",
        link: `https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}`,
      },
      {
        "Cache-Control": "public, max-age=60",
        "X-Cache": "FALLBACK",
      }
    );
  }
}

/* =========================
   Steam Library
========================= */

const STEAM_LIBRARY_CACHE_TTL_SECONDS = 60 * 60 * 6;

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

  const res = await fetch(apiUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent": "huihui.dev steam library worker",
    },
  });

  if (!res.ok) {
    throw new Error(`Steam API failed: ${res.status}`);
  }

  const data = await res.json();
  const games = data.response?.games || [];

  return games
    .map((game) => ({
      appid: game.appid,
      name: game.name,
      playtimeMinutes: game.playtime_forever || 0,
      playtimeHours: Math.round(((game.playtime_forever || 0) / 60) * 10) / 10,
      coverUrl: getSteamCoverUrl(game.appid),
      capsuleUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appid}/header.jpg`,
      storeUrl: `https://store.steampowered.com/app/${game.appid}/`,
    }))
    .filter(game =>
      game.name !== "Wallpaper Engine"
    )
    .sort((a, b) => b.playtimeMinutes - a.playtimeMinutes)
    .slice(0, 30);
}

async function handleSteamLibrary(request, env, ctx) {
  const cache = caches.default;
  const cacheKey = new Request(
    new URL(request.url).origin + "/api/steam-library-v5"
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

function contactCorsHeaders(request) {
  const origin = request.headers.get("Origin") || "";

  const allowedOrigins = new Set([
    "https://huihui.dev",
    "https://www.huihui.dev",
  ]);

  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin)
      ? origin
      : "https://huihui.dev",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function contactJsonResponse(request, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...contactCorsHeaders(request),
    },
  });
}

async function handleContact(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: contactCorsHeaders(request),
    });
  }

  if (request.method !== "POST") {
    return contactJsonResponse(
      request,
      { ok: false, message: "Method Not Allowed" },
      405
    );
  }

  if (!env.TURNSTILE_SECRET_KEY) {
    return contactJsonResponse(
      request,
      { ok: false, message: "Missing TURNSTILE_SECRET_KEY" },
      500
    );
  }

  if (!env.FORMSPREE_ENDPOINT) {
    return contactJsonResponse(
      request,
      { ok: false, message: "Missing FORMSPREE_ENDPOINT" },
      500
    );
  }

  const formData = await request.formData();

  const token = formData.get("cf-turnstile-response");
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const message = String(formData.get("message") || "").trim();

  if (!name || !email || !message) {
    return contactJsonResponse(
      request,
      { ok: false, message: "Missing required fields" },
      400
    );
  }

  if (!token) {
    return contactJsonResponse(
      request,
      { ok: false, message: "Missing Turnstile token" },
      400
    );
  }

  const verifyRes = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      body: new URLSearchParams({
        secret: env.TURNSTILE_SECRET_KEY,
        response: token,
      }),
    }
  );

  const verifyData = await verifyRes.json();

  if (!verifyData.success) {
    return contactJsonResponse(
      request,
      {
        ok: false,
        message: "Turnstile verification failed",
        errorCodes: verifyData["error-codes"] || [],
      },
      403
    );
  }

  const forwardData = new FormData();
  forwardData.set("name", name);
  forwardData.set("email", email);
  forwardData.set("message", message);

  const forwardRes = await fetch(env.FORMSPREE_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/json",
    },
    body: forwardData,
  });

  if (!forwardRes.ok) {
    return contactJsonResponse(
      request,
      { ok: false, message: "Failed to forward contact form" },
      502
    );
  }

  return contactJsonResponse(
    request,
    { ok: true, message: "Message sent" },
    200
  );
}

/* =========================
   Router
========================= */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/tech-news") {
      return handleTechNews(request, env, ctx);
    }

    if (url.pathname === "/api/apod") {
      return handleApod(request, env, ctx);
    }

    if (url.pathname === "/api/github-updates") {
      return handleGitHubUpdates(request, env, ctx);
    }

    if (url.pathname === "/api/steam-library") {
      return handleSteamLibrary(request, env, ctx);
    }

    if (url.pathname === "/api/contact") {
      return handleContact(request, env);
    }

    return jsonResponse(
      {
        ok: true,
        message: "test deploy",
        endpoints: [
          "/api/tech-news",
          "/api/apod",
          "/api/github-updates",
          "/api/steam-library",
          "/api/contact",
        ],
      },
      {
        "Cache-Control": "no-store",
      }
    );
  },
};
