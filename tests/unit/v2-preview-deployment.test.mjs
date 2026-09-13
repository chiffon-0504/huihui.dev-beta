import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { parseDocument } from "yaml";
import { PROJECT, findDeploymentId, resolve, validateDeployment, validateProject, validateSha } from "../scripts/v2-preview-deployment.mjs";

const sha = "a".repeat(40);
const id = "12345678-1234-1234-1234-123456789abc";
const uploadUrl = `https://12345678.${PROJECT}.pages.dev`;
const deployment = () => ({ id, url: uploadUrl, project_name: PROJECT, environment: "production", latest_stage: { name: "deploy", status: "success" }, deployment_trigger: { metadata: { branch: "main", commit_hash: sha, commit_dirty: false } } });
const pageResponse = (result, page = 1, totalPages = 1) => ({ success: true, result, result_info: { page, total_pages: totalPages } });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Pages API resolves the exact upload without latest-deployment guessing", () => {
  test("finds a later-page upload despite other deployments of the same SHA", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(pageResponse([{ ...deployment(), id: "other", url: `https://87654321.${PROJECT}.pages.dev` }], 1, 2))
      .mockResolvedValueOnce(pageResponse([deployment()], 2, 2));
    await expect(findDeploymentId(sha, `${uploadUrl}/`, request)).resolves.toBe(id);
    expect(request.mock.calls).toEqual([
      ["/deployments?env=production&page=1&per_page=25", true],
      ["/deployments?env=production&page=2&per_page=25", true],
    ]);
  });
  test("rejects zero matches and ambiguity on a later page", async () => {
    await expect(findDeploymentId(sha, uploadUrl, async () => pageResponse([]))).rejects.toThrow("exactly one");
    const request = vi.fn()
      .mockResolvedValueOnce(pageResponse([deployment()], 1, 2))
      .mockResolvedValueOnce(pageResponse([{ ...deployment(), id: "87654321-1234-1234-1234-123456789abc" }], 2, 2));
    await expect(findDeploymentId(sha, uploadUrl, request)).rejects.toThrow("exactly one");
    expect(request).toHaveBeenCalledTimes(2);
  });
  test.each([
    ["project_name", "huihuidev-beta"], ["url", `https://${PROJECT}.pages.dev`],
    ["id", "invalid\ndeployment-id=injected"], ["environment", "preview"],
    ["latest_stage", { name: "deploy", status: "failure" }],
  ])("rejects an upload with wrong %s", async (key, value) => {
    await expect(findDeploymentId(sha, uploadUrl, async () => pageResponse([{ ...deployment(), [key]: value }]))).rejects.toThrow();
  });
  test.each([["branch", "dev"], ["commit_hash", "b".repeat(40)], ["commit_dirty", true]])("rejects upload metadata %s", async (key, value) => {
    const candidate = deployment();
    candidate.deployment_trigger.metadata[key] = value;
    await expect(findDeploymentId(sha, uploadUrl, async () => pageResponse([candidate]))).rejects.toThrow();
  });
  test.each(["", `https://${PROJECT}.pages.dev`, `https://main.${PROJECT}.pages.dev`, "https://12345678.huihuidev-beta.pages.dev", `${uploadUrl}/path`, `${uploadUrl}?x=1`])("rejects missing or non-immutable upload URL %s", async (url) => {
    const request = vi.fn();
    await expect(findDeploymentId(sha, url, request)).rejects.toThrow("immutable");
    expect(request).not.toHaveBeenCalled();
  });
  test.each([
    { result: [] }, pageResponse(null), pageResponse([], 2), pageResponse([], 1, 101),
    pageResponse([], 1, -1), pageResponse([], 1, 1.5), pageResponse([deployment()], 1, 0),
  ])("rejects incomplete or malformed pagination %#", async (response) => {
    await expect(findDeploymentId(sha, uploadUrl, async () => response)).rejects.toThrow();
  });
  test("rejects changing or repeated pages instead of accepting an early match", async () => {
    for (const secondPage of [pageResponse([], 2, 3), pageResponse([deployment()], 2, 2)]) {
      const request = vi.fn().mockResolvedValueOnce(pageResponse([deployment()], 1, 2)).mockResolvedValueOnce(secondPage);
      await expect(findDeploymentId(sha, uploadUrl, request)).rejects.toThrow(/pagination/);
    }
  });
  test.each(["success", "zero", "ambiguous", "http-error", "api-error"])("writes GITHUB_OUTPUT only after successful API resolution: %s", async (scenario) => {
    const directory = await mkdtemp(join(tmpdir(), "v2-deployment-"));
    const output = join(directory, "output");
    try {
      await writeFile(output, "");
      vi.stubEnv("GITHUB_OUTPUT", output);
      vi.stubEnv("DEPLOYMENT_URL", uploadUrl);
      vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "a".repeat(32));
      vi.stubEnv("CLOUDFLARE_API_TOKEN", "unit-test-token");
      const candidates = scenario === "zero" ? [] : [deployment()];
      if (scenario === "ambiguous") candidates.push({ ...deployment(), id: "87654321-1234-1234-1234-123456789abc" });
      const body = { ...pageResponse(candidates), success: scenario !== "api-error" };
      const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: scenario === "http-error" ? 403 : 200 }));
      vi.stubGlobal("fetch", fetchMock);
      if (scenario === "success") {
        await resolve(sha);
        expect(await readFile(output, "utf8")).toBe(`deployment-id=${id}\n`);
      } else {
        await expect(resolve(sha)).rejects.toThrow();
        expect(await readFile(output, "utf8")).toBe("");
      }
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(fetchMock.mock.calls[0][0]).toBe(`https://api.cloudflare.com/client/v4/accounts/${"a".repeat(32)}/pages/projects/${PROJECT}/deployments?env=production&page=1&per_page=25`);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("v2 preview deployment identity fails closed", () => {
  test("accepts an exact successful v2 main deployment", () => {
    expect(() => validateDeployment(deployment(), sha, id)).not.toThrow();
    expect(() => validateSha(sha)).not.toThrow();
    expect(() => validateSha("main")).toThrow();
    expect(() => validateSha("a".repeat(7))).toThrow();
  });
  test.each([
    ["project_name", "huihuidev-beta"], ["project_name", "huihuidev-stable"],
    ["id", "wrong"], ["environment", "preview"],
    ["latest_stage", { name: "build", status: "success" }],
    ["latest_stage", { name: "deploy", status: "failure" }],
  ])("rejects wrong %s", (key, value) => {
    expect(() => validateDeployment({ ...deployment(), [key]: value }, sha, id)).toThrow();
  });
  test.each([["branch", "feature/test"], ["commit_hash", "b".repeat(40)], ["commit_dirty", true]])("rejects wrong metadata %s", (key, value) => {
    const valueToCheck = deployment();
    valueToCheck.deployment_trigger.metadata[key] = value;
    expect(() => validateDeployment(valueToCheck, sha, id)).toThrow();
  });
  test("refuses existing v1 projects and Git-integrated deployments", () => {
    expect(() => validateProject({ name: PROJECT, production_branch: "main" })).not.toThrow();
    for (const project of [{ name: "huihuidev-beta", production_branch: "main" }, { name: PROJECT, production_branch: "dev" }, { name: PROJECT, production_branch: "main", source: { type: "github" } }]) {
      expect(() => validateProject(project)).toThrow();
    }
  });
});

