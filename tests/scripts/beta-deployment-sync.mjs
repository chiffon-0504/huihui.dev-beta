import { execFileSync } from "node:child_process";
import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const PAGES_CHECK_NAME = "Cloudflare Pages";
const PAGES_APP_SLUG = "cloudflare-workers-and-pages";
export const PAGES_PROJECT_NAME = "huihuidev-beta";
export const PAGES_CUSTOM_DOMAIN = "beta.huihui.dev";
const WORKER_WORKFLOW = "deploy-huihui-api-worker.yml";
const DEFAULT_PAGES_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_WORKER_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 10 * 1000;
const PAGES_DEPLOYMENTS_PER_PAGE = 100;
const MAX_PAGES_DEPLOYMENT_LIST_PAGES = 100;
const PAGES_TERMINAL_STAGE_STATUSES = new Set([
  "success",
  "failure",
  "canceled",
  "cancelled",
]);
const PAGES_NON_TERMINAL_STAGE_STATUSES = new Set(["idle", "active"]);

export const WORKER_DEPLOYMENT_PATHS = [
  "workers/huihui-api/",
  ".github/workflows/deploy-huihui-api-worker.yml",
];

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function resolveRequiredWorkerSha(targetSha, runGit = execFileSync) {
  const output = runGit(
    "git",
    [
      "log",
      "-1",
      "--format=%H",
      targetSha,
      "--",
      ...WORKER_DEPLOYMENT_PATHS,
    ],
    { encoding: "utf8" },
  );
  const requiredWorkerSha = output.trim();

  if (!/^[0-9a-f]{40}$/i.test(requiredWorkerSha)) {
    throw new Error(
      `No beta Worker deployment state was found in target SHA ${targetSha} ancestry.`,
    );
  }

  return requiredWorkerSha;
}

export function isGitAncestor(ancestorSha, descendantSha) {
  try {
    execFileSync(
      "git",
      ["merge-base", "--is-ancestor", ancestorSha, descendantSha],
      { stdio: "ignore" },
    );
    return true;
  } catch (error) {
    if (error?.status === 1) return false;
    throw error;
  }
}

export function selectNewestCoveringWorkerRun(
  runs,
  requiredWorkerSha,
  targetSha,
  isAncestor = isGitAncestor,
) {
  return [...runs]
    .filter(
      (run) =>
        run.event === "push" &&
        run.head_branch === "main" &&
        typeof run.head_sha === "string" &&
        isAncestor(requiredWorkerSha, run.head_sha) &&
        isAncestor(run.head_sha, targetSha),
    )
    .sort((left, right) => right.id - left.id)[0];
}

async function writeRequiredWorkerSha() {
  const targetSha = requiredEnvironment("TARGET_SHA");
  const requiredWorkerSha = resolveRequiredWorkerSha(targetSha);

  console.log(
    `Target SHA ${targetSha} requires beta Worker state from ancestor ${requiredWorkerSha}.`,
  );

  const outputPath = requiredEnvironment("GITHUB_OUTPUT");
  await appendFile(
    outputPath,
    `required_sha=${requiredWorkerSha}\n`,
    "utf8",
  );
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

async function cloudflareApiEnvelope(
  pathname,
  { accountId, apiToken, fetchImpl = fetch },
) {
  const response = await fetchImpl(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}${pathname}`,
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiToken}`,
      },
      signal: AbortSignal.timeout(15_000),
    },
  );
  const responseText = await response.text();
  let payload;

  try {
    payload = JSON.parse(responseText);
  } catch (error) {
    throw new Error(
      `Cloudflare Pages API ${pathname} returned invalid JSON with HTTP ${response.status}.`,
    );
  }

  if (!response.ok) {
    const details = JSON.stringify(payload?.errors || payload).slice(0, 500);
    throw new Error(
      `Cloudflare Pages API ${pathname} returned HTTP ${response.status}: ${details}`,
    );
  }

  if (payload?.success !== true || !Object.hasOwn(payload, "result")) {
    const details = JSON.stringify(payload?.errors || payload).slice(0, 500);
    throw new Error(
      `Cloudflare Pages API ${pathname} reported an unsuccessful response: ${details}`,
    );
  }

  return payload;
}

export async function cloudflareApiResult(pathname, options) {
  const payload = await cloudflareApiEnvelope(pathname, options);
  return payload.result;
}

