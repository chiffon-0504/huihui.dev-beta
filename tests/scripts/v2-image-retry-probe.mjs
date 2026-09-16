// Diagnostic observations, not a passing acceptance test. Never contacts R2.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, expect, firefox } from "@playwright/test";
import { jpeg } from "../support/v2-viewer-fixture.mjs";

const immutable = "public, max-age=31536000, immutable";
const uncontrolled = process.argv.includes("--uncontrolled");
const counts = new Map();
let report;
const reported = new Promise((resolve) => { report = resolve; });

// Runs in a plain document without the viewer or any application state.
function installProbe({ url, lifecycle }) {
  const observations = { attempts: [], events: [] };
  window.probe = observations;
  let retained;
  const button = document.createElement("button");
  button.textContent = "Attempt";
  document.body.replaceChildren(button);
  button.onclick = async () => {
    const attempt = observations.attempts.length + 1;
    const image = lifecycle === "same-element" && retained ? retained : new Image();
    retained = image;
    image.referrerPolicy = "no-referrer";
    image.addEventListener("error", () => observations.events.push(`${attempt}:error`), { once: true });
    image.addEventListener("load", () => observations.events.push(`${attempt}:load`), { once: true });
    let result;
    if (lifecycle === "event-remove") {
      const done = new Promise((resolve) => {
        image.onload = () => resolve("load");
        image.onerror = () => resolve("error");
      });
      image.src = url;
      result = await done;
    } else {
      image.src = url;
      result = await image.decode().then(() => "decoded", (error) => error.name);
    }
    observations.events.push(`${attempt}:${result}`);
    observations.attempts.push({ result, width: image.naturalWidth });
    if (lifecycle === "decode-remove" || lifecycle === "event-remove") image.removeAttribute("src");
    button.dataset.attempt = String(attempt);
  };
  return button;
}

const server = createServer((request, response) => {
  if (request.url === "/result" && request.method === "POST") {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => { response.end("ok"); report(JSON.parse(body)); });
  } else if (request.url.endsWith(".jpg")) {
    const count = (counts.get(request.url) ?? 0) + 1;
    counts.set(request.url, count);
    response.writeHead(count === 1 && request.url.includes("404") ? 404 : 200, {
      "content-type": "image/jpeg",
      "cache-control": request.url.includes("immutable") ? immutable : "no-store",
    });
    response.end(count === 1 ? "invalid" : jpeg);
  } else if (request.url === "/probe.js") {
    response.setHeader("content-type", "text/javascript");
    response.end(`const installProbe = ${installProbe.toString()};
      (async () => {
        const cases = [];
        for (const cache of ["no-store", "immutable"]) for (const failure of ["404", "decode"]) {
          const button = installProbe({ url: "/" + cache + "-" + failure + ".jpg", lifecycle: "decode-remove" });
          // No automation protocol: invoke the same handler twice from page script.
          await button.onclick();
          await button.onclick();
          cases.push({cache, failure, ...window.probe});
        }
        await fetch("/result", {method: "POST", body: JSON.stringify({userAgent: navigator.userAgent, cases})});
      })();`);
  } else {
    response.setHeader("content-type", "text/html");
    response.end(`<!doctype html><title>Native image retry probe</title>${uncontrolled ? '<script defer src="/probe.js"></script>' : ""}`);
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

try {
  if (uncontrolled) {
    // Same installed binary, fresh profile, no Playwright launch preferences or Juggler.
    // This does not substitute for testing an independently installed stock Firefox.
    await mkdir("test-results", { recursive: true });
    const profile = await mkdtemp(resolve("test-results/firefox-native-"));
    const process = spawn(firefox.executablePath(), ["--headless", "--no-remote", "--profile", profile, origin],
      { windowsHide: true, stdio: "ignore" });
    let timer;
    try {
      const result = await Promise.race([reported, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Uncontrolled Firefox did not report within 30 seconds")), 30_000);
        process.once("error", reject);
      })]);
      console.log(JSON.stringify({ ...result, requests: Object.fromEntries(counts) }));
    } finally { clearTimeout(timer); process.kill(); }
  } else {
    for (const engine of [firefox, chromium]) {
      const browser = await engine.launch();
      try {
        console.log(JSON.stringify({ engine: engine.name(), version: browser.version(), platform: process.platform }));
        for (const transport of ["http", "route"]) for (const cache of ["no-store", "immutable"])
        for (const failure of ["404", "decode"]) for (const lifecycle of ["decode-remove", "decode-retain", "event-remove", "same-element"]) {
          const page = await browser.newPage();
          try {
            const path = `/${engine.name()}-${transport}-${cache}-${failure}-${lifecycle}.jpg`;
            let intercepted = 0;
            if (transport === "route") await page.route(origin + path, (route) => {
              intercepted++;
              return route.fulfill({ status: intercepted === 1 && failure === "404" ? 404 : 200,
                headers: { "cache-control": cache === "immutable" ? immutable : "no-store" },
                contentType: "image/jpeg", body: intercepted === 1 ? "invalid" : jpeg });
            });
            await page.goto(origin);
            await page.evaluate(installProbe, { url: origin + path, lifecycle });
            for (let attempt = 1; attempt <= 2; attempt++) {
              await page.getByRole("button", { name: "Attempt" }).click();
              await expect(page.getByRole("button", { name: "Attempt" })).toHaveAttribute("data-attempt", String(attempt));
            }
            console.log(JSON.stringify({ engine: engine.name(), transport, cache, failure, lifecycle,
              requests: transport === "route" ? intercepted : counts.get(path),
              ...await page.evaluate(() => window.probe) }));
          } finally { await page.close(); }
        }
      } finally { await browser.close(); }
    }
  }
} finally { server.close(); }
