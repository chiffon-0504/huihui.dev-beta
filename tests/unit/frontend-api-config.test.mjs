import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, test } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const productionApiBase = "https://api.huihui.dev";
const betaApiBase = "https://huihui-api-beta.huihuigames01.workers.dev";
const contactPages = [
  "contact/index.html",
  "en/contact/index.html",
  "ja/contact/index.html",
];

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
  test("uses the beta API for approved beta hostnames", async () => {
    const site = await loadMain("beta.huihui.dev");

    for (const hostname of [
      "beta.huihui.dev",
      "BETA.HUIHUI.DEV",
      "huihuidev-beta.pages.dev",
      "5a827187.huihuidev-beta.pages.dev",
      "RELEASE-TEST.HUIHUIDEV-BETA.PAGES.DEV",
    ]) {
      expect(site.resolve(hostname)).toBe(betaApiBase);
    }
  });

  test("uses the canonical production API for non-beta hosts", async () => {
    const site = await loadMain("huihui.dev");

    for (const hostname of [
      "huihui.dev",
      "www.huihui.dev",
      "127.0.0.1",
      "another-project.pages.dev",
      "attacker.pages.dev",
      "evil-huihuidev-beta.pages.dev",
      "huihuidev-beta.pages.dev.evil.example",
      "preview.beta.huihui.dev",
      "beta.huihui.dev.evil.example",
    ]) {
      expect(site.resolve(hostname)).toBe(productionApiBase);
    }
  });

  test("configures the contact form action for the current environment", async () => {
    const betaSite = await loadMain(
      "5a827187.huihuidev-beta.pages.dev",
    );
    const productionSite = await loadMain("huihui.dev");

    expect(betaSite.contactForm.action).toBe(
      `${productionApiBase}/api/contact`,
    );

    betaSite.init();
    productionSite.init();

    expect(betaSite.contactForm.action).toBe(`${betaApiBase}/api/contact`);
    expect(productionSite.contactForm.action).toBe(
      `${productionApiBase}/api/contact`,
    );
  });

  test("keeps the production Contact fallback and Turnstile action without JavaScript", async () => {
    for (const relativePath of contactPages) {
      const html = await readFile(path.join(root, relativePath), "utf8");

      expect(html, relativePath).toContain(
        `action="${productionApiBase}/api/contact"`,
      );
      expect(html, relativePath).not.toContain(
        `action="${betaApiBase}/api/contact"`,
      );
      expect(html, relativePath).toContain('data-action="contact"');
    }
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