export function inspectCanonicalPagesDeployment(project, targetSha) {
  if (!project || typeof project !== "object") {
    throw new Error("Cloudflare Pages project response did not contain a project.");
  }
  if (project.name !== PAGES_PROJECT_NAME) {
    throw new Error(
      `Cloudflare Pages API returned project ${project.name || "<missing>"}; expected ${PAGES_PROJECT_NAME}.`,
    );
  }

  const deployment = project.canonical_deployment;
  if (!deployment || typeof deployment !== "object") {
    return {
      complete: false,
      diagnostic: "canonical deployment is not present",
    };
  }

  const commitHash = deployment.deployment_trigger?.metadata?.commit_hash;
  const stageStatus = deployment.latest_stage?.status;
  if (commitHash !== targetSha) {
    return {
      complete: false,
      diagnostic: `canonical deployment is ${commitHash || "<missing SHA>"} with stage ${stageStatus || "<missing>"}; waiting for ${targetSha}`,
    };
  }

  if (deployment.environment !== "production") {
    throw new Error(
      `Canonical Pages deployment for ${targetSha} has environment ${deployment.environment || "<missing>"}; expected production.`,
    );
  }
  if (deployment.deployment_trigger?.type !== "github:push") {
    throw new Error(
      `Canonical Pages deployment for ${targetSha} has trigger ${deployment.deployment_trigger?.type || "<missing>"}; expected github:push.`,
    );
  }
  if (deployment.is_skipped !== false) {
    throw new Error(
      `Canonical Pages deployment for ${targetSha} has is_skipped=${String(deployment.is_skipped)}; expected false.`,
    );
  }
  if (["failure", "canceled", "cancelled"].includes(stageStatus)) {
    throw new Error(
      `Canonical Pages deployment for ${targetSha} completed with ${stageStatus}.`,
    );
  }
  if (stageStatus !== "success") {
    return {
      complete: false,
      diagnostic: `canonical deployment for ${targetSha} has stage ${stageStatus || "<missing>"}`,
    };
  }

  return {
    complete: true,
    diagnostic: `canonical production deployment ${deployment.id || "<missing id>"} is successful for ${targetSha}`,
  };
}

export function assertActivePagesDomain(domain) {
  if (!domain || typeof domain !== "object") {
    throw new Error("Cloudflare Pages domain response did not contain a domain.");
  }
  if (domain.name !== PAGES_CUSTOM_DOMAIN) {
    throw new Error(
      `Cloudflare Pages API returned domain ${domain.name || "<missing>"}; expected ${PAGES_CUSTOM_DOMAIN}.`,
    );
  }
  if (domain.status !== "active") {
    throw new Error(
      `Cloudflare Pages domain ${PAGES_CUSTOM_DOMAIN} has status ${domain.status || "<missing>"}; expected active.`,
    );
  }

  return `${PAGES_CUSTOM_DOMAIN} is active`;
}

export function inspectPagesProductionQuiescence(deployments, targetSha) {
  if (!Array.isArray(deployments)) {
    throw new Error("Cloudflare Pages deployments response was not an array.");
  }

  const blockers = deployments.filter((deployment) => {
    if (deployment?.environment !== "production" || deployment.is_skipped) {
      return false;
    }

    const stageStatus = deployment.latest_stage?.status;
    if (
      !PAGES_TERMINAL_STAGE_STATUSES.has(stageStatus) &&
      !PAGES_NON_TERMINAL_STAGE_STATUSES.has(stageStatus)
    ) {
      throw new Error(
        `Pages production deployment ${deployment.id || "<missing id>"} has unknown stage status ${stageStatus || "<missing>"}.`,
      );
    }

    const commitHash = deployment.deployment_trigger?.metadata?.commit_hash;
    return (
      commitHash !== targetSha &&
      PAGES_NON_TERMINAL_STAGE_STATUSES.has(stageStatus)
    );
  });

  if (blockers.length > 0) {
    return {
      complete: false,
      diagnostic: `waiting for ${blockers.length} different production deployment(s): ${blockers
        .map((deployment) => {
          const commitHash =
            deployment.deployment_trigger?.metadata?.commit_hash ||
            "<missing SHA>";
          return `${deployment.id || "<missing id>"} ${commitHash} ${deployment.latest_stage.name || "<missing stage>"}/${deployment.latest_stage.status}`;
        })
        .join(", ")}`,
    };
  }

  return {
    complete: true,
    diagnostic: "no different production deployment remains non-terminal",
  };
}

export function inspectActivePagesIdentity(project, domain, targetSha) {
  const deploymentState = inspectCanonicalPagesDeployment(project, targetSha);
  const domainDiagnostic = assertActivePagesDomain(domain);

  return {
    complete: deploymentState.complete,
    diagnostic: `${deploymentState.diagnostic}; ${domainDiagnostic}`,
  };
}

export function inspectQuiescentPagesState(
  project,
  domain,
  deployments,
  targetSha,
) {
  const identityState = inspectActivePagesIdentity(project, domain, targetSha);
  const quiescenceState = inspectPagesProductionQuiescence(
    deployments,
    targetSha,
  );

  return {
    complete: identityState.complete && quiescenceState.complete,
    diagnostic: `${identityState.diagnostic}; ${quiescenceState.diagnostic}`,
  };
}

