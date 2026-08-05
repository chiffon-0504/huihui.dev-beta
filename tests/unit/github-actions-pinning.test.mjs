import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "vitest";
import { parseDocument } from "yaml";

const root = path.resolve(import.meta.dirname, "../..");
const workflowsDirectory = path.join(root, ".github/workflows");

function parseWorkflow(source, workflowFile) {
  const document = parseDocument(source);
  if (document.errors.length > 0) {
    const details = document.errors.map((error) => error.message).join("; ");
    throw new Error(`${workflowFile} is not valid YAML: ${details}`);
  }

  return document.toJS();
}

function collectUsesReferences(value, location = "$", references = []) {
  if (Array.isArray(value)) {
    value.forEach((child, index) => {
      collectUsesReferences(child, `${location}[${index}]`, references);
    });
    return references;
  }

  if (!value || typeof value !== "object") return references;

  for (const [key, child] of Object.entries(value)) {
    const childLocation = `${location}.${key}`;
    if (key === "uses") {
      references.push({ location: childLocation, reference: child });
    }
    collectUsesReferences(child, childLocation, references);
  }

  return references;
}

function requiresCommitPin(reference) {
  if (typeof reference !== "string") return true;

  const normalized = reference.toLowerCase();
  return (
    !reference.startsWith("./") &&
    !reference.startsWith("../") &&
    !normalized.startsWith("docker://")
  );
}

function usesFullCommitSha(reference) {
  if (typeof reference !== "string") return false;

  const separator = reference.lastIndexOf("@");
  return separator > 0 && /^[0-9a-f]{40}$/.test(reference.slice(separator + 1));
}

function validateWorkflowActionPins(source, workflowFile) {
  const references = collectUsesReferences(parseWorkflow(source, workflowFile));
  const thirdPartyReferences = references.filter(({ reference }) =>
    requiresCommitPin(reference),
  );
  const invalidReferences = thirdPartyReferences.filter(
    ({ reference }) => !usesFullCommitSha(reference),
  );

  if (invalidReferences.length > 0) {
    const details = invalidReferences
      .map(
        ({ location, reference }) =>
          `${workflowFile}:${location} ${String(reference)}`,
      )
      .join("; ");
    throw new Error(`Third-party actions must use full commit SHAs: ${details}`);
  }

  return thirdPartyReferences.length;
}

