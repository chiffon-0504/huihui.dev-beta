import { afterEach, describe, expect, test, vi } from "vitest";
import {
  PAGES_CUSTOM_DOMAIN,
  PAGES_PROJECT_NAME,
  WORKER_DEPLOYMENT_PATHS,
  assertActivePagesDomain,
  cloudflareApiResult,
  completedFailure,
  inspectCanonicalPagesDeployment,
  pollExactDeployment,
  resolveRequiredWorkerSha,
  selectNewestCoveringWorkerRun,
} from "../scripts/beta-deployment-sync.mjs";

const A = "a".repeat(40);
const B = "b".repeat(40);
const C = "c".repeat(40);
const D = "d".repeat(40);
const X = "e".repeat(40);

afterEach(() => {
  vi.useRealTimers();
});

const ancestry = new Map([
  [A, new Set([A])],
  [B, new Set([A, B])],
  [C, new Set([A, B, C])],
  [D, new Set([A, B, C, D])],
  [X, new Set([A, X])],
]);

function isAncestor(ancestorSha, descendantSha) {
  return ancestry.get(descendantSha)?.has(ancestorSha) || false;
}

function workerRun({ id, headSha, status = "completed", conclusion = "success" }) {
  return {
    id,
    event: "push",
    head_branch: "main",
    head_sha: headSha,
    status,
    conclusion,
    html_url: `https://example.test/runs/${id}`,
  };
}

function pagesProject({
  sha = A,
  stageStatus = "success",
  environment = "production",
  triggerType = "github:push",
  isSkipped = false,
} = {}) {
  return {
    name: PAGES_PROJECT_NAME,
    canonical_deployment: {
      id: "deployment-id",
      environment,
      is_skipped: isSkipped,
      deployment_trigger: {
        type: triggerType,
        metadata: { commit_hash: sha },
      },
      latest_stage: { status: stageStatus },
    },
  };
}

describe("beta Worker deployment synchronization", () => {
  test("resolves the latest Worker-affecting commit in target ancestry", () => {
    const runGit = vi.fn(() => `${A}\n`);

    expect(resolveRequiredWorkerSha(B, runGit)).toBe(A);
    expect(runGit).toHaveBeenCalledWith(
      "git",
      ["log", "-1", "--format=%H", B, "--", ...WORKER_DEPLOYMENT_PATHS],
      { encoding: "utf8" },
    );
  });

  test("fails clearly when target ancestry has no Worker deployment state", () => {
    expect(() => resolveRequiredWorkerSha(B, () => "")).toThrow(
      `No beta Worker deployment state was found in target SHA ${B} ancestry.`,
    );
  });

  test.each(["queued", "in_progress"])(
    "makes static B wait for the %s Worker run from ancestor A",
    (status) => {
      const run = workerRun({
        id: 10,
        headSha: A,
        status,
        conclusion: null,
      });

      expect(selectNewestCoveringWorkerRun([run], A, B, isAncestor)).toBe(run);
    },
  );

  test("accepts an already successful Worker A deployment for static B", () => {
    const run = workerRun({ id: 10, headSha: A });

    expect(selectNewestCoveringWorkerRun([run], A, B, isAncestor)).toBe(run);
    expect(() =>
      completedFailure("Beta Worker workflow", run, `required Worker SHA ${A}`),
    ).not.toThrow();
  });

  test("fails static B when its required Worker A deployment failed", () => {
    const run = workerRun({
      id: 10,
      headSha: A,
      conclusion: "failure",
    });

    expect(selectNewestCoveringWorkerRun([run], A, B, isAncestor)).toBe(run);
    expect(() =>
      completedFailure("Beta Worker workflow", run, `required Worker SHA ${A}`),
    ).toThrow(/required Worker SHA.*failure/);
  });

  test("requires newer Worker C rather than older Worker A for static D", () => {
    const runA = workerRun({ id: 10, headSha: A });
    const runC = workerRun({
      id: 20,
      headSha: C,
      status: "in_progress",
      conclusion: null,
    });

    expect(
      selectNewestCoveringWorkerRun([runA, runC], C, D, isAncestor),
    ).toBe(runC);
  });

  test("accepts a batched push run whose static head B covers Worker commit A", () => {
    const batchedRun = workerRun({ id: 10, headSha: B });

    expect(
      selectNewestCoveringWorkerRun([batchedRun], A, B, isAncestor),
    ).toBe(batchedRun);
  });

  test("rejects runs outside target ancestry and production dispatches", () => {
    const outsideTarget = workerRun({ id: 30, headSha: X });
    const productionDispatch = {
      ...workerRun({ id: 40, headSha: A }),
      event: "workflow_dispatch",
    };

    expect(
      selectNewestCoveringWorkerRun(
        [outsideTarget, productionDispatch],
        A,
        B,
        isAncestor,
      ),
    ).toBeUndefined();
  });

  test("selects the newest covering run and rejects cancellation without one", () => {
    const olderSuccess = workerRun({ id: 10, headSha: A });
    const newerCancelled = workerRun({
      id: 20,
      headSha: B,
      conclusion: "cancelled",
    });
    const selected = selectNewestCoveringWorkerRun(
      [olderSuccess, newerCancelled],
      A,
      B,
      isAncestor,
    );

    expect(selected).toBe(newerCancelled);
    expect(() =>
      completedFailure(
        "Beta Worker workflow",
        selected,
        `required Worker SHA ${A}`,
      ),
    ).toThrow(/cancelled/);
  });
});