async function getProductionPagesDeployments(accountId, apiToken) {
  const projectPath = `/pages/projects/${encodeURIComponent(PAGES_PROJECT_NAME)}`;
  const deployments = [];
  let page = 1;
  let totalPages = 1;

  do {
    const payload = await cloudflareApiEnvelope(
      `${projectPath}/deployments?env=production&per_page=${PAGES_DEPLOYMENTS_PER_PAGE}&page=${page}`,
      { accountId, apiToken },
    );
    if (!Array.isArray(payload.result)) {
      throw new Error("Cloudflare Pages deployments response was not an array.");
    }
    deployments.push(...payload.result);

    const reportedTotalPages = Number(payload.result_info?.total_pages);
    totalPages = Number.isInteger(reportedTotalPages)
      ? Math.max(1, reportedTotalPages)
      : 1;
    if (totalPages > MAX_PAGES_DEPLOYMENT_LIST_PAGES) {
      throw new Error(
        `Cloudflare Pages deployments response requires ${totalPages} pages; maximum supported is ${MAX_PAGES_DEPLOYMENT_LIST_PAGES}.`,
      );
    }
    page += 1;
  } while (page <= totalPages);

  return deployments;
}

async function getActivePagesState(accountId, apiToken, targetSha) {
  const projectPath = `/pages/projects/${encodeURIComponent(PAGES_PROJECT_NAME)}`;
  const domainPath = `${projectPath}/domains/${encodeURIComponent(PAGES_CUSTOM_DOMAIN)}`;
  const cloudflareOptions = { accountId, apiToken };
  const [project, domain] = await Promise.all([
    cloudflareApiResult(projectPath, cloudflareOptions),
    cloudflareApiResult(domainPath, cloudflareOptions),
  ]);

  return inspectActivePagesIdentity(project, domain, targetSha);
}

async function getQuiescentPagesState(accountId, apiToken, targetSha) {
  const projectPath = `/pages/projects/${encodeURIComponent(PAGES_PROJECT_NAME)}`;
  const domainPath = `${projectPath}/domains/${encodeURIComponent(PAGES_CUSTOM_DOMAIN)}`;
  const cloudflareOptions = { accountId, apiToken };
  const [project, domain, deployments] = await Promise.all([
    cloudflareApiResult(projectPath, cloudflareOptions),
    cloudflareApiResult(domainPath, cloudflareOptions),
    getProductionPagesDeployments(accountId, apiToken),
  ]);

  return inspectQuiescentPagesState(project, domain, deployments, targetSha);
}

export function completedFailure(label, item, subject) {
  if (item.status !== "completed") return;
  if (item.conclusion === "success") return;

  throw new Error(
    `${label} for ${subject} completed with ${item.conclusion || "no conclusion"}: ${item.html_url || item.details_url || "no details URL"}`,
  );
}

export async function pollExactDeployment({
  label,
  timeoutSubject,
  inspect,
  timeoutMs,
  intervalMs,
}) {
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
    `${label} did not complete ${timeoutSubject} within ${Math.round(timeoutMs / 60_000)} minutes. Last state: ${lastDiagnostic || "not observed"}`,
  );
}

async function waitForPages(owner, repository, targetSha, options) {
  const accountId = requiredEnvironment("CLOUDFLARE_ACCOUNT_ID");
  const apiToken = requiredEnvironment("CLOUDFLARE_PAGES_READ_API_TOKEN");
  let exactCheckSucceeded = false;

  return pollExactDeployment({
    label: "Cloudflare Pages",
    timeoutSubject: `for exact target SHA ${targetSha}`,
    ...options,
    async inspect() {
      if (!exactCheckSucceeded) {
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
          return {
            complete: false,
            diagnostic: `waiting for exact SHA ${targetSha} GitHub check`,
          };
        }

        completedFailure("Cloudflare Pages", check, `exact SHA ${targetSha}`);
        exactCheckSucceeded = check.status === "completed";
        if (!exactCheckSucceeded) {
          return {
            complete: false,
            diagnostic: `${check.status}/${check.conclusion || "pending"} for exact SHA ${check.head_sha} (${check.details_url})`,
          };
        }
      }

      const pagesState = await getQuiescentPagesState(
        accountId,
        apiToken,
        targetSha,
      );

      return {
        complete: pagesState.complete,
        diagnostic: `exact GitHub check succeeded; ${pagesState.diagnostic}`,
      };
    },
  });
}

async function verifyPagesActive() {
  const accountId = requiredEnvironment("CLOUDFLARE_ACCOUNT_ID");
  const apiToken = requiredEnvironment("CLOUDFLARE_PAGES_READ_API_TOKEN");
  const targetSha = requiredEnvironment("TARGET_SHA");
  const pagesState = await getActivePagesState(
    accountId,
    apiToken,
    targetSha,
  );

  if (!pagesState.complete) {
    throw new Error(
      `Active Pages deployment does not represent target SHA ${targetSha}: ${pagesState.diagnostic}`,
    );
  }

  console.log(`${pagesState.diagnostic}.`);
}

