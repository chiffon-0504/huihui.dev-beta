const SITE_BASE_URL = "https://beta.huihui.dev";
const API_BASE_URL = "https://huihui-api-beta.huihuigames01.workers.dev";
const REQUEST_TIMEOUT_MS = 15_000;

const pageContracts = [
  { path: "/", lang: "zh-Hant", identity: /<h1>huihui\.dev<\/h1>/i },
  { path: "/en/", lang: "en", identity: /<h1>huihui\.dev<\/h1>/i },
  { path: "/ja/", lang: "ja", identity: /<h1>huihui\.dev<\/h1>/i },
  { path: "/about/", lang: "zh-Hant", identity: /id=["']aboutPage["']/i },
  { path: "/contact/", lang: "zh-Hant", identity: /id=["']contact-form["']/i },
];

async function getResponse(url, headers = {}) {
  return fetch(url, {
    headers,
    redirect: "follow",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

async function checkPage({ path, lang, identity }) {
  const url = new URL(path, SITE_BASE_URL);
  const response = await getResponse(url);
  const body = await response.text();
  const contentType = response.headers.get("content-type") || "";

  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  if (!contentType.toLowerCase().includes("text/html")) {
    throw new Error(`${url} returned unexpected Content-Type ${contentType}`);
  }
  if (!body.trim()) throw new Error(`${url} returned empty HTML`);
  if (!new RegExp(`<html[^>]+lang=["']${lang}["']`, "i").test(body)) {
    throw new Error(`${url} did not identify the expected ${lang} page`);
  }
  if (!identity.test(body)) throw new Error(`${url} failed its page identity check`);
  if (
    /deployment_not_found|deployment not found|cloudflare ray id|<title>\s*(?:error|404 not found)/i.test(
      body,
    )
  ) {
    throw new Error(`${url} appears to be an infrastructure error page`);
  }

  console.log(`Page healthy: ${url} (${response.status}, ${body.length} bytes)`);
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
  const body = await response.json().catch(() => null);
  assertJsonResponse(response, body, url);

  if (response.status !== 200 || body.ok !== true || !Array.isArray(body.techNews)) {
    throw new Error(`${url} failed the expected HTTP 200 techNews contract`);
  }
  console.log(`API healthy: ${url} (${body.techNews.length} items)`);
}

async function checkSteamLibrary() {
  const url = `${API_BASE_URL}/api/steam-library`;
  const response = await getResponse(url, { Origin: SITE_BASE_URL });
  const body = await response.json().catch(() => null);
  assertJsonResponse(response, body, url);

  const success =
    response.status === 200 &&
    body.ok === true &&
    body.source === "Steam" &&
    Number.isInteger(body.count) &&
    Array.isArray(body.games);
  const validDegradedState =
    response.status === 500 &&
    body.ok === false &&
    body.source === "Steam" &&
    typeof body.message === "string" &&
    Array.isArray(body.games);

  if (!success && !validDegradedState) {
    throw new Error(`${url} failed the expected success/degraded response contract`);
  }
  console.log(
    success
      ? `API healthy: ${url} (${body.games.length} games)`
      : `API valid degraded state: ${url} (HTTP ${response.status}: ${body.message})`,
  );
}

await Promise.all(pageContracts.map(checkPage));
await Promise.all([checkTechNews(), checkSteamLibrary()]);
