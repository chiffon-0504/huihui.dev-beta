import { readFile } from "node:fs/promises";
import { describe, expect, test, vi } from "vitest";
import { parseDocument } from "yaml";
import {
  BETA_WORKER, EXPECTED_LIMITER, EXPECTED_PUBLIC_QUOTA, activeDeployment, runAcceptance,
  verifyBetaDeployment, verifyVersion,
} from "../../workers/huihui-api/verify-deployment.mjs";

const SHA = "a".repeat(40);
const ACCOUNT = "b".repeat(32);
const DEPLOYMENT = "11111111-1111-4111-8111-111111111111";
const VERSION = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const env = { CLOUDFLARE_ACCOUNT_ID: ACCOUNT, CLOUDFLARE_API_TOKEN: "fixture-credential", TARGET_SHA: SHA };

function deployment() {
  return { deployments: [{ id: DEPLOYMENT, versions: [{ version_id: VERSION, percentage: 100 }] }] };
}

function version() {
  return {
    id: VERSION,
    annotations: { "workers/tag": SHA },
    resources: { bindings: [
      { name: EXPECTED_LIMITER.name, type: "ratelimit", namespace_id: "922601", simple: { limit: 10, period: 60 } },
      { name: "TYPESAFE_JEV_API_KEY", type: "secret_text" },
      { name: EXPECTED_PUBLIC_QUOTA.name, type: "durable_object_namespace", class_name: "JevPublicQuota" },
      { name: "JEV_PUBLIC_IP_HMAC_KEY", type: "secret_text" },
    ] },
  };
}

function fixture({ active = deployment(), deployed = version(), confirmed = active } = {}) {
  const results = [active, deployed, confirmed];
  return vi.fn(async () => ({ ok: true, json: async () => ({ success: true, result: results.shift() }) }));
}

function options(fetchImpl) {
  return { accountId: ACCOUNT, apiToken: env.CLOUDFLARE_API_TOKEN, targetSha: SHA, fetchImpl };
}

