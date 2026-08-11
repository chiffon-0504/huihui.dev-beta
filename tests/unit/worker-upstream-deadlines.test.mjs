import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import worker, {
  APOD_ATTEMPT_DEADLINE_MS,
  APOD_TOTAL_BUDGET_MS,
  GITHUB_UPSTREAM_DEADLINE_MS,
  STEAM_UPSTREAM_DEADLINE_MS,
  TECH_NEWS_SOURCE_DEADLINE_MS,
  UpstreamDeadlineError,
  withUpstreamDeadline,
} from "../../workers/huihui-api/worker.js";

const fixedNow = new Date("2026-08-03T12:00:00.000Z");
const techNewsSourceUrls = [
  "https://openai.com/news/rss.xml",
  "https://developer.apple.com/news/rss/news.rss",
  "https://android-developers.googleblog.com/feeds/posts/default",
];
const techNewsSources = [
  "OpenAI News",
  "Apple Developer News",
  "Android Developers Blog",
];
const githubEnv = { GITHUB_TOKEN: "test-github-token" };
const steamEnv = {
  STEAM_API_KEY: "test-steam-api-key",
  STEAM_ID: "test-steam-id",
};
const steamAllowedAppids = [3418570, 2458530, 1829980, 1044620, 3682050];

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

function rssResponse(title, link) {
  return new Response(
    `<rss><channel><item><title>${title}</title><link>${link}</link>` +
      `<pubDate>Sun, 02 Aug 2026 12:00:00 GMT</pubDate></item></channel></rss>`,
    { status: 200, headers: { "Content-Type": "application/rss+xml" } },
  );
}

