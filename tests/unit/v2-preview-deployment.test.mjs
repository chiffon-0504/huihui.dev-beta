import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { parseDocument } from "yaml";
import { PROJECT, validateDeployment, validateProject, validateSha } from "../scripts/v2-preview-deployment.mjs";

const sha = "a".repeat(40);
const id = "12345678-1234-1234-1234-123456789abc";
const deployment = () => ({ id, project_name: PROJECT, environment: "production", latest_stage: { name: "deploy", status: "success" }, deployment_trigger: { metadata: { branch: "main", commit_hash: sha, commit_dirty: false } } });

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
  expect(steps.filter((step) => step.run === "node tests/scripts/v2-preview-deployment.mjs verify")).toHaveLength(2);
  expect(steps.filter((step) => step.uses)).toSatisfy((actions) => actions.every((step) => /@[a-f0-9]{40}$/.test(step.uses)));
  expect(source).not.toMatch(/workers\/huihui-api|huihui\.dev-stable|environment: production|secrets: inherit/);
});

test("built preview policy has no inline/dynamic code or production API permission", async () => {
  const headers = await readFile(new URL("../../v2/public/_headers", import.meta.url), "utf8");
  expect(headers).toContain("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self';");
  expect(headers).toContain("X-Robots-Tag: noindex, nofollow");
  expect(headers).not.toMatch(/unsafe-inline|unsafe-eval|api\.huihui\.dev|Report-Only/);
});
