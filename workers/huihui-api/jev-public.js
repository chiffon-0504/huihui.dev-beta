import { boundedJson, deadline, jevError, privateFailure } from "./jev-security.js";
import { PUBLIC_JEV_BODY_LIMIT, publicJevIdentity, publicJevQuestion, requirePublicJevRequest } from "./jev-public-policy.js";

export async function handlePublicJev(request, env) {
  try {
    if (env.WORKER_ENV !== "beta" || typeof env.JEV_PUBLIC_QUOTA?.getByName !== "function"
      || typeof env.TYPESAFE_JEV_API_KEY !== "string" || !env.TYPESAFE_JEV_API_KEY.trim()) throw jevError("unavailable", 503);
    requirePublicJevRequest(request);
    const question = publicJevQuestion(await deadline(5000, signal => boundedJson(request, PUBLIC_JEV_BODY_LIMIT, signal)));
    const identity = await publicJevIdentity(request, env.JEV_PUBLIC_IP_HMAC_KEY);
    // No raw IP, auth headers or client configuration cross the storage boundary.
    return await env.JEV_PUBLIC_QUOTA.getByName(identity).ask(question);
  } catch (error) { return privateFailure(error); }
}
