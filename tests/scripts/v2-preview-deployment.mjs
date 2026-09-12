import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const PROJECT = "huihuidev-v2-beta";
export const DOMAIN = "v2.beta.huihui.dev";
export const REPOSITORY = "chiffon-0504/huihui.dev-beta";
const dist = new URL("../../v2/dist/", import.meta.url);

function required(name) {
  const value = process.env[name];
  assert(value, `Missing ${name}`);
  return value;
}

export function validateSha(sha) {
  assert.match(sha, /^[a-f0-9]{40}$/, "Expected full commit SHA");
  return sha;
}

export function validateProject(project) {
  assert.equal(project.name, PROJECT, "Unexpected Pages project");
  assert.equal(project.production_branch, "main", "Unexpected Pages branch");
  assert(!project.source, "Use a separate Direct Upload project without Git integration");
}

export function validateDeployment(deployment, sha, id) {
  assert.equal(deployment.id, id, "Deployment ID mismatch");
  assert.equal(deployment.project_name, PROJECT, "Deployment project mismatch");
  assert.equal(deployment.environment, "production", "Expected the v2 project's main deployment");
  assert.equal(deployment.latest_stage?.name, "deploy");
  assert.equal(deployment.latest_stage?.status, "success", "Pages deployment not successful");
  assert.equal(deployment.deployment_trigger?.metadata?.branch, "main");
  assert.equal(deployment.deployment_trigger?.metadata?.commit_hash, sha, "Deployment SHA mismatch");
  assert.equal(deployment.deployment_trigger?.metadata?.commit_dirty, false);
}

async function cloudflare(path) {
  const account = required("CLOUDFLARE_ACCOUNT_ID");
  assert.match(account, /^[a-f0-9]{32}$/);
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/${PROJECT}${path}`, {
    headers: { Authorization: `Bearer ${required("CLOUDFLARE_API_TOKEN")}` },
    signal: AbortSignal.timeout(15_000),
  });
  // Never print response bodies, headers, tokens or configuration secret values.
  assert(response.ok, `Pages API HTTP ${response.status}; check project existence and Account / Cloudflare Pages / Edit permission`);
  const body = await response.json();
  assert(body.success, "Pages API request failed");
  return body.result;
}

export async function prepare(sha) {
  validateSha(sha);
  const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  assert.equal(head, sha, "Build checkout does not match TARGET_SHA");
  execFileSync("git", ["diff", "--quiet", "HEAD", "--"], { stdio: "ignore" });
  const files = await readdir(dist, { recursive: true });
  for (const file of files) {
    assert(!/(^|[/\\])(?:src|vendor|js|functions)([/\\]|$)|\.ts$|^_worker\.js/.test(file), `Unexpected deploy artifact: ${file}`);
  }
  for (const entry of ["index.html", "en/index.html", "ja/index.html"]) {
    const html = await readFile(new URL(entry, dist), "utf8");
    assert.match(html, /type="module"[^>]+src="\/assets\/.+\.js"/);
    assert.match(html, /rel="stylesheet"[^>]+href="\/assets\/.+\.css"/);
    assert(!/\/src\/|\/vendor\/|\/js\/|\/style\.css/.test(html), "Found v1 or source asset");
  }
  assert.equal(await readFile(new URL("_headers", dist), "utf8"), await readFile(new URL("../../v2/public/_headers", import.meta.url), "utf8"));
  await writeFile(new URL("deployment.json", dist), `${JSON.stringify({ project: PROJECT, repository: REPOSITORY, sha })}\n`);
  console.log(`Prepared ${PROJECT} from ${sha}: v2/dist/`);
}

async function preflight(sha) {
  assert.equal(process.env.GITHUB_REPOSITORY, REPOSITORY);
  assert.equal(process.env.GITHUB_REF, "refs/heads/main");
  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/git/ref/heads/main`, {
    headers: { Authorization: `Bearer ${required("GITHUB_TOKEN")}`, "User-Agent": PROJECT, Accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(15_000),
  });
  assert(response.ok, `GitHub main verification HTTP ${response.status}`);
  assert.equal((await response.json()).object.sha, sha, "Stale run: a newer main commit must deploy instead");
  validateProject(await cloudflare(""));
  console.log(`Verified current main ${sha} and independent project ${PROJECT}`);
}

async function verify(sha) {
  const id = required("DEPLOYMENT_ID");
  assert.match(id, /^[a-f0-9-]{36}$/);
  // Poll actual state, not a guessed build duration. Bound total completion wait.
  const deadline = Date.now() + 5 * 60_000;
  let deployment;
  while (true) {
    deployment = await cloudflare(`/deployments/${id}`);
    const status = deployment.latest_stage?.status;
    if (deployment.latest_stage?.name === "deploy" && status === "success") break;
    assert(!["failure", "canceled", "cancelled"].includes(status), "Pages deployment failed");
    assert(Date.now() < deadline, "Timed out waiting for Pages deployment state");
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  validateDeployment(deployment, sha, id);
  const project = await cloudflare("");
  validateProject(project);
  validateDeployment(project.canonical_deployment, sha, id);
  const domain = await cloudflare(`/domains/${DOMAIN}`);
  assert.equal(domain.name, DOMAIN);
  assert.equal(domain.status, "active", "Custom domain/TLS is not active");
  const headers = await readFile(new URL("_headers", dist), "utf8");
  const csp = headers.match(/^\s+Content-Security-Policy: (.+)$/m)[1].trim();
  const files = ["deployment.json", "index.html", "en/index.html", "ja/index.html", ...(await readdir(new URL("assets/", dist))).map((file) => `assets/${file}`)];
  for (const file of files) {
    const route = file.replace(/index\.html$/, "");
    const response = await fetch(`https://${DOMAIN}/${route}`, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000) });
    assert.equal(response.status, 200, `Live HTTP failure: ${route}`);
    assert.equal(response.headers.get("content-security-policy"), csp, `CSP delivery mismatch: ${route}`);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), await readFile(new URL(file, dist)), `Live artifact mismatch: ${route}`);
  }
  console.log(`Verified ${PROJECT} deployment ${id}, SHA ${sha}, https://${DOMAIN}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const sha = validateSha(required("TARGET_SHA"));
    const commands = { prepare, preflight, verify };
    assert(Object.hasOwn(commands, process.argv[2]), "Expected prepare, preflight or verify");
    await commands[process.argv[2]](sha);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
