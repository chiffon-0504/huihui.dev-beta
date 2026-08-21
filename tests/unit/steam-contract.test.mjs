import { describe, expect, test } from "vitest";
import {
  STEAM_DEGRADED_MESSAGE,
  classifySteamResponse,
  isSteamUiStateAllowed,
} from "../support/steam-contract.mjs";

const game = {
  appid: 3418570,
  name: "Example",
  playtimeHours: 1.5,
  coverUrl: "https://cdn.example.test/cover.jpg",
  capsuleUrl: "https://cdn.example.test/capsule.jpg",
  storeUrl: "https://store.example.test/app/3418570/",
};

describe("Steam deployment response contract", () => {
  test.each([
    ["games", [game]],
    ["empty games", []],
  ])("accepts a healthy response with %s", (_label, games) => {
    expect(
      classifySteamResponse(200, {
        ok: true,
        source: "Steam",
        count: games.length,
        games,
      }),
    ).toBe("healthy");
  });

  test("accepts only the documented degraded response", () => {
    expect(
      classifySteamResponse(500, {
        ok: false,
        source: "Steam",
        message: STEAM_DEGRADED_MESSAGE,
        games: [],
      }),
    ).toBe("degraded");
  });

  test.each([
    ["malformed body", null],
    [
      "wrong source",
      {
        ok: false,
        source: "Other",
        message: STEAM_DEGRADED_MESSAGE,
        games: [],
      },
    ],
    [
      "wrong message",
      {
        ok: false,
        source: "Steam",
        message: "Internal error",
        games: [],
      },
    ],
    [
      "non-empty games",
      {
        ok: false,
        source: "Steam",
        message: STEAM_DEGRADED_MESSAGE,
        games: [game],
      },
    ],
    [
      "extra fields",
      {
        ok: false,
        source: "Steam",
        message: STEAM_DEGRADED_MESSAGE,
        games: [],
        error: "exception",
      },
    ],
  ])("rejects a documented-status 500 with %s", (_label, body) => {
    expect(classifySteamResponse(500, body)).toBeNull();
  });

  test.each([
    ["healthy cards", "healthy", "cards", true],
    ["healthy empty", "healthy", "empty", true],
    ["healthy error mismatch", "healthy", "error", false],
    ["degraded error", "degraded", "error", true],
    ["degraded empty mismatch", "degraded", "empty", false],
    ["loading", "degraded", "loading", false],
  ])("matches the response family to the %s UI", (_label, family, ui, allowed) => {
    expect(isSteamUiStateAllowed(family, ui)).toBe(allowed);
  });
});
