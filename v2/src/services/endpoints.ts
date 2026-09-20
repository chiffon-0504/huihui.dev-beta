import { ServiceError } from "./errors";

export type ApiEnvironment = "beta" | "production";

// Public Worker origins; no hostname inference or arbitrary origin override.
export function resolveApiOrigin(environment: ApiEnvironment): string {
  switch (environment) {
    case "beta": return "https://huihui-api-beta.huihuigames01.workers.dev";
    case "production": return "https://api.huihui.dev";
    default: throw new ServiceError("configuration");
  }
}

export function resolveApiEndpoint(environment: ApiEnvironment, path: string): string {
  // Only canonical API paths. Reject absolute URLs, traversal, escapes, query
  // strings and fragments before URL normalization can hide malformed input.
  if (typeof path !== "string" || !/^\/api\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/.test(path)) {
    throw new ServiceError("configuration");
  }
  return resolveApiOrigin(environment) + path;
}
