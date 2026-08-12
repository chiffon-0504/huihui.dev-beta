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

async function readWorkflow(workflowFile) {
  const source = await readFile(
    path.join(workflowsDirectory, workflowFile),
    "utf8",
  );
  return { source, workflow: parseWorkflow(source, workflowFile) };
}

function runCommands(job) {
  return (job.steps ?? [])
    .map(({ run }) => run)
    .filter((run) => typeof run === "string");
}

function actionSteps(job, action) {
  return (job.steps ?? []).filter(
    ({ uses }) => typeof uses === "string" && uses.startsWith(`${action}@`),
  );
}

function expectFailureArtifact(job, artifactName) {
  const artifacts = actionSteps(job, "actions/upload-artifact");

  expect(artifacts).toHaveLength(1);
  expect(artifacts[0].if).toContain("failure()");
  expect(artifacts[0].with.name).toBe(artifactName);
  expect(artifacts[0].with.path.split(/\r?\n/).filter(Boolean)).toEqual([
    "playwright-report/",
    "test-results/",
  ]);
  expect(artifacts[0].with["if-no-files-found"]).toBe("ignore");
  expect(artifacts[0].with["retention-days"]).toBe(7);
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
  test("keeps complete Chromium and full-compatible cross-browser suites distinct", async () => {
    const baseConfig = (
      await import(
        pathToFileURL(path.join(root, "playwright.base.config.mjs")).href
      )
    ).baseConfig;
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
    const fullCrossBrowserConfig = (
      await import(
        pathToFileURL(
          path.join(root, "playwright.full-cross-browser.config.mjs"),
        ).href
      )
    ).default;
    const packageJson = JSON.parse(
      await readFile(path.join(root, "package.json"), "utf8"),
    );

    expect(baseConfig).toMatchObject({
      testDir: "./tests/e2e",
      globalSetup: "./tests/support/global-setup.mjs",
      fullyParallel: false,
      use: {
        baseURL: "http://127.0.0.1:4173",
        trace: "retain-on-failure",
      },
    });
    expect(defaultConfig.testDir).toBe("./tests/e2e");
    expect(defaultConfig.testMatch).toBeUndefined();
    expect(defaultConfig.testIgnore).toBeUndefined();
    expect(defaultConfig.projects.map(({ name }) => name)).toEqual([
      "chromium",
    ]);
    expect(defaultConfig.retries).toBe(process.env.CI ? 1 : 0);
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
    expect(crossBrowserConfig.retries).toBe(0);
    expect(crossBrowserConfig).not.toHaveProperty("timeout");
    expect(crossBrowserConfig.expect).toBeUndefined();
    expect(crossBrowserConfig.webServer).toBeUndefined();

    expect(fullCrossBrowserConfig.testDir).toBe("./tests/e2e");
    expect(fullCrossBrowserConfig.testMatch).toBeUndefined();
    expect(fullCrossBrowserConfig.testIgnore).toEqual([
      "about-media.spec.mjs",
      "milestone-images.spec.mjs",
    ]);
    expect(fullCrossBrowserConfig.projects.map(({ name }) => name)).toEqual([
      "firefox",
      "webkit",
    ]);
    expect(fullCrossBrowserConfig.workers).toBe(1);
    expect(fullCrossBrowserConfig.retries).toBe(0);
    expect(fullCrossBrowserConfig).not.toHaveProperty("timeout");
    expect(fullCrossBrowserConfig.expect).toBeUndefined();

    const e2eDirectory = path.join(root, "tests/e2e");
    const e2eSpecFiles = (await readdir(e2eDirectory))
      .filter((file) => file.endsWith(".spec.mjs"))
      .sort();
    const chromiumOnlyApiPattern =
      /(?:CDPSession|connectOverCDP|["']Network\.(?:enable|emulateNetworkConditions))/;
    const chromiumOnlySpecFiles = [];

    for (const specFile of e2eSpecFiles) {
      const source = await readFile(path.join(e2eDirectory, specFile), "utf8");
      if (chromiumOnlyApiPattern.test(source)) {
        chromiumOnlySpecFiles.push(specFile);
      }
    }

    expect(chromiumOnlySpecFiles).toEqual(fullCrossBrowserConfig.testIgnore);

    const fullCompatibleSpecFiles = e2eSpecFiles.filter(
      (specFile) => !fullCrossBrowserConfig.testIgnore.includes(specFile),
    );
    expect(fullCompatibleSpecFiles).toContain("cross-browser-critical.spec.mjs");
    expect(fullCompatibleSpecFiles).toContain("routes.spec.mjs");
    expect(fullCompatibleSpecFiles).not.toContain("about-media.spec.mjs");
    expect(fullCompatibleSpecFiles).not.toContain("milestone-images.spec.mjs");
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

  test("keeps pull request validation fast and workflow calls browser-free", async () => {
    const { workflow } = await readWorkflow("validate.yml");

    expect(Object.hasOwn(workflow.on, "pull_request")).toBe(true);
    expect(Object.hasOwn(workflow.on, "workflow_call")).toBe(true);
    expect(Object.hasOwn(workflow.on, "push")).toBe(false);

    const staticUnit = workflow.jobs["static-unit"];
    expect(staticUnit["timeout-minutes"]).toBe(10);
    expect(runCommands(staticUnit)).toEqual([
      "npm ci",
      "npm run check:js",
      "npm run test:unit",
    ]);
    expect(runCommands(staticUnit).join("\n")).not.toMatch(/playwright/i);

    const chromiumCritical = workflow.jobs["chromium-critical"];
    expect(chromiumCritical.if).toContain(
      "github.event_name == 'pull_request'",
    );
    expect(chromiumCritical.if).toContain(
      "contains(github.workflow_ref, '/.github/workflows/validate.yml@')",
    );
    expect(chromiumCritical["timeout-minutes"]).toBe(20);
    expect(runCommands(chromiumCritical)).toEqual([
      "npm ci",
      "npx playwright install --with-deps chromium",
      "npx playwright test tests/e2e/cross-browser-critical.spec.mjs --project=chromium --workers=1 --retries=0",
    ]);
    expect(runCommands(chromiumCritical).join("\n")).not.toMatch(
      /install --with-deps .*\b(?:firefox|webkit)\b/,
    );
    expect(runCommands(chromiumCritical)).not.toContain("npm run test:e2e");
    expectFailureArtifact(
      chromiumCritical,
      "playwright-pr-chromium-critical",
    );
  });

  test("runs independent main regression shards and critical browser jobs", async () => {
    const { workflow } = await readWorkflow("main-regression.yml");

    expect(workflow.on.push.branches).toEqual(["main"]);
    expect(Object.hasOwn(workflow.on, "workflow_call")).toBe(true);

    const staticUnit = workflow.jobs["static-unit"];
    expect(staticUnit["timeout-minutes"]).toBe(10);
    expect(runCommands(staticUnit)).toEqual([
      "npm ci",
      "npm run check:js",
      "npm run test:unit",
    ]);

    const chromiumFull = workflow.jobs["chromium-full"];
    expect(chromiumFull["timeout-minutes"]).toBe(30);
    expect(chromiumFull.strategy["fail-fast"]).toBe(false);
    expect(chromiumFull.strategy.matrix.shard).toEqual([1, 2]);
    expect(chromiumFull).not.toHaveProperty("needs");
    expect(runCommands(chromiumFull)).toEqual([
      "npm ci",
      "npx playwright install --with-deps chromium",
      "npx playwright test --shard=${{ matrix.shard }}/2 --workers=1 --retries=0",
    ]);
    expectFailureArtifact(
      chromiumFull,
      "playwright-main-chromium-shard-${{ matrix.shard }}",
    );

    const crossBrowserCritical = workflow.jobs["cross-browser-critical"];
    expect(crossBrowserCritical["timeout-minutes"]).toBe(25);
    expect(crossBrowserCritical.strategy["fail-fast"]).toBe(false);
    expect(crossBrowserCritical.strategy.matrix.browser).toEqual([
      "firefox",
      "webkit",
    ]);
    expect(crossBrowserCritical).not.toHaveProperty("needs");
    expect(runCommands(crossBrowserCritical)).toEqual([
      "npm ci",
      "npx playwright install --with-deps ${{ matrix.browser }}",
      "npx playwright test --config=playwright.cross-browser.config.mjs --project=${{ matrix.browser }} --workers=1 --retries=0",
    ]);
    expectFailureArtifact(
      crossBrowserCritical,
      "playwright-main-${{ matrix.browser }}-critical",
    );
  });

  test("separates stable scheduled coverage from manual full-compatible coverage", async () => {
    const { source, workflow } = await readWorkflow("nightly-regression.yml");

    expect(Object.hasOwn(workflow.on, "schedule")).toBe(true);
    expect(Object.hasOwn(workflow.on, "workflow_dispatch")).toBe(true);
    expect(workflow.on.schedule).toEqual([
      {
        cron: "30 3 * * *",
        timezone: "Asia/Taipei",
      },
    ]);
    expect(source).toContain(
      "Nightly runs daily at 03:30 Asia/Taipei and intentionally avoids the start-of-hour scheduling peak.",
    );

    const chromiumFull = workflow.jobs["chromium-full"];
    expect(chromiumFull.name).toBe("Chromium full regression");
    expect(chromiumFull["timeout-minutes"]).toBe(45);
    expect(chromiumFull).not.toHaveProperty("if");
    expect(chromiumFull).not.toHaveProperty("needs");
    expect(runCommands(chromiumFull)).toEqual([
      "npm ci",
      "npx playwright install --with-deps chromium",
      "npx playwright test --project=chromium --workers=1 --retries=0",
    ]);
    expectFailureArtifact(
      chromiumFull,
      "playwright-nightly-chromium-full",
    );

    const crossBrowserCritical = workflow.jobs["cross-browser-critical"];
    expect(crossBrowserCritical.name).toBe("${{ matrix.label }}");
    expect(crossBrowserCritical["timeout-minutes"]).toBe(25);
    expect(crossBrowserCritical.strategy["fail-fast"]).toBe(false);
    expect(crossBrowserCritical.strategy.matrix.include).toEqual([
      {
        browser: "firefox",
        label: "Firefox critical regression",
        artifact: "playwright-nightly-firefox-critical",
      },
      {
        browser: "webkit",
        label: "WebKit critical regression",
        artifact: "playwright-nightly-webkit-critical",
      },
    ]);
    expect(crossBrowserCritical).not.toHaveProperty("if");
    expect(crossBrowserCritical).not.toHaveProperty("needs");
    expect(runCommands(crossBrowserCritical)).toEqual([
      "npm ci",
      "npx playwright install --with-deps ${{ matrix.browser }}",
      "npx playwright test --config=playwright.cross-browser.config.mjs --project=${{ matrix.browser }} --workers=1 --retries=0",
    ]);
    expectFailureArtifact(
      crossBrowserCritical,
      "${{ matrix.artifact }}",
    );

    const manualFullCompatible = workflow.jobs["manual-full-compatible"];
    expect(manualFullCompatible.name).toBe("${{ matrix.label }}");
    expect(manualFullCompatible.if).toBe(
      "github.event_name == 'workflow_dispatch'",
    );
    expect(manualFullCompatible["timeout-minutes"]).toBe(45);
    expect(manualFullCompatible.strategy["fail-fast"]).toBe(false);
    expect(manualFullCompatible.strategy.matrix.include).toEqual([
      {
        browser: "firefox",
        label: "Firefox full-compatible regression",
        artifact: "playwright-manual-firefox-full-compatible",
      },
      {
        browser: "webkit",
        label: "WebKit full-compatible regression",
        artifact: "playwright-manual-webkit-full-compatible",
      },
    ]);
    expect(manualFullCompatible).not.toHaveProperty("needs");
    expect(runCommands(manualFullCompatible)).toEqual([
      "npm ci",
      "npx playwright install --with-deps ${{ matrix.browser }}",
      "npx playwright test --config=playwright.full-cross-browser.config.mjs --project=${{ matrix.browser }} --workers=1 --retries=0",
    ]);
    expectFailureArtifact(
      manualFullCompatible,
      "${{ matrix.artifact }}",
    );

    const dependencyAudit = workflow.jobs["dependency-audit"];
    expect(dependencyAudit["timeout-minutes"]).toBe(10);
    expect(dependencyAudit).not.toHaveProperty("if");
    expect(runCommands(dependencyAudit)).toEqual([
      "npm audit",
      "npm audit --omit=dev",
    ]);

    const allRuns = Object.values(workflow.jobs).flatMap(runCommands);
    const allUses = Object.values(workflow.jobs).flatMap((job) =>
      (job.steps ?? []).map(({ uses }) => uses).filter(Boolean),
    );
    expect(allRuns.join("\n")).not.toMatch(/\bdeploy\b/i);
    expect(allUses.join("\n")).not.toMatch(/wrangler/i);
    expect(source).not.toContain("continue-on-error");
  });

  test("keeps required test tooling and scripts available", async () => {
    const packageJson = JSON.parse(
      await readFile(path.join(root, "package.json"), "utf8"),
    );

    expect(packageJson.dependencies).toBeUndefined();
    for (const dependency of ["@playwright/test", "vitest", "yaml"]) {
      expect(packageJson.devDependencies[dependency]).toEqual(
        expect.any(String),
      );
    }
    expect(packageJson.scripts).toMatchObject({
      "check:js": "node tests/scripts/check-js.mjs",
      "test:unit": "vitest run",
      "test:e2e": "playwright test",
    });
  });
});
