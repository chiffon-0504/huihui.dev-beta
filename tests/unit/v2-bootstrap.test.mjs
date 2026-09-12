import { Script, createContext } from "node:vm";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { build } from "vite";
import config from "../../vite.v2.config.mjs";
import { THEME_STORAGE_KEY } from "../../v2/src/theme/preference.ts";

let output;
let bootstrap;
let source;

beforeAll(async () => {
  // Exercise the real HTML/plugin pipeline entirely in memory; never replace dist.
  const result = await build({
    ...config,
    configFile: false,
    logLevel: "silent",
    build: { ...config.build, write: false, emptyOutDir: false },
  });
  output = (Array.isArray(result) ? result : [result]).flatMap((entry) => entry.output);
  const scripts = output.filter((entry) => /^assets\/theme-bootstrap-[a-f0-9]+\.js$/.test(entry.fileName));
  expect(scripts).toHaveLength(1);
  bootstrap = scripts[0];
  expect(bootstrap.type).toBe("asset");
  source = String(bootstrap.source);
}, 30_000);

describe("v2 initial theme build contract", () => {
  test.each(["index.html", "en/index.html", "ja/index.html"])("%s blocks parsing with an external classic bootstrap before styles and app", (entry) => {
    const html = String(output.find((asset) => asset.fileName === entry)?.source);
    const tag = `<script src="/${bootstrap.fileName}"></script>`;
    expect(html).toContain(tag);
    const position = html.indexOf(tag);
    expect(position).toBeGreaterThan(html.indexOf("<head>"));
    expect(position).toBeLessThan(html.indexOf("</head>"));
    expect(position).toBeLessThan(html.indexOf('type="module"'));
    expect(position).toBeLessThan(html.indexOf('rel="stylesheet"'));
    // The exact bootstrap tag above excludes module, async, defer and inline code.
    // Preserve the same CSP-safe external-only contract for every generated script.
    for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
      expect(script[1]).toMatch(/\bsrc="\/[^"\s]+"/);
      expect(script[2].trim()).toBe("");
    }
  });

  test("the generated bootstrap parses as a classic script without module or dynamic-code execution", () => {
    expect(() => new Script(source)).not.toThrow();
    expect(source).not.toMatch(/\bimport\s*\(|\beval\b|\bFunction\s*\(/);
  });
});

function runBootstrap(saved, time, timeZone, blockedStorage = false) {
  const root = { dataset: {} };
  const getItem = vi.fn(() => saved);
  const setItem = vi.fn(() => { throw new Error("Bootstrap must never write the preference"); });
  const host = {};
  Object.defineProperty(host, "localStorage", {
    get() {
      if (blockedStorage) throw new Error("Storage denied");
      return { getItem, setItem };
    },
  });
  class Clock extends Date { static now() { return Date.parse(time); } }
  function DateTimeFormat(locale, options) {
    return options ? new Intl.DateTimeFormat(locale, options) : { resolvedOptions: () => ({ timeZone }) };
  }
  // No location, network, timer or application DOM APIs are available here.
  // Disable dynamic code generation as an additional unsafe-eval negative control.
  const context = createContext({ window: host, document: { documentElement: root }, Date: Clock, Intl: { DateTimeFormat } }, {
    codeGeneration: { strings: false, wasm: false },
  });
  new Script(source).runInContext(context);
  if (!blockedStorage) expect(getItem).toHaveBeenCalledExactlyOnceWith(THEME_STORAGE_KEY);
  expect(setItem).not.toHaveBeenCalled();
  return root.dataset.theme;
}

describe("compiled bootstrap preference and Auto behavior", () => {
  test.each([
    [null, "2026-09-12T02:00:00+08:00", "Asia/Taipei", "dark"],
    [null, "2026-09-12T12:00:00+08:00", "Asia/Taipei", "light"],
    ["auto", "2026-09-12T23:00:00+08:00", "Asia/Taipei", "dark"],
    ["auto", "2026-09-12T12:00:00+08:00", "Asia/Taipei", "light"],
    ["light", "2026-09-12T23:00:00+08:00", "Asia/Taipei", "light"],
    ["dark", "2026-09-12T12:00:00+08:00", "Asia/Taipei", "dark"],
    [null, "2026-09-12T23:00:00Z", "UTC", "light"],
    ["auto", "2026-09-12T23:00:00Z", "Invalid/Zone", "light"],
  ])("stored %s at %s in %s initializes %s without writing storage", (saved, time, timeZone, expected) => {
    expect(runBootstrap(saved, time, timeZone)).toBe(expected);
  });

  test("denied localStorage still initializes Auto safely before rendering", () => {
    expect(runBootstrap(null, "2026-09-12T23:00:00+08:00", "Asia/Taipei", true)).toBe("dark");
  });
});