async function waitForPagesQuiescence() {
  const accountId = requiredEnvironment("CLOUDFLARE_ACCOUNT_ID");
  const apiToken = requiredEnvironment("CLOUDFLARE_PAGES_READ_API_TOKEN");
  const targetSha = requiredEnvironment("TARGET_SHA");
  const timeoutMs =
    Number(process.env.PAGES_DEPLOYMENT_TIMEOUT_MS) ||
    DEFAULT_PAGES_TIMEOUT_MS;
  const intervalMs =
    Number(process.env.DEPLOYMENT_POLL_INTERVAL_MS) ||
    DEFAULT_POLL_INTERVAL_MS;

  await pollExactDeployment({
    label: "Cloudflare Pages quiescence",
    timeoutSubject: `for target SHA ${targetSha}`,
    timeoutMs,
    intervalMs,
    inspect: () => getQuiescentPagesState(accountId, apiToken, targetSha),
  });
}

async function waitForWorker(
  owner,
  repository,
  requiredWorkerSha,
  targetSha,
  options,
) {
  const coverageByHeadSha = new Map();
  const isCoveringAncestor = (ancestorSha, descendantSha) => {
    const key = `${ancestorSha}:${descendantSha}`;
    if (!coverageByHeadSha.has(key)) {
      coverageByHeadSha.set(key, isGitAncestor(ancestorSha, descendantSha));
    }
    return coverageByHeadSha.get(key);
  };

  return pollExactDeployment({
    label: "Beta Worker workflow",
    timeoutSubject: `for required Worker SHA ${requiredWorkerSha} within target SHA ${targetSha} ancestry`,
    ...options,
    async inspect() {
      const data = await githubJson(
        `/repos/${owner}/${repository}/actions/workflows/${WORKER_WORKFLOW}/runs?branch=main&event=push&per_page=100`,
      );
      const run = selectNewestCoveringWorkerRun(
        data.workflow_runs,
        requiredWorkerSha,
        targetSha,
        isCoveringAncestor,
      );

      if (!run) {
        return {
          complete: false,
          diagnostic: `waiting for a main push run covering required Worker SHA ${requiredWorkerSha} within target SHA ${targetSha} ancestry`,
        };
      }

      completedFailure(
        "Beta Worker workflow",
        run,
        `required Worker SHA ${requiredWorkerSha} via covering run head ${run.head_sha}`,
      );
      return {
        complete: run.status === "completed",
        diagnostic: `${run.status}/${run.conclusion || "pending"} for covering head ${run.head_sha}, required Worker SHA ${requiredWorkerSha} (${run.html_url})`,
      };
    },
  });
}

async function waitForDeployments() {
  const repositoryName = requiredEnvironment("GITHUB_REPOSITORY");
  const [owner, repository] = repositoryName.split("/");
  const targetSha = requiredEnvironment("TARGET_SHA");
  const requiredWorkerSha = requiredEnvironment("REQUIRED_WORKER_SHA");
  const pagesTimeoutMs =
    Number(process.env.PAGES_DEPLOYMENT_TIMEOUT_MS) ||
    DEFAULT_PAGES_TIMEOUT_MS;
  const workerTimeoutMs =
    Number(process.env.WORKER_DEPLOYMENT_TIMEOUT_MS) ||
    DEFAULT_WORKER_TIMEOUT_MS;
  const intervalMs =
    Number(process.env.DEPLOYMENT_POLL_INTERVAL_MS) ||
    DEFAULT_POLL_INTERVAL_MS;

  console.log(`Synchronizing beta deployment for exact SHA ${targetSha}.`);
  await Promise.all([
    waitForPages(owner, repository, targetSha, {
      timeoutMs: pagesTimeoutMs,
      intervalMs,
    }),
    waitForWorker(owner, repository, requiredWorkerSha, targetSha, {
      timeoutMs: workerTimeoutMs,
      intervalMs,
    }),
  ]);
  console.log(
    `Pages deployment for ${targetSha} and beta Worker state ${requiredWorkerSha} succeeded.`,
  );
}

async function main() {
  const command = process.argv[2];
  if (command === "resolve-worker-sha") return writeRequiredWorkerSha();
  if (command === "wait") return waitForDeployments();
  if (command === "wait-pages-quiescent") return waitForPagesQuiescence();
  if (command === "verify-pages-active") return verifyPagesActive();
  throw new Error(
    "Expected command: resolve-worker-sha, wait, wait-pages-quiescent, or verify-pages-active",
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