test("v2 workflow isolates writes and verifies uploaded identity before and after smoke", async () => {
  const source = await readFile(new URL("../../.github/workflows/deploy-v2-beta.yml", import.meta.url), "utf8");
  const document = parseDocument(source);
  expect(document.errors).toEqual([]);
  const workflow = document.toJS();
  expect(Object.keys(workflow.on).sort()).toEqual(["push", "workflow_dispatch"]);
  expect(workflow.on.push).toEqual({ branches: ["main"] });
  expect(workflow.permissions).toEqual({ contents: "read" });
  expect(workflow.concurrency).toEqual({ group: PROJECT, "cancel-in-progress": false });
  const job = workflow.jobs.deploy;
  expect(job.if).toContain("github.repository == 'chiffon-0504/huihui.dev-beta'");
  expect(job.if).toContain("github.ref == 'refs/heads/main'");
  const steps = job.steps;
  const deployIndex = steps.findIndex((step) => step.id === "pages");
  const deploy = steps[deployIndex];
  expect(deploy.with.workingDirectory).toBe("v2");
  expect(deploy.with.command).toBe("pages deploy dist --project-name=huihuidev-v2-beta --branch=main --commit-hash=${{ github.sha }} --commit-dirty=false");
  expect(steps.slice(0, deployIndex).map((step) => step.run)).toEqual(expect.arrayContaining(["npm ci", "npm run build:v2", "node tests/scripts/v2-preview-deployment.mjs prepare", "node tests/scripts/v2-preview-deployment.mjs preflight"]));
  const resolveIndex = steps.findIndex((step) => step.id === "deployment");
  expect(resolveIndex).toBe(deployIndex + 1);
  expect(steps[resolveIndex].run).toBe("node tests/scripts/v2-preview-deployment.mjs resolve");
  expect(steps[resolveIndex].env.DEPLOYMENT_URL).toBe("${{ steps.pages.outputs.deployment-url }}");
  expect(job.env.TARGET_SHA).toBe("${{ github.sha }}");
  const verifySteps = steps.filter((step) => step.run === "node tests/scripts/v2-preview-deployment.mjs verify");
  expect(verifySteps).toHaveLength(2);
  for (const step of verifySteps) {
    expect(steps.indexOf(step)).toBeGreaterThan(resolveIndex);
    expect(step.env.DEPLOYMENT_ID).toBe("${{ steps.deployment.outputs.deployment-id }}");
  }
  expect(source).not.toContain("pages-deployment-id");
  expect(steps.filter((step) => step.uses)).toSatisfy((actions) => actions.every((step) => /@[a-f0-9]{40}$/.test(step.uses)));
  expect(source).not.toMatch(/workers\/huihui-api|huihui\.dev-stable|environment: production|secrets: inherit/);
});

test("built preview policy has no inline/dynamic code or production API permission", async () => {
  const headers = await readFile(new URL("../../v2/public/_headers", import.meta.url), "utf8");
  expect(headers).toContain("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self';");
  expect(headers).toContain("X-Robots-Tag: noindex, nofollow");
  expect(headers).not.toMatch(/unsafe-inline|unsafe-eval|api\.huihui\.dev|Report-Only/);
});
