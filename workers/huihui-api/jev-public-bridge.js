import { boundedJson, deadline, jevError, privateFailure, privateJson } from "./jev-security.js";
import { PUBLIC_JEV_BODY_LIMIT, publicJevQuestion, publicJevResponse, requirePublicJevRequest } from "./jev-public-policy.js";

export async function bridgePublicJev(request, env) {
  try {
    requirePublicJevRequest(request);
    if (typeof env.JEV_API?.fetch !== "function") throw jevError("unavailable", 503);
    const question = publicJevQuestion(await deadline(5000, signal => boundedJson(request, PUBLIC_JEV_BODY_LIMIT, signal)));
    const headers = new Headers({ "Content-Type": "application/json" });
    for (const name of ["Origin", "Sec-Fetch-Site", "CF-Connecting-IP", "CF-Connecting-IPv6"]) {
      if (request.headers.has(name)) headers.set(name, request.headers.get(name));
    }
    return await deadline(22000, async signal => {
      const response = await env.JEV_API.fetch(new Request(request.url, {
        method: "POST", headers, body: JSON.stringify({ question }), signal, redirect: "manual",
      }));
      if (response.status >= 300 && response.status < 400) {
        void response.body?.cancel().catch(() => {});
        throw jevError("invalid_response", 502);
      }
      let body;
      try { body = await boundedJson(response, 1024, signal); }
      catch { throw jevError("invalid_response", 502); }
      const result = privateJson(publicJevResponse(body, response.status), response.status);
      const retry = response.headers.get("Retry-After");
      if (response.status === 429 && /^\d{1,5}$/.test(retry ?? "") && Number(retry) >= 1 && Number(retry) <= 86400) result.headers.set("Retry-After", retry);
      return result;
    });
  } catch (error) { return privateFailure(error); }
}
