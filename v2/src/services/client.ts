import { resolveApiEndpoint, type ApiEnvironment } from "./endpoints";
import { ServiceError } from "./errors";

export interface JsonRequestOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

export type JsonValidator<T> = (value: unknown) => value is T;

// Nothing runs at module load. Future feature adapters own paths, data guards
// and the explicit environment choice; this transport owns request failures.
export async function requestJson<T>(
  environment: ApiEnvironment,
  path: string,
  validate: JsonValidator<T>,
  options: JsonRequestOptions = {},
): Promise<T> {
  const endpoint = resolveApiEndpoint(environment, path);
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647 || typeof validate !== "function") {
    throw new ServiceError("configuration");
  }
  const signal = options.signal;
  if (signal?.aborted) throw new ServiceError("aborted");

  const controller = new AbortController();
  let cancellation: ServiceError | undefined;
  let rejectCancellation: (error: ServiceError) => void = () => {};
  const cancelled = new Promise<never>((_, reject) => { rejectCancellation = reject; });
  const cancel = (kind: "aborted" | "timeout") => {
    if (cancellation) return;
    cancellation = new ServiceError(kind);
    rejectCancellation(cancellation);
    controller.abort();
  };
  const onAbort = () => cancel("aborted");
  signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => cancel("timeout"), timeoutMs);

  try {
    const response = await Promise.race([
      fetch(endpoint, {
        method: "GET",
        headers: { Accept: "application/json" },
        credentials: "omit",
        mode: "cors",
        redirect: "error",
        referrerPolicy: "no-referrer",
        cache: "no-store",
        signal: controller.signal,
      }),
      cancelled,
    ]);
    if (!response.ok) {
      // Abort unused error bodies without reading or exposing their content.
      controller.abort();
      throw new ServiceError("http", response.status);
    }
    // Body transport failures are network errors, distinct from JSON syntax.
    const text = await Promise.race([response.text(), cancelled]);
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new ServiceError("invalid_json");
    }
    try {
      if (!validate(data)) throw new ServiceError("invalid_data");
    } catch {
      throw new ServiceError("invalid_data");
    }
    if (cancellation) throw cancellation;
    return data;
  } catch (error) {
    if (cancellation) throw cancellation;
    if (error instanceof ServiceError) throw error;
    throw new ServiceError("network");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}
