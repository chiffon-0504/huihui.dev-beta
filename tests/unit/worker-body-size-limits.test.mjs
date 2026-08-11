import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import worker, {
  APOD_RESPONSE_MAX_BYTES,
  BodySizeLimitError,
  GITHUB_RESPONSE_MAX_BYTES,
  STEAM_RESPONSE_MAX_BYTES,
  TECH_NEWS_RESPONSE_MAX_BYTES,
  readResponseJsonWithLimit,
  readResponseTextWithLimit,
} from "../../workers/huihui-api/worker.js";

const encoder = new TextEncoder();
const githubEnv = { GITHUB_TOKEN: "test-github-token" };
const steamEnv = {
  STEAM_API_KEY: "test-steam-api-key",
  STEAM_ID: "test-steam-id",
};

function responseFromChunks(
  chunks,
  { headers = {}, keepOpen = false, cancel = vi.fn() } = {},
) {
  return {
    cancel,
    response: new Response(
      new ReadableStream({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(chunk);
          }

          if (!keepOpen) {
            controller.close();
          }
        },
        cancel,
      }),
      { status: 200, headers },
    ),
  };
}

function oversizedResponse(maxBytes, headers = {}) {
  return responseFromChunks([new Uint8Array(maxBytes + 1)], {
    headers,
    keepOpen: true,
  });
}

function rssResponse(title, link) {
  return new Response(
    `<rss><channel><item><title>${title}</title><link>${link}</link>` +
      `<pubDate>Sun, 02 Aug 2026 12:00:00 GMT</pubDate></item></channel></rss>`,
    { status: 200, headers: { "Content-Type": "application/rss+xml" } },
  );
}

function apodResponse(date) {
  return new Response(
    JSON.stringify({
      media_type: "image",
      url: `https://images.example.test/${date}.jpg`,
      hdurl: `https://images.example.test/${date}-hd.jpg`,
      title: `APOD ${date}`,
      date,
      explanation: `Explanation ${date}`,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function startWorker(path, env = {}) {
  const pendingTasks = [];
  const responsePromise = worker.fetch(
    new Request(`https://api.example.test${path}`),
    env,
    {
      waitUntil(task) {
        pendingTasks.push(task);
      },
    },
  );

  return { pendingTasks, responsePromise };
}

async function finishWorker(started) {
  const response = await started.responsePromise;
  await Promise.all(started.pendingTasks);
  return response;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-03T12:00:00.000Z"));
  vi.stubGlobal("caches", {
    default: {
      match: vi.fn(async () => undefined),
      put: vi.fn(async () => undefined),
    },
  });
});

afterEach(() => {
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("bounded upstream body readers", () => {
  test("decodes UTF-8 split across chunks at the exact text boundary", async () => {
    const expected = "A🙂終";
    const bytes = encoder.encode(expected);
    const { response } = responseFromChunks(
      [bytes.slice(0, 3), bytes.slice(3, 6), bytes.slice(6)],
      { headers: { "Content-Length": String(bytes.byteLength) } },
    );

    await expect(
      readResponseTextWithLimit(response, bytes.byteLength),
    ).resolves.toBe(expected);
  });

  test("parses JSON only after an exact-boundary body is fully consumed", async () => {
    const expected = { ok: true, label: "bounded JSON" };
    const body = JSON.stringify(expected);
    const bytes = encoder.encode(body);
    const { response } = responseFromChunks(
      [bytes.slice(0, 7), bytes.slice(7)],
      { headers: { "Content-Length": String(bytes.byteLength) } },
    );

    await expect(
      readResponseJsonWithLimit(response, bytes.byteLength),
    ).resolves.toEqual(expected);
  });

  test.each([
    ["missing", {}],
    ["misleading", { "Content-Length": "1" }],
  ])(
    "rejects and cancels text above the limit with %s Content-Length",
    async (_label, headers) => {
      const { cancel, response } = oversizedResponse(16, headers);

      await expect(readResponseTextWithLimit(response, 16)).rejects.toBeInstanceOf(
        BodySizeLimitError,
      );
      expect(cancel).toHaveBeenCalledOnce();
    },
  );

  test("preserves malformed JSON as a parsing failure", async () => {
    const bytes = encoder.encode("{not-json");
    const { response } = responseFromChunks([bytes]);

    await expect(readResponseJsonWithLimit(response, 64)).rejects.toBeInstanceOf(
      SyntaxError,
    );
  });
});

describe("bounded upstream route fallbacks", () => {
  test("isolates an oversized RSS source and preserves other Tech News results", async () => {
    const oversized = oversizedResponse(TECH_NEWS_RESPONSE_MAX_BYTES, {
      "Content-Length": "1",
      "Content-Type": "application/rss+xml",
    });
    const fetchMock = vi.fn((url) => {
      if (url === "https://openai.com/news/rss.xml") {
        return Promise.resolve(oversized.response);
      }

      return Promise.resolve(
        rssResponse("Bounded article", "https://articles.example.test/bounded"),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await finishWorker(startWorker("/api/tech-news"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Cache")).toBe("MISS");
    expect(data.techNews.map((item) => item.title)).toEqual([
      "OpenAI News",
      "Bounded article",
      "Bounded article",
    ]);
    expect(oversized.cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  test("treats an oversized APOD body as a failed date and keeps lookback fallback", async () => {
    const oversized = oversizedResponse(APOD_RESPONSE_MAX_BYTES);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(oversized.response)
      .mockResolvedValueOnce(apodResponse("2026-08-02"));
    vi.stubGlobal("fetch", fetchMock);

    const response = await finishWorker(startWorker("/api/apod"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      ok: true,
      date: "2026-08-02",
      fallback: true,
      daysBack: 1,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(oversized.cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  test("uses the GitHub fallback for a misleading oversized JSON body", async () => {
    const oversized = oversizedResponse(GITHUB_RESPONSE_MAX_BYTES, {
      "Content-Length": "1",
      "Content-Type": "application/json",
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(oversized.response));

    const response = await finishWorker(
      startWorker("/api/github-updates", githubEnv),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Cache")).toBe("FALLBACK");
    expect(data).toMatchObject({ ok: false, source: "GitHub" });
    expect(oversized.cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  test("keeps malformed GitHub JSON on the existing fallback contract", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("{not-json", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const response = await finishWorker(
      startWorker("/api/github-updates", githubEnv),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Cache")).toBe("FALLBACK");
    expect((await response.json()).ok).toBe(false);
  });

  test("uses the Steam fallback for an oversized body without Content-Length", async () => {
    const oversized = oversizedResponse(STEAM_RESPONSE_MAX_BYTES, {
      "Content-Type": "application/json",
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(oversized.response));

    const response = await finishWorker(
      startWorker("/api/steam-library", steamEnv),
    );

    expect(response.status).toBe(500);
    expect(response.headers.get("X-Cache")).toBe("FALLBACK");
    expect(await response.json()).toEqual({
      ok: false,
      source: "Steam",
      message: "Steam library temporarily unavailable",
      games: [],
    });
    expect(oversized.cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
