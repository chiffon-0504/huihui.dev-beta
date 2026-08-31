import { pathToFileURL } from "node:url";
import {
  BETA_SITE_ORIGIN,
  assertExactFinalUrl,
} from "../support/beta-origin.mjs";
import { classifySteamResponse } from "../support/steam-contract.mjs";

const SITE_BASE_URL = BETA_SITE_ORIGIN;
const API_BASE_URL = "https://huihui-api-beta.huihuigames01.workers.dev";
const REQUEST_TIMEOUT_MS = 15_000;
const CLOCK_SKEW_TOLERANCE_MS = 60_000;
// Current System Status vocabulary, ordered by severity with Unknown overriding all.
const SYSTEM_STATUS_VALUES = [
  "operational",
  "degraded_performance",
  "partial_outage",
  "major_outage",
  "unknown",
];
const SYSTEM_STATUS_COMPONENT_IDS = ["website", "api", "contact"];

async function getResponse(url, headers = {}) {
  return fetch(url, {
    method: "GET",
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
  if (contentType.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
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

async function getStatusResponse(path) {
  const url = `${API_BASE_URL}${path}`;
  const response = await getResponse(url, { Origin: SITE_BASE_URL });
  assertExactFinalUrl(url, response.url);
  if (response.redirected) {
    throw new Error(`${url} unexpectedly redirected`);
  }
  const body = await response.json().catch(() => null);
  assertBrowserCors(response, url);
  assertJsonResponse(response, body, url);
  if (response.status !== 200) {
    throw new Error(`${url} failed the expected HTTP 200 status/readiness contract`);
  }
  if (response.headers.get("cache-control") !== "no-store") {
    throw new Error(`${url} failed the expected Cache-Control: no-store contract`);
  }
  return { url, body };
}

async function checkReadiness(path, scope) {
  const { url, body } = await getStatusResponse(path);
  if (body.ok !== true || body.status !== "operational" || body.scope !== scope) {
    throw new Error(`${url} failed the expected operational readiness contract (${scope})`);
  }
  console.log(`API ready: ${url} (${scope})`);
}

async function checkSystemStatus() {
  const startedAt = Date.now();
  const { url, body } = await getStatusResponse("/api/system-status");
  if (
    body.ok !== true ||
    !SYSTEM_STATUS_VALUES.includes(body.status) ||
    !Array.isArray(body.components) ||
    body.components.length !== SYSTEM_STATUS_COMPONENT_IDS.length ||
    !body.components.every((component) =>
      component &&
      typeof component === "object" &&
      !Array.isArray(component) &&
      SYSTEM_STATUS_COMPONENT_IDS.includes(component.id) &&
      SYSTEM_STATUS_VALUES.includes(component.status),
    ) ||
    new Set(body.components.map((component) => component.id)).size !==
      SYSTEM_STATUS_COMPONENT_IDS.length
  ) {
    throw new Error(`${url} failed the expected System Status schema`);
  }

  // Validate the observation, without requiring a transient upstream to be healthy.
  const aggregate = SYSTEM_STATUS_VALUES[Math.max(
    ...body.components.map((component) => SYSTEM_STATUS_VALUES.indexOf(component.status)),
  )];
  if (body.status !== aggregate) {
    throw new Error(`${url} returned inconsistent aggregate System Status`);
  }

  const checkedAt = typeof body.checkedAt === "string" ? Date.parse(body.checkedAt) : NaN;
  // The Worker emits a fresh ISO timestamp; allow clock skew between CI and the Worker.
  if (
    !Number.isFinite(checkedAt) ||
    new Date(checkedAt).toISOString() !== body.checkedAt ||
    checkedAt < startedAt - CLOCK_SKEW_TOLERANCE_MS ||
    checkedAt > Date.now() + CLOCK_SKEW_TOLERANCE_MS
  ) {
    throw new Error(`${url} returned an invalid execution timestamp`);
  }
  console.log(`API valid System Status: ${url} (${body.status})`);
}

export async function runLiveSmoke() {
  await Promise.all([
    checkTechNews(),
    checkSteamLibrary(),
    checkReadiness("/api/health", "worker_request_path"),
    checkReadiness("/api/contact/health", "configuration_readiness"),
    checkSystemStatus(),
  ]);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runLiveSmoke().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
