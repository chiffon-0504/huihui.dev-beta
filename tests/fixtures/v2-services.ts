import { requestJson, type JsonValidator } from "../../v2/src/services/client";
import { resolveApiEndpoint } from "../../v2/src/services/endpoints";

interface Health { ok: boolean }
const isHealth: JsonValidator<Health> = (value): value is Health =>
  typeof value === "object" && value !== null && "ok" in value && typeof value.ok === "boolean";

export const health: Promise<Health> = requestJson("beta", "/api/health", isHealth);
// @ts-expect-error A caller cannot claim a different result type than its guard.
export const wrongResult: Promise<string> = requestJson("beta", "/api/health", isHealth);
// @ts-expect-error Parsed JSON needs a runtime guard, not just a generic assertion.
requestJson<Health>("beta", "/api/health");
// @ts-expect-error Third-party URLs cannot select an API environment.
resolveApiEndpoint("https://api.github.com", "/api/health");
// @ts-expect-error Raw JSON is unknown until the guard validates it.
export const unsafeGuard: JsonValidator<Health> = (value): value is Health => value.ok === true;
// @ts-expect-error Arbitrary fetch options cannot enable credentials.
requestJson("beta", "/api/health", isHealth, { credentials: "include" });
