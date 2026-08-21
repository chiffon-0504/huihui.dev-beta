import { describe, expect, test, vi } from "vitest";
import {
  WORKER_DEPLOYMENT_PATHS,
  completedFailure,
  resolveRequiredWorkerSha,
  selectNewestCoveringWorkerRun,
} from "../scripts/beta-deployment-sync.mjs";

const A = "a".repeat(40);
const B = "b".repeat(40);
const C = "c".repeat(40);
const D = "d".repeat(40);
const X = "e".repeat(40);

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
