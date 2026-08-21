export const STEAM_DEGRADED_MESSAGE =
  "Steam library temporarily unavailable";

export function isValidSteamGame(game) {
  if (
    !game ||
    typeof game !== "object" ||
    !Number.isInteger(game.appid) ||
    typeof game.name !== "string" ||
    !game.name.trim() ||
    !Number.isFinite(game.playtimeHours) ||
    game.playtimeHours < 0
  ) {
    return false;
  }

  return [game.coverUrl, game.capsuleUrl, game.storeUrl].every((value) => {
    try {
      return new URL(value).protocol === "https:";
    } catch (error) {
      return false;
    }
  });
}

export function classifySteamResponse(status, body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;

  if (
    status === 200 &&
    body.ok === true &&
    body.source === "Steam" &&
    Number.isInteger(body.count) &&
    body.count >= 0 &&
    Array.isArray(body.games) &&
    body.count === body.games.length &&
    body.games.every(isValidSteamGame)
  ) {
    return "healthy";
  }

  if (
    status === 500 &&
    body.ok === false &&
    body.source === "Steam" &&
    body.message === STEAM_DEGRADED_MESSAGE &&
    Array.isArray(body.games) &&
    body.games.length === 0 &&
    Object.keys(body).sort().join(",") === "games,message,ok,source"
  ) {
    return "degraded";
  }

  return null;
}

export function isSteamUiStateAllowed(responseFamily, uiState) {
  if (responseFamily === "healthy") {
    return uiState === "cards" || uiState === "empty";
  }
  return responseFamily === "degraded" && uiState === "error";
}