async function workflowFiles() {
  const entries = await readdir(workflowsDirectory, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  expect(files.length, "workflow files").toBeGreaterThan(0);
  return files;
}

describe("GitHub Actions commit pinning", () => {
  test("pins every third-party workflow action to a full commit SHA", async () => {
    let thirdPartyReferenceCount = 0;

    for (const workflowFile of await workflowFiles()) {
      const source = await readFile(
        path.join(workflowsDirectory, workflowFile),
        "utf8",
      );
      thirdPartyReferenceCount += validateWorkflowActionPins(
        source,
        workflowFile,
      );
    }

    expect(
      thirdPartyReferenceCount,
      "third-party uses references",
    ).toBeGreaterThan(0);
  });

  test("rejects tags, branches, and short commit SHAs", () => {
    const rejectedReferences = [
      "owner/action@v4",
      "owner/action@v3",
      "owner/action@main",
      "owner/action@master",
      "owner/action@0123456789ab",
    ];

    for (const reference of rejectedReferences) {
      expect(usesFullCommitSha(reference), reference).toBe(false);
    }
  });

  test("does not apply GitHub commit pinning to local or Docker actions", () => {
    const source = `
jobs:
  local-workflow:
    uses: ./.github/workflows/local-reusable.yml
  test:
    steps:
      - "uses": ./.github/actions/local-composite
      - 'uses': ../shared/action
      - uses: docker://alpine:3.22
      - uses: docker://ghcr.io/example/action@sha256:0123456789abcdef
`;

    expect(validateWorkflowActionPins(source, "excluded.yml")).toBe(0);
  });

  test.each([
    {
      keyStyle: "bare step key",
      source: `
jobs:
  test:
    steps:
      - uses: owner/action@v3
`,
    },
    {
      keyStyle: "double-quoted step key",
      source: `
jobs:
  test:
    steps:
      - "uses": owner/action@v4
`,
    },
    {
      keyStyle: "single-quoted reusable-workflow key",
      source: `
jobs:
  reusable:
    'uses': owner/workflows/.github/workflows/test.yml@main
`,
    },
  ])("rejects a floating tag under a $keyStyle", ({ source }) => {
    expect(() => validateWorkflowActionPins(source, "floating.yml")).toThrow(
      /Third-party actions must use full commit SHAs/,
    );
  });

  test.each([
    {
      keyStyle: "bare step key",
      source: `
jobs:
  test:
    steps:
      - uses: owner/action@0123456789abcdef0123456789abcdef01234567
`,
    },
    {
      keyStyle: "double-quoted step key",
      source: `
jobs:
  test:
    steps:
      - "uses": owner/action@0123456789abcdef0123456789abcdef01234567
`,
    },
    {
      keyStyle: "single-quoted reusable-workflow key",
      source: `
jobs:
  reusable:
    'uses': owner/workflows/.github/workflows/test.yml@0123456789abcdef0123456789abcdef01234567
`,
    },
  ])("accepts a full commit SHA under a $keyStyle", ({ source }) => {
    expect(validateWorkflowActionPins(source, "pinned.yml")).toBe(1);
  });
});

describe("Playwright cross-browser validation contract", () => {
  test("keeps the full Chromium suite separate from Firefox and WebKit smoke", async () => {
    const defaultConfig = (
      await import(pathToFileURL(path.join(root, "playwright.config.mjs")).href)
    ).default;
    const crossBrowserConfig = (
      await import(
        pathToFileURL(
          path.join(root, "playwright.cross-browser.config.mjs"),
        ).href
      )
    ).default;
    const packageJson = JSON.parse(
      await readFile(path.join(root, "package.json"), "utf8"),
    );

    expect(defaultConfig.testDir).toBe("./tests/e2e");
    expect(defaultConfig.testMatch).toBeUndefined();
    expect(defaultConfig.projects.map(({ name }) => name)).toEqual([
      "chromium",
    ]);
    expect(packageJson.scripts["test:e2e"]).toBe("playwright test");

    expect(crossBrowserConfig.testDir).toBe("./tests/e2e");
    expect(crossBrowserConfig.testMatch).toBe(
      "cross-browser-critical.spec.mjs",
    );
    expect(crossBrowserConfig.globalSetup).toBe(
      "./tests/support/global-setup.mjs",
    );
    expect(crossBrowserConfig.use).toMatchObject({
      baseURL: "http://127.0.0.1:4173",
      trace: "retain-on-failure",
    });
    expect(crossBrowserConfig.projects.map(({ name }) => name)).toEqual([
      "firefox",
      "webkit",
    ]);
    expect(crossBrowserConfig.workers).toBe(1);
    expect(crossBrowserConfig.retries).toBe(process.env.CI ? 1 : 0);
    expect(crossBrowserConfig).not.toHaveProperty("timeout");
    expect(crossBrowserConfig.expect).toBeUndefined();
    expect(crossBrowserConfig.webServer).toBeUndefined();
  });

  test("keeps the critical smoke file browser-independent and timeout-neutral", async () => {
    const source = await readFile(
      path.join(root, "tests/e2e/cross-browser-critical.spec.mjs"),
      "utf8",
    );

    expect(source).not.toMatch(/(?:newCDPSession|CDPSession)/);
    expect(source).not.toMatch(/waitForTimeout|setTimeout\s*\(/);
    expect(source).not.toMatch(/test\.(?:skip|fixme|setTimeout)\s*\(/);
    expect(source).not.toMatch(/\bbrowserName\b/);
    expect(source).not.toMatch(/\bchromium\b/i);
  });

  test("installs all project browsers and runs both E2E tiers in Validate", async () => {
    const source = await readFile(
      path.join(workflowsDirectory, "validate.yml"),
      "utf8",
    );
    const workflow = parseWorkflow(source, "validate.yml");
    const validate = workflow.jobs.validate;
    const steps = validate.steps;
    const installStep = steps.find(
      ({ name }) => name === "Install Playwright browsers",
    );
    const chromiumStep = steps.find(
      ({ name }) => name === "Run Chromium full E2E suite",
    );
    const crossBrowserStep = steps.find(
      ({ name }) => name === "Run Firefox and WebKit critical smoke tests",
    );

    expect(validate["timeout-minutes"]).toBe(15);
    expect(installStep?.run).toBe(
      "npx playwright install --with-deps chromium firefox webkit",
    );
    expect(chromiumStep?.run).toBe("npm run test:e2e");
    expect(crossBrowserStep?.run).toBe(
      "npx playwright test --config=playwright.cross-browser.config.mjs",
    );
    expect(crossBrowserStep).not.toHaveProperty("continue-on-error");
  });

  test("does not add package dependencies for cross-browser coverage", async () => {
    const packageJson = JSON.parse(
      await readFile(path.join(root, "package.json"), "utf8"),
    );

    expect(packageJson.dependencies).toBeUndefined();
    expect(packageJson.devDependencies).toEqual({
      "@playwright/test": "^1.61.1",
      vitest: "^4.1.10",
      yaml: "2.8.3",
    });
  });
});
