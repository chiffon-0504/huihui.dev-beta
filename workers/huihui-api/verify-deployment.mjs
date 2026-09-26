import { pathToFileURL } from "node:url";

// Static contracts keep these expectations aligned with env.beta in wrangler.toml.
export const BETA_WORKER = "huihui-api-beta";
export const EXPECTED_LIMITER = Object.freeze({
  name: "JEV_RATE_LIMITER",
  type: "ratelimit",
  namespace_id: "922601",
  limit: 10,
  period: 60,
});
export const EXPECTED_PUBLIC_QUOTA = Object.freeze({
  name: "JEV_PUBLIC_QUOTA",
  type: "durable_object_namespace",
  class_name: "JevPublicQuota",
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{40}$/;

class AcceptanceError extends Error {}

function requireCondition(condition, message) {
  if (!condition) throw new AcceptanceError(message);
}

export function activeDeployment(result) {
  // Cloudflare documents the first entry as the deployment actively serving traffic.
  const deployment = result?.deployments?.[0];
  requireCondition(
    Array.isArray(result?.deployments) && UUID.test(deployment?.id ?? "") &&
      Array.isArray(deployment?.versions) && deployment.versions.length === 1 &&
      UUID.test(deployment.versions[0]?.version_id ?? "") &&
      deployment.versions[0]?.percentage === 100,
    "Expected one active beta Worker version serving 100% of traffic.",
  );
  return { deploymentId: deployment.id, versionId: deployment.versions[0].version_id };
}

export function verifyVersion(version, versionId, targetSha) {
  requireCondition(
    version?.id === versionId && version?.annotations?.["workers/tag"] === targetSha,
    "Active beta Worker version does not match the expected commit tag.",
  );
  const bindings = version?.resources?.bindings;
  requireCondition(Array.isArray(bindings), "Worker version binding metadata is missing.");
  const limiters = bindings.filter(binding => binding?.name === EXPECTED_LIMITER.name);
  requireCondition(
    limiters.length === 1 && limiters[0].type === EXPECTED_LIMITER.type &&
      limiters[0].namespace_id === EXPECTED_LIMITER.namespace_id &&
      limiters[0].simple?.limit === EXPECTED_LIMITER.limit &&
      limiters[0].simple?.period === EXPECTED_LIMITER.period,
    "JEV_RATE_LIMITER is missing or does not match the beta configuration.",
  );
  const quotas = bindings.filter(binding => binding?.name === EXPECTED_PUBLIC_QUOTA.name);
  requireCondition(
    quotas.length === 1 && quotas[0].type === EXPECTED_PUBLIC_QUOTA.type &&
      quotas[0].class_name === EXPECTED_PUBLIC_QUOTA.class_name &&
      (quotas[0].script_name === undefined || quotas[0].script_name === BETA_WORKER),
    "JEV_PUBLIC_QUOTA is missing or does not match the beta configuration.",
  );
  // Inspect names/types only. Never read, copy, serialize or log secret values.
  for (const name of ["TYPESAFE_JEV_API_KEY", "JEV_PUBLIC_IP_HMAC_KEY"]) {
    const keys = bindings.filter(binding => binding?.name === name);
    requireCondition(
      keys.length === 1 && keys[0].type === "secret_text",
      `${name} secret metadata is missing or invalid.`,
    );
  }
}

export async function verifyBetaDeployment({ accountId, apiToken, targetSha, fetchImpl = fetch }) {
  requireCondition(/^[0-9a-f]{32}$/.test(accountId ?? ""), "Invalid Cloudflare account ID.");
  requireCondition(typeof apiToken === "string" && apiToken.length > 0, "Cloudflare API credential is missing.");
  requireCondition(SHA.test(targetSha ?? ""), "Invalid expected commit SHA.");
  const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${BETA_WORKER}`;

  async function get(path) {
    let response;
    try {
      response = await fetchImpl(`${base}${path}`, {
        method: "GET",
        headers: { Accept: "application/json", Authorization: `Bearer ${apiToken}` },
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new AcceptanceError("Cloudflare metadata request failed.");
    }
    // Error bodies and exception messages can contain credentials. Never print them.
    requireCondition(response.ok, "Cloudflare metadata request returned an unsuccessful status.");
    let envelope;
    try { envelope = await response.json(); }
    catch { throw new AcceptanceError("Cloudflare metadata response is not valid JSON."); }
    requireCondition(envelope?.success === true && envelope.result != null,
      "Cloudflare metadata response did not report success.");
    return envelope.result;
  }

  const path = "/deployments?per_page=1&page=1";
  const active = activeDeployment(await get(path));
  verifyVersion(await get(`/versions/${active.versionId}`), active.versionId, targetSha);
  const confirmed = activeDeployment(await get(path));
  requireCondition(
    confirmed.deploymentId === active.deploymentId && confirmed.versionId === active.versionId,
    "Active beta Worker deployment changed during verification.",
  );
  // Return only validated identifiers and fixed expectations, never the API payload.
  return { worker: BETA_WORKER, sha: targetSha, ...active, limiter: EXPECTED_LIMITER.name };
}

export async function runAcceptance({ env = process.env, fetchImpl = fetch, log = console.log, error = console.error } = {}) {
  try {
    const verified = await verifyBetaDeployment({
      accountId: env.CLOUDFLARE_ACCOUNT_ID,
      apiToken: env.CLOUDFLARE_API_TOKEN,
      targetSha: env.TARGET_SHA,
      fetchImpl,
    });
    log(`Verified ${verified.worker} commit ${verified.sha}, deployment ${verified.deploymentId}, version ${verified.versionId}: ${verified.limiter} and ${EXPECTED_PUBLIC_QUOTA.name} match; required secret metadata present.`);
    return 0;
  } catch (cause) {
    error(cause instanceof AcceptanceError ? cause.message : "Beta Worker deployment verification failed.");
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runAcceptance();
}
