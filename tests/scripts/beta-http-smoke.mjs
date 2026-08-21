import { pathToFileURL } from "node:url";
import {
  BETA_SITE_ORIGIN,
  assertExactFinalUrl,
} from "../support/beta-origin.mjs";
import { classifySteamResponse } from "../support/steam-contract.mjs";

const SITE_BASE_URL = BETA_SITE_ORIGIN;
const API_BASE_URL = "https://huihui-api-beta.huihuigames01.workers.dev";
const REQUEST_TIMEOUT_MS = 15_000;

async function getResponse(url, headers = {}) {
  return fetch(url, {
    headers,
    redirect: "follow",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

export function assertBrowserCors(response, url) {
  const allowedOrigin = response.headers.get("access-control-allow-origin");
  if (allowedOrigin !== SITE_BASE_URL) {
    throw new Error(
      `${url} returned Access-Control-Allow-Origin ${allowedOrigin || "<missing>"}; expected ${SITE_BASE_URL}`,
    );
  }
}

function assertJsonResponse(response, body, url) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(`${url} returned unexpected Content-Type ${contentType}`);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error(`${url} returned an invalid top-level JSON value`);
  }
  if (/worker threw exception|internal error code: 1101/i.test(JSON.stringify(body))) {
    throw new Error(`${url} returned a Worker exception response`);
  }
}

async function checkTechNews() {
  const url = `${API_BASE_URL}/api/tech-news`;
  const response = await getResponse(url, { Origin: SITE_BASE_URL });
  assertExactFinalUrl(url, response.url);
  const body = await response.json().catch(() => null);
  assertBrowserCors(response, url);
  assertJsonResponse(response, body, url);

  if (response.status !== 200 || body.ok !== true || !Array.isArray(body.techNews)) {
    throw new Error(`${url} failed the expected HTTP 200 techNews contract`);
  }
  console.log(`API healthy: ${url} (${body.techNews.length} items)`);
}

async function checkSteamLibrary() {
  const url = `${API_BASE_URL}/api/steam-library`;
  const response = await getResponse(url, { Origin: SITE_BASE_URL });
  assertExactFinalUrl(url, response.url);
  const body = await response.json().catch(() => null);
  assertBrowserCors(response, url);
  assertJsonResponse(response, body, url);

  const responseFamily = classifySteamResponse(response.status, body);

  if (!responseFamily) {
    throw new Error(`${url} failed the expected success/degraded response contract`);
  }
  console.log(
    responseFamily === "healthy"
      ? `API healthy: ${url} (${body.games.length} games)`
      : `API valid degraded state: ${url} (HTTP ${response.status}: ${body.message})`,
  );
}

export async function runLiveSmoke() {
  await Promise.all([checkTechNews(), checkSteamLibrary()]);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runLiveSmoke().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
