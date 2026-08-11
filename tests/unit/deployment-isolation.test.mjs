import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { parseDocument } from "yaml";

const root = path.resolve(import.meta.dirname, "../..");
let workflow;

function parseWorkflow(source) {
  const document = parseDocument(source);
  if (document.errors.length > 0) {
    const details = document.errors.map((error) => error.message).join("; ");
    throw new Error(`deploy-huihui-api-worker.yml is not valid YAML: ${details}`);
  }

  return document.toJS();
}

function jobAction(job, action) {
  return job.steps.find(
    ({ uses }) => typeof uses === "string" && uses.startsWith(`${action}@`),
  );
}

beforeAll(async () => {
  const source = await readFile(
    path.join(root, ".github/workflows/deploy-huihui-api-worker.yml"),
    "utf8",
  );
  workflow = parseWorkflow(source);
});

describe("Worker deployment isolation", () => {
  test("does not deploy Workers from pull requests", () => {
    expect(Object.hasOwn(workflow.on, "pull_request")).toBe(false);
    expect(workflow.on.push.branches).toEqual(["main"]);
    expect(workflow.on.push.paths).toEqual([
      "workers/huihui-api/**",
      ".github/workflows/deploy-huihui-api-worker.yml",
    ]);
  });

  test("gates beta deployment on lightweight validation", () => {
    const validation = workflow.jobs["validate-beta"];
    const deployment = workflow.jobs["deploy-beta"];

    expect(validation.uses).toBe("./.github/workflows/validate.yml");
    expect(validation.if).toContain("github.event_name == 'push'");
    expect(validation.if).toContain("inputs.target == 'beta'");
    expect(deployment.needs).toBe("validate-beta");
    expect(deployment.if).toContain("github.event_name == 'push'");
    expect(deployment.if).toContain("inputs.target == 'beta'");

    const wrangler = jobAction(deployment, "cloudflare/wrangler-action");
    expect(wrangler.with.workingDirectory).toBe("workers/huihui-api");
    expect(wrangler.with.command).toBe("deploy --env beta");
  });

  test("requires strong validation before an explicit main production dispatch", () => {
    const validation = workflow.jobs["validate-production"];
    const deployment = workflow.jobs["deploy-production"];

    expect(workflow.on.workflow_dispatch.inputs.target.options).toEqual([
      "beta",
      "production",
    ]);
    expect(validation.uses).toBe(
      "./.github/workflows/main-regression.yml",
    );
    expect(validation.if).toContain("github.event_name == 'workflow_dispatch'");
    expect(validation.if).toContain("inputs.target == 'production'");
    expect(validation.if).toContain("github.ref == 'refs/heads/main'");

    expect(deployment.needs).toBe("validate-production");
    expect(deployment.if).toContain("github.event_name == 'workflow_dispatch'");
    expect(deployment.if).toContain("inputs.target == 'production'");
    expect(deployment.if).toContain("github.ref == 'refs/heads/main'");
    expect(deployment.if).not.toContain("github.event_name == 'push'");
    expect(deployment.environment).toBe("production");

    const wrangler = jobAction(deployment, "cloudflare/wrangler-action");
    expect(wrangler.with.workingDirectory).toBe("workers/huihui-api");
    expect(wrangler.with.command).toBe("deploy");
  });

  test("keeps beta and production credentials under the existing secret names", () => {
    for (const name of ["deploy-beta", "deploy-production"]) {
      const wrangler = jobAction(
        workflow.jobs[name],
        "cloudflare/wrangler-action",
      );

      expect(wrangler.with.apiToken).toBe(
        "${{ secrets.CLOUDFLARE_API_TOKEN }}",
      );
      expect(wrangler.with.accountId).toBe(
        "${{ secrets.CLOUDFLARE_ACCOUNT_ID }}",
      );
    }
  });
});
