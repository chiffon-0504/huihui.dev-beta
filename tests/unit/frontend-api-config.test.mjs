import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, test } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const productionApiBase = "https://api.huihui.dev";
const betaApiBase = "https://huihui-api-beta.huihuigames01.workers.dev";

async function loadMain(hostname) {
  const source = await readFile(path.join(root, "js/main.js"), "utf8");
  const contactForm = { action: `${productionApiBase}/api/contact` };
  let init;
  const context = {
    document: {
      addEventListener(event, listener) {
        if (event === "DOMContentLoaded") init = listener;
      },
      getElementById(id) {
        return id === "contact-form" ? contactForm : null;
      },
    },
    window: { location: { hostname } },
  };

  vm.createContext(context);
  vm.runInContext(source, context, { filename: "js/main.js" });

  return {
    contactForm,
    init,
    resolve(candidate) {
      return vm.runInContext(
        `getHuihuiApiBase(${JSON.stringify(candidate)})`,
        context,
      );
    },
  };
}

describe("frontend API environment configuration", () => {
  test("uses the beta API only for the exact beta hostname", async () => {
    const site = await loadMain("beta.huihui.dev");

    expect(site.resolve("beta.huihui.dev")).toBe(betaApiBase);
    expect(site.resolve("BETA.HUIHUI.DEV")).toBe(betaApiBase);
    expect(site.resolve("beta.huihui.dev.evil.example")).toBe(
      productionApiBase,
    );
    expect(site.resolve("preview.beta.huihui.dev")).toBe(productionApiBase);
  });

  test("uses the canonical production API for non-beta hosts", async () => {
    const site = await loadMain("huihui.dev");

    expect(site.resolve("huihui.dev")).toBe(productionApiBase);
    expect(site.resolve("www.huihui.dev")).toBe(productionApiBase);
    expect(site.resolve("127.0.0.1")).toBe(productionApiBase);
  });

  test("configures the contact form action for the current environment", async () => {
    const betaSite = await loadMain("beta.huihui.dev");
    const productionSite = await loadMain("huihui.dev");

    betaSite.init();
    productionSite.init();

    expect(betaSite.contactForm.action).toBe(`${betaApiBase}/api/contact`);
    expect(productionSite.contactForm.action).toBe(
      `${productionApiBase}/api/contact`,
    );
  });

  test("removes direct production workers.dev usage from frontend modules", async () => {
    const frontendSources = await Promise.all(
      ["js/main.js", "js/home-cards.js", "js/about-page.js"].map((file) =>
        readFile(path.join(root, file), "utf8"),
      ),
    );

    for (const source of frontendSources) {
      expect(source).not.toContain(
        "https://huihui-api.huihuigames01.workers.dev",
      );
    }
  });
});
