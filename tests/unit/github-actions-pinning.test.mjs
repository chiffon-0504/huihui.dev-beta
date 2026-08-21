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

  test("verifies the exact deployed main SHA before focused beta smoke", async () => {
    const { source, workflow } = await readWorkflow("beta-cd.yml");
    const syncSource = await readFile(
      path.join(root, "tests/scripts/beta-deployment-sync.mjs"),
      "utf8",
    );
    const httpSmokeSource = await readFile(
      path.join(root, "tests/scripts/beta-http-smoke.mjs"),
      "utf8",
    );
    const browserSmokeSource = await readFile(
      path.join(root, "tests/e2e/beta-deployment-smoke.spec.mjs"),
      "utf8",
    );
    const betaOriginSource = await readFile(
      path.join(root, "tests/support/beta-origin.mjs"),
      "utf8",
    );
    const steamContractSource = await readFile(
      path.join(root, "tests/support/steam-contract.mjs"),
      "utf8",
    );
    const betaConfig = (
      await import(
        pathToFileURL(path.join(root, "playwright.beta-smoke.config.mjs")).href
      )
    ).default;
    const { WORKER_DEPLOYMENT_PATHS } = await import(
      pathToFileURL(
        path.join(root, "tests/scripts/beta-deployment-sync.mjs"),
      ).href
    );

    expect(workflow.on.push.branches).toEqual(["main"]);
    expect(Object.hasOwn(workflow.on, "pull_request")).toBe(false);
    expect(workflow.concurrency).toEqual({
      group: "beta-cd",
      "cancel-in-progress": true,
    });
    expect(workflow.permissions).toEqual({
      contents: "read",
      checks: "read",
      actions: "read",
    });
    expect(source).not.toMatch(/production|workflow_dispatch|\bsleep\b/i);

    const synchronize = workflow.jobs.synchronize;
    expect(synchronize["timeout-minutes"]).toBe(35);
    const synchronizeCheckout = synchronize.steps.find(
      ({ uses }) =>
        typeof uses === "string" && uses.startsWith("actions/checkout@"),
    );
    expect(synchronizeCheckout.with["fetch-depth"]).toBe(0);
    const synchronizeNodeSetup = actionSteps(
      synchronize,
      "actions/setup-node",
    );
    expect(synchronizeNodeSetup).toHaveLength(1);
    expect(synchronizeNodeSetup[0]).toMatchObject({
      uses: "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020",
      with: { "node-version": 24 },
    });
    expect(synchronize.steps.indexOf(synchronizeNodeSetup[0])).toBeLessThan(
      synchronize.steps.findIndex(({ run }) => run?.startsWith("node ")),
    );
    expect(runCommands(synchronize)).toEqual([
      "node tests/scripts/beta-deployment-sync.mjs resolve-worker-sha",
      "node tests/scripts/beta-deployment-sync.mjs wait",
    ]);
    const resolveWorker = synchronize.steps.find(
      ({ run }) =>
        run === "node tests/scripts/beta-deployment-sync.mjs resolve-worker-sha",
    );
    const waitForDeployments = synchronize.steps.find(
      ({ run }) => run === "node tests/scripts/beta-deployment-sync.mjs wait",
    );
    expect(resolveWorker.env).toEqual({ TARGET_SHA: "${{ github.sha }}" });
    expect(waitForDeployments.env).toMatchObject({
      CLOUDFLARE_ACCOUNT_ID: "${{ secrets.CLOUDFLARE_ACCOUNT_ID }}",
      CLOUDFLARE_PAGES_READ_API_TOKEN:
        "${{ secrets.CLOUDFLARE_PAGES_READ_API_TOKEN }}",
      TARGET_SHA: "${{ github.sha }}",
      REQUIRED_WORKER_SHA: "${{ steps.worker.outputs.required_sha }}",
    });
    expect(waitForDeployments.env).not.toHaveProperty("CLOUDFLARE_API_TOKEN");
    expect(syncSource).toContain('const PAGES_CHECK_NAME = "Cloudflare Pages"');
    expect(syncSource).toContain(
      'const PAGES_APP_SLUG = "cloudflare-workers-and-pages"',
    );
    expect(syncSource).toContain("item.head_sha === targetSha");
    expect(syncSource).toContain("selectNewestCoveringWorkerRun");
    expect(syncSource).toContain("isGitAncestor");
    expect(syncSource).not.toContain("head_sha=${targetSha}");
    expect(syncSource).toContain("branch=main&event=push&per_page=100");
    expect(syncSource).toContain(
      "const DEFAULT_PAGES_TIMEOUT_MS = 15 * 60 * 1000",
    );
    expect(syncSource).toContain(
      "const DEFAULT_WORKER_TIMEOUT_MS = 30 * 60 * 1000",
    );
    expect(syncSource).toContain("PAGES_DEPLOYMENT_TIMEOUT_MS");
    expect(syncSource).toContain("WORKER_DEPLOYMENT_TIMEOUT_MS");
    expect(syncSource).toContain("timeoutMs: pagesTimeoutMs");
    expect(syncSource).toContain("timeoutMs: workerTimeoutMs");
    expect(syncSource).toContain("DEFAULT_POLL_INTERVAL_MS");
    expect(syncSource).toContain("workers/huihui-api/");
    expect(syncSource).toContain("REQUIRED_WORKER_SHA");
    expect(syncSource).not.toContain("WORKER_REQUIRED");
    expect(syncSource).toContain(
      'export const PAGES_PROJECT_NAME = "huihuidev-beta"',
    );
    expect(syncSource).toContain(
      'export const PAGES_CUSTOM_DOMAIN = "beta.huihui.dev"',
    );
    expect(syncSource).toContain("canonical_deployment");
    expect(syncSource).toContain(
      "deployments?env=production&per_page=${PAGES_DEPLOYMENTS_PER_PAGE}&page=${page}",
    );
    expect(syncSource).toContain("PAGES_NON_TERMINAL_STAGE_STATUSES");
    expect(syncSource).toContain("inspectPagesProductionQuiescence");
    expect(syncSource).toContain("deployment_trigger?.metadata?.commit_hash");
    expect(syncSource).toContain('deployment.environment !== "production"');
    expect(syncSource).toContain(
      'deployment.deployment_trigger?.type !== "github:push"',
    );
    expect(syncSource).toContain('stageStatus !== "success"');
    expect(syncSource).toContain('domain.status !== "active"');
    expect(WORKER_DEPLOYMENT_PATHS).toEqual([
      "workers/huihui-api/",
      ".github/workflows/deploy-huihui-api-worker.yml",
    ]);

    const liveSmoke = workflow.jobs["live-smoke"];
    expect(liveSmoke.needs).toBe("synchronize");
    expect(liveSmoke["timeout-minutes"]).toBe(35);
    expect(liveSmoke.environment).toEqual({
      name: "beta",
      url: "https://beta.huihui.dev",
    });
    expect(runCommands(liveSmoke)).toEqual([
      "npm ci",
      "node tests/scripts/beta-deployment-sync.mjs wait-pages-quiescent",
      "node tests/scripts/beta-http-smoke.mjs",
      "npx playwright install --with-deps chromium",
      "npx playwright test --config=playwright.beta-smoke.config.mjs --project=chromium --workers=1 --retries=0",
      "node tests/scripts/beta-deployment-sync.mjs verify-pages-active",
    ]);
    const waitForQuiescentPages = liveSmoke.steps.find(
      ({ run }) =>
        run ===
        "node tests/scripts/beta-deployment-sync.mjs wait-pages-quiescent",
    );
    const verifyActivePages = liveSmoke.steps.find(
      ({ run }) =>
        run ===
        "node tests/scripts/beta-deployment-sync.mjs verify-pages-active",
    );
    const pagesReadEnv = {
      CLOUDFLARE_ACCOUNT_ID: "${{ secrets.CLOUDFLARE_ACCOUNT_ID }}",
      CLOUDFLARE_PAGES_READ_API_TOKEN:
        "${{ secrets.CLOUDFLARE_PAGES_READ_API_TOKEN }}",
      TARGET_SHA: "${{ github.sha }}",
    };
    expect(waitForQuiescentPages.env).toEqual(pagesReadEnv);
    expect(verifyActivePages.env).toEqual(pagesReadEnv);
    expect(liveSmoke.steps.indexOf(verifyActivePages)).toBeGreaterThan(
      liveSmoke.steps.findIndex(({ run }) =>
        run?.startsWith("npx playwright test --config=playwright.beta-smoke"),
      ),
    );
    expectFailureArtifact(
      liveSmoke,
      "playwright-beta-deployment-smoke",
    );

    expect(betaConfig.testMatch).toBe("beta-deployment-smoke.spec.mjs");
    expect(betaConfig.globalSetup).toBeUndefined();
    expect(betaConfig.webServer).toBeUndefined();
    expect(betaConfig.use.baseURL).toBe("https://beta.huihui.dev");
    expect(betaConfig.projects.map(({ name }) => name)).toEqual(["chromium"]);
    expect(betaConfig.retries).toBe(0);
    expect(betaConfig.workers).toBe(1);

    for (const route of ["/", "/en/", "/ja/", "/about/", "/contact/"]) {
      expect(httpSmokeSource).toContain(`path: "${route}"`);
    }
    expect(httpSmokeSource).toContain(
      "https://huihui-api-beta.huihuigames01.workers.dev",
    );
    expect(httpSmokeSource).toContain("/api/tech-news");
    expect(httpSmokeSource).toContain("/api/steam-library");
    expect(httpSmokeSource).toContain(
      'response.headers.get("access-control-allow-origin")',
    );
    expect(httpSmokeSource).toContain("allowedOrigin !== SITE_BASE_URL");
    expect(betaOriginSource).toContain(
      'export const BETA_SITE_ORIGIN = "https://beta.huihui.dev"',
    );
    expect(betaOriginSource).toContain("unexpected origin ${final.origin}");
    expect(httpSmokeSource).toContain(
      "assertBetaPageOrigin(url, response.url)",
    );
    expect(
      httpSmokeSource.match(/assertExactFinalUrl\(url, response\.url\)/g),
    ).toHaveLength(2);
    expect(browserSmokeSource).toContain(
      "assertBetaPageOrigin(path, page.url())",
    );
    for (const route of ["/", "/about/", "/contact/"]) {
      expect(browserSmokeSource).toContain(
        `assertBetaPageOrigin("${route}", page.url())`,
      );
    }
    expect(browserSmokeSource).toContain(
      "https://huihui-api-beta.huihuigames01.workers.dev/api/contact",
    );
    expect(browserSmokeSource).toContain("isTurnstileFrameUrl(frame.url())");
    expect(browserSmokeSource).toContain(
      'input[name="cf-turnstile-response"]',
    );
    expect(browserSmokeSource).toContain(
      "const TURNSTILE_RENDER_TIMEOUT_MS = 15_000",
    );
    expect(browserSmokeSource).toContain("page.waitForResponse(");
    expect(browserSmokeSource).toContain(
      "getHuihuiApiBase(window.location.hostname)",
    );
    expect(browserSmokeSource).toContain(
      'candidate.request().resourceType() === "fetch"',
    );
    expect(browserSmokeSource).toContain(
      'url.pathname === "/api/tech-news"',
    );
    expect(browserSmokeSource).toContain(
      "expect(techNewsResponse.url()).toBe(expectedTechNewsUrl)",
    );
    expect(browserSmokeSource).toContain(
      "expect(techNewsResponse.ok()).toBe(true)",
    );
    expect(browserSmokeSource).toContain(
      "expect(Array.isArray(techNewsBody.techNews)).toBe(true)",
    );
    expect(browserSmokeSource).toContain(
      'data-tech-news-state="empty"',
    );
    expect(browserSmokeSource).toContain(
      "page.locator(TECH_NEWS_FAILURE_SELECTOR)",
    );
    expect(browserSmokeSource).toContain(
      'url.pathname === "/api/steam-library"',
    );
    expect(browserSmokeSource).toContain(
      "expect(steamResponse.url()).toBe(expectedSteamUrl)",
    );
    expect(browserSmokeSource).not.toContain("steamResponse.ok()");
    expect(browserSmokeSource).toContain("classifySteamResponse(");
    expect(browserSmokeSource).toContain("isSteamUiStateAllowed(");
    expect(httpSmokeSource).toContain("classifySteamResponse(");
    expect(steamContractSource).toContain(
      '"Steam library temporarily unavailable"',
    );
    expect(steamContractSource).toContain('status === 200');
    expect(steamContractSource).toContain('status === 500');
    expect(steamContractSource).toContain('body.games.length === 0');
    expect(steamContractSource).toContain(
      'responseFamily === "degraded" && uiState === "error"',
    );
    expect(browserSmokeSource).not.toMatch(/\.click\(.*submit|dispatchEvent\(.*submit/s);
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
