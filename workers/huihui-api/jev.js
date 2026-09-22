import { authorizeJev, boundedJson, deadline, jevError, privateFailure, privateJson, requireJevOrigin } from "./jev-security.js";

export const JEV_LIMITS = Object.freeze({ body: 16384, question: 1000, contextCount: 12, contextItem: 500, criteriaCount: 10, optionCount: 12, label: 300 });
export const JEV_TIMEOUT_MS = 10000;
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
const assert = condition => { if (!condition) throw jevError("invalid_request", 400); };
function text(value, limit) {
  assert(typeof value === "string" && value.length <= limit && value.trim().length > 0);
  return value.trim();
}
function exact(value, keys) {
  assert(record(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)));
}

export function validateJevForm(value) {
  assert(record(value) && ["noul", "score", "choice"].includes(value.mode));
  exact(value, ["mode", "question", "context", ...(value.mode === "score" ? ["criteria"] : value.mode === "choice" ? ["options"] : [])]);
  assert(Array.isArray(value.context) && value.context.length <= JEV_LIMITS.contextCount);
  const form = { mode: value.mode, question: text(value.question, JEV_LIMITS.question), context: value.context.map(item => text(item, JEV_LIMITS.contextItem)) };
  if (value.mode === "score") {
    assert(Array.isArray(value.criteria) && value.criteria.length >= 2 && value.criteria.length <= JEV_LIMITS.criteriaCount);
    form.criteria = value.criteria.map(item => text(item, JEV_LIMITS.label));
    assert(new Set(form.criteria).size === form.criteria.length);
  }
  if (value.mode === "choice") {
    assert(Array.isArray(value.options) && value.options.length >= 2 && value.options.length <= JEV_LIMITS.optionCount);
    form.options = value.options.map(item => {
      exact(item, ["id", "label"]);
      assert(typeof item.id === "string" && /^option_[1-9]\d{0,5}$/.test(item.id));
      return { id: item.id, label: text(item.label, JEV_LIMITS.label) };
    });
    assert(new Set(form.options.map(item => item.id)).size === form.options.length);
    assert(new Set(form.options.map(item => item.label)).size === form.options.length);
  }
  return form;
}

export function toJevPayload(form) {
  const question = { type: form.mode, instructions: form.question };
  if (form.mode === "score") question.criteria = form.criteria;
  if (form.mode === "choice") question.criteria = Object.fromEntries(form.options.map(item => [item.id, item.label]));
  return { model: "jev-latest", state: { context: form.context }, questions: { decision: question } };
}

export function normalizeJevResponse(value, form) {
  const invalid = () => { throw jevError("invalid_response", 502); };
  const probability = value => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
  const answer = value?.answers?.decision;
  if (!record(answer) || answer.type !== form.mode) return invalid();
  if (form.mode === "noul") {
    if (!probability(answer.noul)) return invalid();
    return { mode: "noul", probability: answer.noul };
  }
  const ids = form.mode === "score" ? form.criteria.map((_, i) => String(i)) : form.options.map(item => item.id);
  const probabilities = answer.probabilities;
  if (!record(probabilities) || Object.keys(probabilities).length !== ids.length
    || !ids.every(id => Object.hasOwn(probabilities, id) && probability(probabilities[id]))
    || Math.abs(ids.reduce((sum, id) => sum + probabilities[id], 0) - 1) > 0.001
    || !probability(answer.confidence)) return invalid();
  const distribution = ids.map(id => ({ id, probability: probabilities[id] }));
  if (form.mode === "score") {
    if (!Number.isFinite(answer.score) || answer.score < 0 || answer.score > ids.length - 1
      || !record(answer.legend) || Object.keys(answer.legend).length !== ids.length
      || !ids.every((id, i) => answer.legend[id] === form.criteria[i])
      || Math.abs(answer.score - ids.reduce((sum, id) => sum + Number(id) * probabilities[id], 0)) > 0.02) return invalid();
    return { mode: "score", score: answer.score, confidence: answer.confidence, distribution };
  }
  if (!ids.includes(answer.choice) || probabilities[answer.choice] !== Math.max(...ids.map(id => probabilities[id]))) return invalid();
  return { mode: "choice", choice: answer.choice, confidence: answer.confidence, distribution };
}

export async function handleJev(request, env) {
  try {
    if (env.WORKER_ENV !== "beta") throw jevError("unavailable", 503);
    requireJevOrigin(request, env);
    if (request.method !== "POST") return new Response(null, { status: 405, headers: { ...Object.fromEntries(privateJson({}).headers), Allow: "POST" } });
    const url = new URL(request.url);
    if (url.pathname !== "/api/jev" || url.search) throw jevError("invalid_request", 400);
    if (request.headers.get("Origin") !== env.JEV_SITE_ORIGIN
      || ![null, "same-origin"].includes(request.headers.get("Sec-Fetch-Site"))) throw jevError("forbidden", 403);
    const identity = await authorizeJev(request, env);
    if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw jevError("invalid_request", 415);
    const form = validateJevForm(await deadline(5000, signal => boundedJson(request, JEV_LIMITS.body, signal)));
    if (typeof env.TYPESAFE_JEV_API_KEY !== "string" || !env.TYPESAFE_JEV_API_KEY.trim()
      || typeof env.JEV_RATE_LIMITER?.limit !== "function") throw jevError("unavailable", 503);
    let allowed;
    try { allowed = await deadline(2000, () => env.JEV_RATE_LIMITER.limit({ key: `jev:${identity.subject}` })); }
    catch { throw jevError("unavailable", 503); }
    if (allowed?.success === false) throw jevError("rate_limited", 429);
    if (allowed?.success !== true) throw jevError("unavailable", 503);
    const result = await deadline(JEV_TIMEOUT_MS, async signal => {
      let response;
      try {
        response = await fetch("https://api.typesafe.ai/v1/systemone", {
          method: "POST", redirect: "error", signal,
          headers: { Authorization: `Bearer ${env.TYPESAFE_JEV_API_KEY}`, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(toJevPayload(form)),
        });
      } catch { throw jevError("upstream_unavailable", 502); }
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        throw jevError("upstream_unavailable", 502);
      }
      try { return normalizeJevResponse(await boundedJson(response, 32768, signal), form); }
      catch { throw jevError("invalid_response", 502); }
    });
    return privateJson({ ok: true, result });
  } catch (error) { return privateFailure(error); }
}
