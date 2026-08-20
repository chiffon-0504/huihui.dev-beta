import { execFileSync } from "node:child_process";
import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const PAGES_CHECK_NAME = "Cloudflare Pages";
const PAGES_APP_SLUG = "cloudflare-workers-and-pages";
const WORKER_WORKFLOW = "deploy-huihui-api-worker.yml";
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 10 * 1000;
const ZERO_SHA = /^0{40}$/;

export function hasWorkerDeploymentChange(paths) {
  return paths.some(
    (file) =>
      file === ".github/workflows/deploy-huihui-api-worker.yml" ||
      file.startsWith("workers/huihui-api/"),
  );
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function changedPaths(beforeSha, targetSha) {
  const base = ZERO_SHA.test(beforeSha) ? `${targetSha}^` : beforeSha;
  const output = execFileSync(
    "git",
    ["diff", "--name-only", "--diff-filter=ACDMRTUXB", base, targetSha],
    { encoding: "utf8" },
  );

  return output.split(/\r?\n/).filter(Boolean);
}

async function detectWorkerChange() {
  const beforeSha = requiredEnvironment("BEFORE_SHA");
  const targetSha = requiredEnvironment("TARGET_SHA");
  const paths = changedPaths(beforeSha, targetSha);
  const workerPaths = paths.filter(
    (file) =>
      file === ".github/workflows/deploy-huihui-api-worker.yml" ||
      file.startsWith("workers/huihui-api/"),
  );
  const required = hasWorkerDeploymentChange(paths);

  console.log(`Compared exact push range ${beforeSha}..${targetSha}.`);
  console.log(
    required
      ? `Beta Worker deployment required by: ${workerPaths.join(", ")}`
      : "No beta Worker deployment is required for this push.",
  );

  const outputPath = requiredEnvironment("GITHUB_OUTPUT");
  await appendFile(outputPath, `required=${required}\n`, "utf8");
}

async function githubJson(pathname) {
  const token = requiredEnvironment("GITHUB_TOKEN");
  const response = await fetch(`https://api.github.com${pathname}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "huihui-dev-beta-cd",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const details = (await response.text()).slice(0, 500);
    throw new Error(
      `GitHub API ${pathname} returned HTTP ${response.status}: ${details}`,
    );
  }

  return response.json();
}

function completedFailure(label, item) {
  if (item.status !== "completed") return;
  if (item.conclusion === "success") return;

  throw new Error(
    `${label} for exact SHA ${item.head_sha} completed with ${item.conclusion || "no conclusion"}: ${item.html_url || item.details_url || "no details URL"}`,
  );
}

async function pollExactDeployment({ label, inspect, timeoutMs, intervalMs }) {
  const deadline = Date.now() + timeoutMs;
  let lastDiagnostic = "";

  while (Date.now() < deadline) {
    const result = await inspect();
    if (result.diagnostic !== lastDiagnostic) {
      console.log(`${label}: ${result.diagnostic}`);
      lastDiagnostic = result.diagnostic;
    }
    if (result.complete) return;

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(intervalMs, remainingMs)),
    );
  }

  throw new Error(
    `${label} did not complete for the exact target SHA within ${Math.round(timeoutMs / 60_000)} minutes. Last state: ${lastDiagnostic || "not observed"}`,
  );
}

async function waitForPages(owner, repository, targetSha, options) {
  return pollExactDeployment({
    label: "Cloudflare Pages",
    ...options,
    async inspect() {
      const data = await githubJson(
        `/repos/${owner}/${repository}/commits/${targetSha}/check-runs?per_page=100`,
      );
      const check = data.check_runs
        .filter(
          (item) =>
            item.head_sha === targetSha &&
            item.name === PAGES_CHECK_NAME &&
            item.app?.slug === PAGES_APP_SLUG,
        )
        .sort((left, right) => right.id - left.id)[0];

      if (!check) {
        return { complete: false, diagnostic: `waiting for exact SHA ${targetSha}` };
      }

      completedFailure("Cloudflare Pages", check);
      return {
        complete: check.status === "completed",
        diagnostic: `${check.status}/${check.conclusion || "pending"} for ${check.head_sha} (${check.details_url})`,
      };
    },
  });
}

async function waitForWorker(owner, repository, targetSha, options) {
  return pollExactDeployment({
    label: "Beta Worker workflow",
    ...options,
    async inspect() {
      const data = await githubJson(
        `/repos/${owner}/${repository}/actions/workflows/${WORKER_WORKFLOW}/runs?branch=main&event=push&head_sha=${targetSha}&per_page=20`,
      );
      const run = data.workflow_runs
        .filter(
          (item) =>
            item.head_sha === targetSha &&
            item.event === "push" &&
            item.head_branch === "main",
        )
        .sort((left, right) => right.id - left.id)[0];

      if (!run) {
        return { complete: false, diagnostic: `waiting for exact SHA ${targetSha}` };
      }

      completedFailure("Beta Worker workflow", run);
      return {
        complete: run.status === "completed",
        diagnostic: `${run.status}/${run.conclusion || "pending"} for ${run.head_sha} (${run.html_url})`,
      };
    },
  });
}

async function waitForDeployments() {
  const repositoryName = requiredEnvironment("GITHUB_REPOSITORY");
  const [owner, repository] = repositoryName.split("/");
  const targetSha = requiredEnvironment("TARGET_SHA");
  const workerRequired = requiredEnvironment("WORKER_REQUIRED") === "true";
  const timeoutMs = Number(process.env.DEPLOYMENT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  const intervalMs =
    Number(process.env.DEPLOYMENT_POLL_INTERVAL_MS) ||
    DEFAULT_POLL_INTERVAL_MS;
  const options = { timeoutMs, intervalMs };

  console.log(`Synchronizing beta deployment for exact SHA ${targetSha}.`);
  await Promise.all([
    waitForPages(owner, repository, targetSha, options),
    ...(workerRequired
      ? [waitForWorker(owner, repository, targetSha, options)]
      : []),
  ]);
  console.log(
    workerRequired
      ? `Pages and beta Worker deployments succeeded for ${targetSha}.`
      : `Pages deployment succeeded for ${targetSha}; Worker wait was not required.`,
  );
}

async function main() {
  const command = process.argv[2];
  if (command === "detect-worker-change") return detectWorkerChange();
  if (command === "wait") return waitForDeployments();
  throw new Error("Expected command: detect-worker-change or wait");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