describe("beta deployment toolchain contract", () => {
  test("pins the beta action to an exact supported Wrangler and preserves production", async () => {
    const source = await readFile(new URL("../../.github/workflows/deploy-huihui-api-worker.yml", import.meta.url), "utf8");
    const parsed = parseDocument(source);
    expect(parsed.errors).toEqual([]);
    const workflow = parsed.toJS();
    const beta = workflow.jobs["deploy-beta"];
    const deployIndex = beta.steps.findIndex(step => step.uses?.startsWith("cloudflare/wrangler-action@"));
    const deploy = beta.steps[deployIndex];
    const pinned = deploy.with.wranglerVersion;
    expect(pinned).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pinned).toBe("4.136.3");
    const [major, minor, patch] = pinned.split(".").map(Number);
    expect(major > 4 || (major === 4 && (minor > 36 || (minor === 36 && patch >= 0)))).toBe(true);
    expect(deploy.with.command).toBe("deploy --env beta --tag ${{ github.sha }}");
    expect(deploy.with.workingDirectory).toBe("workers/huihui-api");
    expect(beta.steps.slice(0, deployIndex).find(step => step.uses?.startsWith("actions/setup-node@"))?.with["node-version"]).toBe(24);
    const verify = beta.steps[deployIndex + 1];
    expect(verify.run).toBe("node workers/huihui-api/verify-deployment.mjs");
    expect(verify.env).toEqual({
      CLOUDFLARE_API_TOKEN: "${{ secrets.CLOUDFLARE_API_TOKEN }}",
      CLOUDFLARE_ACCOUNT_ID: "${{ secrets.CLOUDFLARE_ACCOUNT_ID }}",
      TARGET_SHA: "${{ github.sha }}",
    });
    expect(verify).not.toHaveProperty("if");
    expect(beta).not.toHaveProperty("continue-on-error");
    for (const step of beta.steps) expect(step).not.toHaveProperty("continue-on-error");
    expect(beta.steps.at(-1)).toBe(verify);
    expect(workflow.on.push.paths).toContain("workers/huihui-api/**");
    const production = workflow.jobs["deploy-production"];
    expect(production.steps).toHaveLength(2);
    expect(production.steps[1].with.command).toBe("deploy");
    expect(production.steps[1].with).not.toHaveProperty("wranglerVersion");
    expect(source).not.toContain("TYPESAFE_JEV_API_KEY");
  });

  test("expected limiter metadata matches the actual beta TOML declaration", async () => {
    const config = (await readFile(new URL("../../workers/huihui-api/wrangler.toml", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
    // Deliberately assert the repository's existing TOML representation, not a partial TOML parser.
    const limiter = config.match(/\[\[env\.beta\.ratelimits\]\]([^]*?)(?=\n\[|$)/g);
    expect(limiter).toHaveLength(1);
    expect(limiter[0]).toMatch(new RegExp(`name = "${EXPECTED_LIMITER.name}"`));
    expect(limiter[0]).toMatch(new RegExp(`namespace_id = "${EXPECTED_LIMITER.namespace_id}"`));
    expect(limiter[0]).toContain(`simple = { limit = ${EXPECTED_LIMITER.limit}, period = ${EXPECTED_LIMITER.period} }`);
    expect(config).toContain(`[env.beta]\nname = "${BETA_WORKER}"`);
    expect(config.split("[env.beta]")[0]).not.toContain("ratelimits");
  });

  test("the verifier stays in the Worker paths monitored by Beta CD", async () => {
    const { WORKER_DEPLOYMENT_PATHS, completedFailure } = await import("../scripts/beta-deployment-sync.mjs");
    expect(WORKER_DEPLOYMENT_PATHS).toContain("workers/huihui-api/");
    expect(() => completedFailure("Beta Worker workflow", { status: "completed", conclusion: "failure" }, SHA)).toThrow("failure");
  });

  test("public quota metadata matches the beta-only class and binding declaration", async () => {
    const config = (await readFile(new URL("../../workers/huihui-api/wrangler.toml", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
    const quota = config.match(/\[\[env\.beta\.durable_objects\.bindings\]\]([^]*?)(?=\n\[|$)/g);
    expect(quota).toHaveLength(1);
    expect(quota[0]).toContain(`name = "${EXPECTED_PUBLIC_QUOTA.name}"`);
    expect(quota[0]).toContain(`class_name = "${EXPECTED_PUBLIC_QUOTA.class_name}"`);
    expect(config.split("[env.beta]")[0]).not.toContain("JEV_PUBLIC_QUOTA");
  });

  test("package and lockfile remain consistent without adding a second Wrangler source", async () => {
    const manifest = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
    const lock = JSON.parse(await readFile(new URL("../../package-lock.json", import.meta.url), "utf8"));
    expect(lock.packages[""].devDependencies).toEqual(manifest.devDependencies);
    expect(manifest.devDependencies).not.toHaveProperty("wrangler");
    expect(lock.packages).not.toHaveProperty("node_modules/wrangler");
  });
});

describe("remote beta Worker acceptance", () => {
  test("reads active deployment, exact version metadata, then active deployment again", async () => {
    const fetchImpl = fixture();
    await expect(verifyBetaDeployment(options(fetchImpl))).resolves.toEqual({
      worker: BETA_WORKER, sha: SHA, deploymentId: DEPLOYMENT, versionId: VERSION, limiter: "JEV_RATE_LIMITER",
    });
    const base = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/workers/scripts/huihui-api-beta`;
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      `${base}/deployments?per_page=1&page=1`, `${base}/versions/${VERSION}`, `${base}/deployments?per_page=1&page=1`,
    ]);
    for (const [, init] of fetchImpl.mock.calls) {
      expect(init).toMatchObject({ method: "GET", redirect: "error", headers: { Accept: "application/json" } });
      expect(init.signal).toBeInstanceOf(AbortSignal);
      expect(init).not.toHaveProperty("body");
    }
  });

  test.each([
    null, {}, { deployments: [] }, { deployments: {} },
    { deployments: [{ id: "untrusted", versions: [{ version_id: VERSION, percentage: 100 }] }] },
    { deployments: [{ id: DEPLOYMENT, versions: [] }] },
    { deployments: [{ id: DEPLOYMENT, versions: [{ version_id: "untrusted", percentage: 100 }] }] },
    { deployments: [{ id: DEPLOYMENT, versions: [{ version_id: VERSION, percentage: 50 }, { version_id: OTHER, percentage: 50 }] }] },
    { deployments: [{ id: DEPLOYMENT, versions: [{ version_id: VERSION, percentage: "100" }] }] },
  ])("rejects missing, malformed or split active deployments: %j", active => {
    expect(() => activeDeployment(active)).toThrow("100% of traffic");
  });

  test.each([
    ["missing", v => { v.resources.bindings.shift(); }],
    ["wrong type", v => { v.resources.bindings[0].type = "plain_text"; }],
    ["wrong namespace", v => { v.resources.bindings[0].namespace_id = "922602"; }],
    ["numeric namespace", v => { v.resources.bindings[0].namespace_id = 922601; }],
    ["wrong limit", v => { v.resources.bindings[0].simple.limit = 100; }],
    ["wrong period", v => { v.resources.bindings[0].simple.period = 10; }],
    ["missing simple", v => { delete v.resources.bindings[0].simple; }],
    ["duplicate", v => { v.resources.bindings.push(v.resources.bindings[0]); }],
  ])("fails acceptance when limiter is %s", async (_, mutate) => {
    const deployed = version(); mutate(deployed);
    const fetchImpl = fixture({ deployed });
    const log = vi.fn(), error = vi.fn();
    expect(await runAcceptance({ env, fetchImpl, log, error })).toBe(1);
    expect(error).toHaveBeenCalledWith("JEV_RATE_LIMITER is missing or does not match the beta configuration.");
    expect(log).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test.each([
    ["wrong version", v => { v.id = OTHER; }],
    ["wrong SHA", v => { v.annotations["workers/tag"] = "c".repeat(40); }],
    ["untagged", v => { delete v.annotations; }],
    ["no bindings", v => { delete v.resources.bindings; }],
    ["no private secret", v => { v.resources.bindings.splice(1, 1); }],
    ["plaintext secret", v => { v.resources.bindings[1].type = "plain_text"; }],
    ["duplicate secret", v => { v.resources.bindings.push(v.resources.bindings[1]); }],
  ])("rejects %s metadata", (_, mutate) => {
    const deployed = version(); mutate(deployed);
    expect(() => verifyVersion(deployed, VERSION, SHA)).toThrow();
  });

  test.each([
    ["missing", v => { v.resources.bindings.splice(2, 1); }],
    ["wrong type", v => { v.resources.bindings[2].type = "kv_namespace"; }],
    ["missing class", v => { delete v.resources.bindings[2].class_name; }],
    ["wrong class", v => { v.resources.bindings[2].class_name = "OtherQuota"; }],
    ["external Worker", v => { v.resources.bindings[2].script_name = "huihui-api"; }],
    ["duplicate", v => { v.resources.bindings.push(v.resources.bindings[2]); }],
  ])("fails acceptance when public quota is %s", async (_, mutate) => {
    const deployed = version(); mutate(deployed);
    const fetchImpl = fixture({ deployed }), log = vi.fn(), error = vi.fn();
    expect(await runAcceptance({ env, fetchImpl, log, error })).toBe(1);
    expect(error).toHaveBeenCalledWith("JEV_PUBLIC_QUOTA is missing or does not match the beta configuration.");
    expect(log).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test("accepts an explicitly named same-Worker quota binding", () => {
    const deployed = version(); deployed.resources.bindings[2].script_name = BETA_WORKER;
    expect(() => verifyVersion(deployed, VERSION, SHA)).not.toThrow();
  });

  test.each([
    ["missing", v => { v.resources.bindings.pop(); }],
    ["plaintext", v => { v.resources.bindings[3].type = "plain_text"; }],
    ["duplicate", v => { v.resources.bindings.push(v.resources.bindings[3]); }],
  ])("fails acceptance when public HMAC secret is %s", async (_, mutate) => {
    const deployed = version(); mutate(deployed);
    const fetchImpl = fixture({ deployed }), log = vi.fn(), error = vi.fn();
    expect(await runAcceptance({ env, fetchImpl, log, error })).toBe(1);
    expect(error).toHaveBeenCalledWith("JEV_PUBLIC_IP_HMAC_KEY secret metadata is missing or invalid.");
    expect(log).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test.each(["deployment", "version"])("rejects an active %s change during verification", async field => {
    const confirmed = deployment();
    if (field === "deployment") confirmed.deployments[0].id = OTHER;
    else confirmed.deployments[0].versions[0].version_id = OTHER;
    await expect(verifyBetaDeployment(options(fixture({ confirmed })))).rejects.toThrow("changed during verification");
  });

  test("never reads binding values or serializes secret metadata", async () => {
    const deployed = version();
    const valueAccess = vi.fn(() => { throw new Error("Binding values must not be inspected"); });
    for (const binding of deployed.resources.bindings) {
      Object.defineProperty(binding, "value", { enumerable: true, get: valueAccess });
      Object.defineProperty(binding, "text", { enumerable: true, get: valueAccess });
      Object.defineProperty(binding, "json", { enumerable: true, get: valueAccess });
    }
    const log = vi.fn(), error = vi.fn();
    expect(await runAcceptance({ env, fetchImpl: fixture({ deployed }), log, error })).toBe(0);
    expect(valueAccess).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledExactlyOnceWith(
      `Verified huihui-api-beta commit ${SHA}, deployment ${DEPLOYMENT}, version ${VERSION}: JEV_RATE_LIMITER and JEV_PUBLIC_QUOTA match; required secret metadata present.`,
    );
  });

  test.each(["http", "api", "json", "network", "unexpected"])("sanitizes %s failures and exits unsuccessfully", async kind => {
    const sensitive = "fixture-sensitive-diagnostic";
    const body = vi.fn(async () => { throw new Error(sensitive); });
    const fetchImpl = vi.fn(async () => {
      if (kind === "network") throw new Error(sensitive);
      if (kind === "unexpected") return null;
      if (kind === "http") return { ok: false, json: body };
      if (kind === "json") return { ok: true, json: body };
      return { ok: true, json: async () => ({ success: false, errors: [{ message: sensitive }] }) };
    });
    const log = vi.fn(), error = vi.fn();
    expect(await runAcceptance({ env, fetchImpl, log, error })).toBe(1);
    expect(log).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(error.mock.calls)).not.toContain(sensitive);
    expect(JSON.stringify(error.mock.calls)).not.toContain(env.CLOUDFLARE_API_TOKEN);
    if (kind === "http") expect(body).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test.each(["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN", "TARGET_SHA"])("fails before GET when %s is missing", async key => {
    const fetchImpl = fixture();
    expect(await runAcceptance({ env: { ...env, [key]: undefined }, fetchImpl, log: vi.fn(), error: vi.fn() })).toBe(1);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