function apodResponse(date, overrides = {}) {
  return new Response(
    JSON.stringify({
      media_type: "image",
      url: `https://images.example.test/${date}.jpg`,
      hdurl: `https://images.example.test/${date}-hd.jpg`,
      title: `APOD ${date}`,
      date,
      explanation: `Explanation ${date}`,
      ...overrides,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function githubResponse() {
  return new Response(
    JSON.stringify([
      {
        html_url: "https://github.com/chiffon-0504/huihui_project-v1/commit/abc",
        commit: {
          committer: { date: "2026-08-03T11:30:00.000Z" },
        },
      },
    ]),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function steamGame(appid, playtimeForever = 60) {
  return {
    appid,
    name: `Game ${appid}`,
    playtime_forever: playtimeForever,
  };
}

function steamResponse(games) {
  return new Response(
    JSON.stringify({ response: { game_count: games.length, games } }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function pendingJsonResponse(signal) {
  return new Response(
    new ReadableStream({
      start(controller) {
        signal.addEventListener(
          "abort",
          () => controller.error(new Error("upstream body aborted")),
          { once: true },
        );
      },
      pull() {
        return new Promise(() => {});
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function expectFallbackHeaders(response, cacheControl) {
  expect(response.headers.get("Cache-Control")).toBe(cacheControl);
  expect(response.headers.get("X-Cache")).toBe("FALLBACK");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(fixedNow);
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

describe("shared Worker upstream deadline", () => {
  test("returns an operation that completes before its deadline", async () => {
    await expect(
      withUpstreamDeadline(1000, async (signal) => {
        expect(signal.aborted).toBe(false);
        return "completed";
      }),
    ).resolves.toBe("completed");
  });

  test("preserves an operation rejection", async () => {
    const expectedError = new Error("upstream failed");

    await expect(
      withUpstreamDeadline(1000, async () => {
        throw expectedError;
      }),
    ).rejects.toBe(expectedError);
  });

  test("aborts an operation that never resolves at its deadline", async () => {
    let signal;
    const pending = withUpstreamDeadline(25, (operationSignal) => {
      signal = operationSignal;
      return new Promise(() => {});
    });
    const rejection = expect(pending).rejects.toBeInstanceOf(
      UpstreamDeadlineError,
    );

    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(25);

    await rejection;
    expect(signal.aborted).toBe(true);
  });

  test("keeps the deadline active while a response body is pending", async () => {
    let signal;
    const response = {
      ok: true,
      text: vi.fn(() => new Promise(() => {})),
    };
    const pending = withUpstreamDeadline(25, async (operationSignal) => {
      signal = operationSignal;
      const receivedResponse = await Promise.resolve(response);
      return receivedResponse.text();
    });
    const rejection = expect(pending).rejects.toBeInstanceOf(
      UpstreamDeadlineError,
    );

    await vi.advanceTimersByTimeAsync(25);

    await rejection;
    expect(response.text).toHaveBeenCalledTimes(1);
    expect(signal.aborted).toBe(true);
  });

  test("clears its timer after success", async () => {
    await withUpstreamDeadline(1000, async () => "ok");

    expect(vi.getTimerCount()).toBe(0);
  });

  test("clears its timer after failure", async () => {
    await expect(
      withUpstreamDeadline(1000, async () => {
        throw new Error("failed");
      }),
    ).rejects.toThrow("failed");

    expect(vi.getTimerCount()).toBe(0);
  });

  test("leaves no timer or unhandled rejection after timeout", async () => {
    const unhandledRejections = [];
    const onUnhandledRejection = (error) => unhandledRejections.push(error);
    let rejectOperation;
    process.on("unhandledRejection", onUnhandledRejection);

    try {
      const pending = withUpstreamDeadline(
        25,
        () =>
          new Promise((_, reject) => {
            rejectOperation = reject;
          }),
      );
      const timeoutResult = pending.catch((error) => error);

      await vi.advanceTimersByTimeAsync(25);
      await expect(timeoutResult).resolves.toBeInstanceOf(
        UpstreamDeadlineError,
      );
      rejectOperation(new Error("late abort rejection"));
      await Promise.resolve();
      await Promise.resolve();

      expect(vi.getTimerCount()).toBe(0);
      expect(unhandledRejections).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
    }
  });
});

describe("Tech News upstream deadlines", () => {
  test("keeps all-source success order and schema unchanged", async () => {
    const fetchMock = vi.fn((url) => {
      const sourceIndex = techNewsSourceUrls.indexOf(url);
      return Promise.resolve(
        rssResponse(
          `Article ${sourceIndex}`,
          `https://articles.example.test/${sourceIndex}`,
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await finishWorker(startWorker("/api/tech-news"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=300");
    expect(data.techNews.map((item) => item.source)).toEqual(techNewsSources);
    expect(data.techNews.map((item) => item.title)).toEqual([
      "Article 0",
      "Article 1",
      "Article 2",
    ]);
    expect(data.techNews.map((item) => Object.keys(item))).toEqual(
      Array(3).fill([
        "category",
        "title",
        "description",
        "tag",
        "source",
        "timeAgo",
        "link",
      ]),
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test("isolates one timed-out source while the other sources still succeed", async () => {
    const sourceSignals = new Map();
    const fetchMock = vi.fn((url, options) => {
      sourceSignals.set(url, options.signal);

      if (url === techNewsSourceUrls[0]) {
        return new Promise(() => {});
      }

      const sourceIndex = techNewsSourceUrls.indexOf(url);
      return Promise.resolve(
        rssResponse(
          `Article ${sourceIndex}`,
          `https://articles.example.test/${sourceIndex}`,
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const pending = startWorker("/api/tech-news");
    await vi.advanceTimersByTimeAsync(TECH_NEWS_SOURCE_DEADLINE_MS);
    const response = await finishWorker(pending);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.techNews.map((item) => item.source)).toEqual(techNewsSources);
    expect(data.techNews.map((item) => item.title)).toEqual([
      "OpenAI News",
      "Article 1",
      "Article 2",
    ]);
    expect(sourceSignals.get(techNewsSourceUrls[0]).aborted).toBe(true);
    expect(sourceSignals.get(techNewsSourceUrls[1]).aborted).toBe(false);
    expect(sourceSignals.get(techNewsSourceUrls[2]).aborted).toBe(false);
  });
});

describe("APOD upstream deadlines", () => {
  test("returns today's APOD without requesting an earlier date", async () => {
    const fetchMock = vi.fn().mockResolvedValue(apodResponse("2026-08-03"));
    vi.stubGlobal("fetch", fetchMock);

    const response = await finishWorker(startWorker("/api/apod"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      ok: true,
      date: "2026-08-03",
      fallback: false,
      fallbackReason: "",
      daysBack: 0,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("date=2026-08-03");
  });

  test("tries the next date after today's request fails immediately", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("today unavailable"))
      .mockResolvedValueOnce(apodResponse("2026-08-02"));
    vi.stubGlobal("fetch", fetchMock);

    const response = await finishWorker(startWorker("/api/apod"));

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain("date=2026-08-03");
    expect(fetchMock.mock.calls[1][0]).toContain("date=2026-08-02");
  });

  test("aborts a never-resolving APOD attempt", async () => {
    let firstSignal;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce((_url, options) => {
        firstSignal = options.signal;
        return new Promise(() => {});
      })
      .mockRejectedValue(new Error("earlier date unavailable"));
    vi.stubGlobal("fetch", fetchMock);

    const pending = startWorker("/api/apod");
    await vi.advanceTimersByTimeAsync(APOD_ATTEMPT_DEADLINE_MS);
    const response = await finishWorker(pending);

    expect(response.status).toBe(200);
    expect(firstSignal.aborted).toBe(true);
  });

  test("keeps multiple slow attempts within the APOD total budget", async () => {
    const signals = [];
    const fetchMock = vi.fn((_url, options) => {
      signals.push(options.signal);
      return new Promise(() => {});
    });
    vi.stubGlobal("fetch", fetchMock);
    const startedAt = Date.now();

    const pending = startWorker("/api/apod");
    await vi.advanceTimersByTimeAsync(APOD_TOTAL_BUDGET_MS);
    const response = await finishWorker(pending);

    expect(Date.now() - startedAt).toBe(APOD_TOTAL_BUDGET_MS);
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  test("stops starting attempts when the remaining APOD budget is insufficient", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(
              () =>
                resolve(
                  apodResponse("2026-08-03", {
                    media_type: "video",
                    url: "https://video.example.test/apod",
                  }),
                ),
              APOD_ATTEMPT_DEADLINE_MS - 500,
            );
          }),
      )
      .mockImplementationOnce(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);

    const pending = startWorker("/api/apod");
    await vi.advanceTimersByTimeAsync(APOD_TOTAL_BUDGET_MS);
    const response = await finishWorker(pending);

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("returns a valid APOD found on an earlier date", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        apodResponse("2026-08-03", {
          media_type: "video",
          url: "https://video.example.test/apod",
        }),
      )
      .mockResolvedValueOnce(apodResponse("2026-08-02"));
    vi.stubGlobal("fetch", fetchMock);

    const response = await finishWorker(startWorker("/api/apod"));
    const data = await response.json();

    expect(data).toMatchObject({
      ok: true,
      date: "2026-08-02",
      fallback: true,
      fallbackReason: "today_apod_was_not_image",
      daysBack: 1,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("uses the existing APOD fallback after all attempts fail", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("NASA unavailable"));
    vi.stubGlobal("fetch", fetchMock);

    const response = await finishWorker(startWorker("/api/apod"));

    expectFallbackHeaders(response, "public, max-age=3600");
    expect(await response.json()).toEqual({
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
    });
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });
});

describe("GitHub upstream deadlines", () => {
  test("keeps the successful GitHub response unchanged", async () => {
    const fetchMock = vi.fn().mockResolvedValue(githubResponse());
    vi.stubGlobal("fetch", fetchMock);

    const response = await finishWorker(
      startWorker("/api/github-updates", githubEnv),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=300");
    expect(data).toMatchObject({
      ok: true,
      source: "GitHub",
      repo: "huihui_project-v1",
      updatedAt: "2026-08-03T11:30:00.000Z",
      updatedText: "30 mins ago",
      link: "https://github.com/chiffon-0504/huihui_project-v1/commit/abc",
    });
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  test("falls back after a never-resolving GitHub fetch", async () => {
    let signal;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, options) => {
        signal = options.signal;
        return new Promise(() => {});
      }),
    );

    const pending = startWorker("/api/github-updates", githubEnv);
    await vi.advanceTimersByTimeAsync(GITHUB_UPSTREAM_DEADLINE_MS);
    const response = await finishWorker(pending);
    const data = await response.json();

    expect(response.status).toBe(200);
    expectFallbackHeaders(response, "public, max-age=60");
    expect(data).toMatchObject({
      ok: false,
      source: "GitHub",
      repo: "huihui_project-v1",
      updatedAt: "",
      updatedText: "",
    });
    expect(Object.keys(data)).toEqual([
      "ok",
      "source",
      "title",
      "description",
      "repo",
      "updatedAt",
      "updatedText",
      "link",
    ]);
    expect(signal.aborted).toBe(true);
  });

  test("falls back when the GitHub response body never resolves", async () => {
    let signal;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, options) => {
        signal = options.signal;
        return Promise.resolve(pendingJsonResponse(signal));
      }),
    );

    const pending = startWorker("/api/github-updates", githubEnv);
    await vi.advanceTimersByTimeAsync(GITHUB_UPSTREAM_DEADLINE_MS);
    const response = await finishWorker(pending);

    expect(response.status).toBe(200);
    expectFallbackHeaders(response, "public, max-age=60");
    expect((await response.json()).ok).toBe(false);
    expect(signal.aborted).toBe(true);
  });
});

describe("Steam upstream deadlines", () => {
  test("keeps the successful Steam response and allowlist unchanged", async () => {
    const games = [
      steamGame(9999999, 999999),
      ...steamAllowedAppids.map((appid, index) => steamGame(appid, index * 60)),
    ];
    const fetchMock = vi.fn().mockResolvedValue(steamResponse(games));
    vi.stubGlobal("fetch", fetchMock);

    const response = await finishWorker(
      startWorker("/api/steam-library", steamEnv),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=3600");
    expect(data).toMatchObject({ ok: true, source: "Steam", count: 5 });
    expect(data.games.map((game) => game.appid)).toEqual(steamAllowedAppids);
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  test("falls back after a never-resolving Steam fetch", async () => {
    let signal;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, options) => {
        signal = options.signal;
        return new Promise(() => {});
      }),
    );

    const pending = startWorker("/api/steam-library", steamEnv);
    await vi.advanceTimersByTimeAsync(STEAM_UPSTREAM_DEADLINE_MS);
    const response = await finishWorker(pending);

    expect(response.status).toBe(500);
    expectFallbackHeaders(response, "public, max-age=300");
    expect(await response.json()).toEqual({
      ok: false,
      source: "Steam",
      message: "Steam library temporarily unavailable",
      games: [],
    });
    expect(signal.aborted).toBe(true);
  });

  test("falls back when the Steam response body never resolves", async () => {
    let signal;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, options) => {
        signal = options.signal;
        return Promise.resolve(pendingJsonResponse(signal));
      }),
    );

    const pending = startWorker("/api/steam-library", steamEnv);
    await vi.advanceTimersByTimeAsync(STEAM_UPSTREAM_DEADLINE_MS);
    const response = await finishWorker(pending);

    expect(response.status).toBe(500);
    expectFallbackHeaders(response, "public, max-age=300");
    expect((await response.json()).games).toEqual([]);
    expect(signal.aborted).toBe(true);
  });

  test("does not relax the Steam allowlist after a timeout", async () => {
    let timedOutSignal;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce((_url, options) => {
        timedOutSignal = options.signal;
        return new Promise(() => {});
      })
      .mockResolvedValueOnce(
        steamResponse([
          steamGame(9999999, 999999),
          steamGame(steamAllowedAppids[0], 60),
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);

    const timedOutRequest = startWorker("/api/steam-library", steamEnv);
    await vi.advanceTimersByTimeAsync(STEAM_UPSTREAM_DEADLINE_MS);
    const fallbackResponse = await finishWorker(timedOutRequest);
    const successfulResponse = await finishWorker(
      startWorker("/api/steam-library", steamEnv),
    );
    const data = await successfulResponse.json();

    expect(fallbackResponse.status).toBe(500);
    expect(timedOutSignal.aborted).toBe(true);
    expect(data.games.map((game) => game.appid)).toEqual([
      steamAllowedAppids[0],
    ]);
    expect(JSON.stringify(data)).not.toContain("9999999");
  });
});
