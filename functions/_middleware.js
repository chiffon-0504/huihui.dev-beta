import { authorizeJev, boundedJson, deadline, jevError, privateFailure, privateHeaders, privateJson, requireJevOrigin } from "../workers/huihui-api/jev-security.js";

// _routes.json keeps public content on static Pages; every private alias is gated.
export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  try {
    requireJevOrigin(request, env);
    if (url.pathname === "/api/jev") {
      if (request.method !== "POST") throw jevError("invalid_request", 405);
      if (typeof env.JEV_API?.fetch !== "function") throw jevError("unavailable", 503);
      // The bound Worker independently verifies the original JWT and Origin.
      // Do not forward cookies or arbitrary client headers to another service.
      const headers = new Headers();
      for (const name of ["Cf-Access-Jwt-Assertion", "Origin", "Content-Type", "Content-Length", "Sec-Fetch-Site"]) {
        if (request.headers.has(name)) headers.set(name, request.headers.get(name));
      }
      return await deadline(22000, async signal => {
        const response = await env.JEV_API.fetch(new Request(request, { headers, signal, redirect: "error" }));
        // Finish the bounded body before closing the service request's signal.
        let body;
        try { body = await boundedJson(response, 16384, signal); }
        catch { throw jevError("invalid_response", 502); }
        return privateJson(body, response.status);
      });
    }
    if (!["/tools/jev", "/tools/jev/", "/tools/jev/index.html"].includes(url.pathname)) throw jevError("not_found", 404);
    if (!["GET", "HEAD"].includes(request.method)) throw jevError("invalid_request", 405);
    await authorizeJev(request, env);
    const upstream = await next();
    const response = new Response(upstream.body, upstream);
    for (const [name, value] of Object.entries(privateHeaders())) response.headers.set(name, value);
    return response;
  } catch (error) { return privateFailure(error); }
}
