import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, test } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
let workflow;

function jobBody(name, nextJobName) {
  const start = workflow.indexOf(`  ${name}:`);
  const end = nextJobName
    ? workflow.indexOf(`  ${nextJobName}:`, start)
    : workflow.length;

  expect(start, `${name} job`).toBeGreaterThan(-1);
  expect(end, `${name} job boundary`).toBeGreaterThan(start);
  return workflow.slice(start, end);
}

beforeAll(async () => {
  workflow = await readFile(
    path.join(root, ".github/workflows/deploy-huihui-api-worker.yml"),
    "utf8",
  );
});

describe("Worker deployment isolation", () => {
  test("does not deploy Workers from pull requests", () => {
    expect(workflow).not.toMatch(/^\s*pull_request:/m);
  });

  test("deploys only beta automatically on relevant main pushes", () => {
    const betaJob = jobBody("deploy-beta", "deploy-production");
    const productionJob = jobBody("deploy-production");

    expect(workflow).toMatch(/push:\s*\n\s+branches:\s*\n\s+- main/);
    expect(betaJob).toContain("github.event_name == 'push'");
    expect(betaJob).toContain("command: deploy --env beta");
    expect(productionJob).not.toContain("github.event_name == 'push'");
  });

  test("requires an explicit main-branch production dispatch", () => {
    const productionJob = jobBody("deploy-production");

    expect(productionJob).toContain("github.event_name == 'workflow_dispatch'");
    expect(productionJob).toContain("inputs.target == 'production'");
    expect(productionJob).toContain("github.ref == 'refs/heads/main'");
    expect(productionJob).toContain("environment: production");
    expect(productionJob).toMatch(/\n\s+command: deploy\s*$/m);
    expect(productionJob).not.toContain("deploy --env beta");
  });

  test("keeps beta and production credentials under the existing secret names", () => {
    for (const name of ["deploy-beta", "deploy-production"]) {
      const body = jobBody(
        name,
        name === "deploy-beta" ? "deploy-production" : undefined,
      );

      expect(body).toContain("secrets.CLOUDFLARE_API_TOKEN");
      expect(body).toContain("secrets.CLOUDFLARE_ACCOUNT_ID");
    }
  });
});
