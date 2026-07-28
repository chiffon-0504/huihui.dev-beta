import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import worker from "../../workers/huihui-api/worker.js";

const steamUrl = "https://api.example.test/api/steam-library";
const productionOrigin = "https://huihui.dev";
const betaOrigin = "https://beta.huihui.dev";
const allowedAppids = [3418570, 2458530, 1829980, 1044620, 3682050];
const publicGameFields = [
  "appid",
  "capsuleUrl",
  "coverUrl",
  "name",
  "playtimeHours",
  "storeUrl",
];
const baseEnv = {
  WORKER_ENV: "production",
  STEAM_API_KEY: "test-steam-api-key",
  STEAM_ID: "test-steam-id",
};

let fetchMock;
let cacheMatchMock;

function upstreamGame(appid, playtimeForever = 60, overrides = {}) {
  return {
    appid,
    name: "Game " + appid,
    playtime_forever: playtimeForever,
    img_icon_url: "private-icon-" + appid,
    rtime_last_played: 1234567890,
    ...overrides,
  };
}

function steamApiResponse(games) {
  return new Response(
    JSON.stringify({
      response: {
        game_count: Array.isArray(games) ? games.length : 0,
        games,
      },
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}

async function requestSteam({
  env = baseEnv,
  games = [],
  origin = productionOrigin,
} = {}) {
  const pendingTasks = [];

  fetchMock.mockResolvedValueOnce(steamApiResponse(games));

  const response = await worker.fetch(
    new Request(steamUrl, { headers: { Origin: origin } }),
    env,
    {
      waitUntil(task) {
        pendingTasks.push(task);
      },
    },
  );

  await Promise.all(pendingTasks);
  return response;
}

function expectAllowedCors(response, origin) {
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
  expect(response.headers.get("Access-Control-Allow-Origin")).not.toBe("*");
  expect(response.headers.get("Vary")).toMatch(/(?:^|,\s*)Origin(?:,|$)/i);
}

function expectRejectedCors(response) {
  expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
  expect(response.headers.has("Access-Control-Allow-Methods")).toBe(false);
  expect(response.headers.has("Access-Control-Allow-Headers")).toBe(false);
  expect(response.headers.get("Vary")).toMatch(/(?:^|,\s*)Origin(?:,|$)/i);
}

beforeEach(() => {
  fetchMock = vi.fn();
  cacheMatchMock = vi.fn(async () => undefined);
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("caches", {
    default: {
      match: cacheMatchMock,
      put: vi.fn(async () => undefined),
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Steam Worker public library view model", () => {
  test("returns only the five allowlisted games in deterministic order", async () => {
    const games = [
      upstreamGame(900001, 500000),
      ...[...allowedAppids]
        .reverse()
        .map((appid, index) => upstreamGame(appid, (index + 1) * 60)),
      upstreamGame(900002, 400000),
    ];

    const response = await requestSteam({ games });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({ ok: true, source: "Steam", count: 5 });
    expect(data.games.map((game) => game.appid)).toEqual(allowedAppids);
    expect(data.games).toHaveLength(5);
    expect(data.games.every((game) => allowedAppids.includes(game.appid))).toBe(
      true,
    );
  });

  test("keeps a required low-playtime game outside the old top 30", async () => {
    const unrelatedGames = Array.from({ length: 31 }, (_, index) =>
      upstreamGame(910000 + index, 100000 - index),
    );
    const requiredGame = upstreamGame(2458530, 1);

    const response = await requestSteam({
      games: [...unrelatedGames, requiredGame],
    });
    const data = await response.json();

    expect(data.games).toEqual([
      {
        appid: 2458530,
        name: "Game 2458530",
        playtimeHours: 0,
        coverUrl:
          "https://cdn.cloudflare.steamstatic.com/steam/apps/2458530/library_600x900.jpg",
        capsuleUrl:
          "https://cdn.cloudflare.steamstatic.com/steam/apps/2458530/header.jpg",
        storeUrl: "https://store.steampowered.com/app/2458530/",
      },
    ]);
  });

  test("omits unrelated high-playtime games and never exceeds five items", async () => {
    const games = [
      ...Array.from({ length: 100 }, (_, index) =>
        upstreamGame(920000 + index, 1000000 - index),
      ),
      ...allowedAppids.map((appid) => upstreamGame(appid, 1)),
    ];

    const response = await requestSteam({ games });
    const data = await response.json();

    expect(data.games).toHaveLength(5);
    expect(data.games.map((game) => game.appid)).toEqual(allowedAppids);
    expect(JSON.stringify(data)).not.toContain("Game 920000");
    expect(JSON.stringify(data)).not.toContain("1000000");
  });

  test("succeeds without the banner game and returns the remaining allowlisted games", async () => {
    const remainingAppids = allowedAppids.slice(1);
    const response = await requestSteam({
      games: remainingAppids.map((appid) => upstreamGame(appid)),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({ ok: true, count: remainingAppids.length });
    expect(data.games.map((game) => game.appid)).toEqual(remainingAppids);
  });

  test("succeeds when favorite games are missing", async () => {
    const response = await requestSteam({ games: [upstreamGame(3418570)] });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({ ok: true, count: 1 });
    expect(data.games.map((game) => game.appid)).toEqual([3418570]);
  });

  test("deduplicates upstream appids by keeping the first matching item", async () => {
    const response = await requestSteam({
      games: [
        upstreamGame(3418570, 60, { name: "First banner" }),
        upstreamGame(3418570, 6000, { name: "Duplicate banner" }),
        ...allowedAppids.slice(1).flatMap((appid) => [
          upstreamGame(appid, 60),
          upstreamGame(appid, 6000, {
            name: "Duplicate " + appid,
          }),
        ]),
      ],
    });
    const data = await response.json();

    expect(data.games).toHaveLength(5);
    expect(data.games.map((game) => game.appid)).toEqual(allowedAppids);
    expect(data.games[0].name).toBe("First banner");
    expect(
      data.games.some((game) => game.name.startsWith("Duplicate")),
    ).toBe(false);
  });

  test("preserves the structured failure contract for non-array game data", async () => {
    const response = await requestSteam({ games: { malformed: true } });

    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=300");
    expect(response.headers.get("X-Cache")).toBe("FALLBACK");
    expect(await response.json()).toEqual({
      ok: false,
      source: "Steam",
      message: "Steam library temporarily unavailable",
      games: [],
    });
  });

  test("returns only fields consumed by the About frontend", async () => {
    const response = await requestSteam({
      games: allowedAppids.map((appid) => upstreamGame(appid)),
    });
    const data = await response.json();

    for (const game of data.games) {
      expect(Object.keys(game).sort()).toEqual(publicGameFields);
      expect(game).not.toHaveProperty("playtime_forever");
      expect(game).not.toHaveProperty("playtimeMinutes");
      expect(game).not.toHaveProperty("img_icon_url");
      expect(game).not.toHaveProperty("rtime_last_played");
    }
  });

  test.each([
    ["production", productionOrigin, true],
    ["production", betaOrigin, false],
    ["beta", betaOrigin, true],
    ["beta", productionOrigin, false],
  ])(
    "keeps %s CORS isolation for %s",
    async (workerEnvironment, origin, corsAllowed) => {
      const response = await requestSteam({
        env: { ...baseEnv, WORKER_ENV: workerEnvironment },
        games: [upstreamGame(3418570)],
        origin,
      });

      if (corsAllowed) {
        expectAllowedCors(response, origin);
      } else {
        expectRejectedCors(response);
      }
    },
  );

  test("uses a fresh cache namespace for allowlisted responses", async () => {
    await requestSteam({ games: [] });

    expect(cacheMatchMock).toHaveBeenCalledTimes(1);
    expect(cacheMatchMock.mock.calls[0][0].url).toBe(
      "https://api.example.test/api/steam-library-v6",
    );
  });

  test("uses the stubbed Steam fetch exactly once", async () => {
    await requestSteam({ games: [] });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toMatch(
      /^https:\/\/api\.steampowered\.com\/IPlayerService\/GetOwnedGames\/v1\//,
    );
    expect(options).toMatchObject({
      headers: {
        Accept: "application/json",
        "User-Agent": "huihui.dev steam library worker",
      },
    });
  });
});