describe("active Cloudflare Pages deployment synchronization", () => {
  test("accepts the successful canonical production deployment for TARGET_SHA", () => {
    expect(inspectCanonicalPagesDeployment(pagesProject(), A)).toEqual({
      complete: true,
      diagnostic: `canonical production deployment deployment-id is successful for ${A}`,
    });
  });

  test.each([
    ["older", A, B],
    ["newer or different", B, A],
  ])("does not accept a %s canonical deployment SHA", (label, observed, target) => {
    const result = inspectCanonicalPagesDeployment(
      pagesProject({ sha: observed }),
      target,
    );

    expect(result.complete).toBe(false);
    expect(result.diagnostic).toContain(`waiting for ${target}`);
  });

  test.each(["failure", "canceled", "cancelled"])(
    "fails a target canonical deployment with stage %s",
    (stageStatus) => {
      expect(() =>
        inspectCanonicalPagesDeployment(pagesProject({ stageStatus }), A),
      ).toThrow(stageStatus);
    },
  );

  test("fails a skipped target canonical deployment", () => {
    expect(() =>
      inspectCanonicalPagesDeployment(pagesProject({ isSkipped: true }), A),
    ).toThrow(/is_skipped=true/);
  });

  test("waits when the canonical deployment is missing", () => {
    expect(
      inspectCanonicalPagesDeployment(
        { name: PAGES_PROJECT_NAME, canonical_deployment: null },
        A,
      ),
    ).toEqual({
      complete: false,
      diagnostic: "canonical deployment is not present",
    });
  });

  test.each([
    [
      "different SHA",
      inspectCanonicalPagesDeployment(pagesProject({ sha: A }), B),
    ],
    [
      "missing canonical deployment",
      inspectCanonicalPagesDeployment(
        { name: PAGES_PROJECT_NAME, canonical_deployment: null },
        B,
      ),
    ],
  ])("fails after a bounded wait for %s", async (label, state) => {
    vi.useFakeTimers();
    const pending = pollExactDeployment({
      label: "Cloudflare Pages",
      timeoutSubject: `for exact target SHA ${B}`,
      timeoutMs: 1_000,
      intervalMs: 100,
      inspect: vi.fn().mockResolvedValue(state),
    });
    const rejection = expect(pending).rejects.toThrow(
      new RegExp(`Last state: ${state.diagnostic.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
    );

    await vi.advanceTimersByTimeAsync(1_000);
    await rejection;
  });

  test.each([
    ["environment", { environment: "preview" }, /expected production/],
    ["trigger", { triggerType: "ad_hoc" }, /expected github:push/],
  ])("rejects the wrong canonical deployment %s", (label, overrides, error) => {
    expect(() =>
      inspectCanonicalPagesDeployment(pagesProject(overrides), A),
    ).toThrow(error);
  });

  test("requires the configured custom domain to be active", () => {
    expect(
      assertActivePagesDomain({ name: PAGES_CUSTOM_DOMAIN, status: "active" }),
    ).toBe(`${PAGES_CUSTOM_DOMAIN} is active`);
    expect(() =>
      assertActivePagesDomain({ name: PAGES_CUSTOM_DOMAIN, status: "pending" }),
    ).toThrow(/status pending; expected active/);
  });

  test("reports Cloudflare Pages API authentication errors clearly", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: false, errors: [{ code: 10000 }] }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      cloudflareApiResult(`/pages/projects/${PAGES_PROJECT_NAME}`, {
        accountId: "account-id",
        apiToken: "pages-read-token",
        fetchImpl,
      }),
    ).rejects.toThrow(/returned HTTP 403/);
    expect(fetchImpl).toHaveBeenCalledWith(
      `https://api.cloudflare.com/client/v4/accounts/account-id/pages/projects/${PAGES_PROJECT_NAME}`,
      expect.objectContaining({
        headers: {
          Accept: "application/json",
          Authorization: "Bearer pages-read-token",
        },
      }),
    );
  });

  test("reports a successful HTTP response with a Cloudflare API error envelope", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: false, errors: [{ code: 8000000 }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      cloudflareApiResult(`/pages/projects/${PAGES_PROJECT_NAME}`, {
        accountId: "account-id",
        apiToken: "pages-read-token",
        fetchImpl,
      }),
    ).rejects.toThrow(/reported an unsuccessful response/);
  });
});
