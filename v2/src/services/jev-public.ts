import { ServiceError } from "./errors";

export type PublicJevReply =
  | { ok: true; probability: number; remaining: number; resetAt: number }
  | { ok: false; error: "rate_limited" | "busy"; remaining: number; resetAt: number | null };

export const questionLength = (question: string): number => Array.from(question).length;
export const validPublicQuestion = (question: string): boolean => !!question.trim()
  && questionLength(question) <= 99 && !/[\uD800-\uDFFF]/u.test(question);

export function isPublicJevReply(value: unknown): value is PublicJevReply {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  if (!Number.isInteger(data.remaining) || Number(data.remaining) < 0 || Number(data.remaining) > 3) return false;
  const reset = Number.isSafeInteger(data.resetAt) && Number(data.resetAt) > 0;
  if (data.ok === true) return typeof data.probability === "number" && Number.isFinite(data.probability)
    && data.probability >= 0 && data.probability <= 1 && Number(data.remaining) <= 2 && reset;
  return data.ok === false && (data.error === "rate_limited" ? data.remaining === 0 && reset
    : data.error === "busy" && Number(data.remaining) > 0 && (reset || data.resetAt === null));
}

// Independent of the private Access client: no cookies, keys or provider options.
export async function askPublicJev(question: string, signal: AbortSignal): Promise<PublicJevReply> {
  if (!validPublicQuestion(question)) throw new ServiceError("invalid_data");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: () => void = () => {};
  const interrupted = new Promise<never>((_, reject) => {
    cancel = () => { reject(new ServiceError("aborted")); controller.abort(); };
    if (signal.aborted) cancel();
    else signal.addEventListener("abort", cancel, { once: true });
    timer = setTimeout(() => { reject(new ServiceError("timeout")); controller.abort(); }, 25000);
  });
  try {
    if (signal.aborted) return await interrupted;
    return await Promise.race([interrupted, (async () => {
      const response = await fetch("/api/jev-public", {
        method: "POST", mode: "same-origin", credentials: "omit", redirect: "error", cache: "no-store", referrerPolicy: "no-referrer",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ question }), signal: controller.signal,
      });
      if (response.status !== 200 && response.status !== 429) {
        void response.body?.cancel().catch(() => {});
        throw new ServiceError("http", response.status);
      }
      if (!response.body) throw new ServiceError("invalid_data");
      const reader = response.body.getReader();
      const abortBody = () => { void reader.cancel().catch(() => {}); };
      controller.signal.addEventListener("abort", abortBody, { once: true });
      let content = "", bytes = 0;
      const decoder = new TextDecoder("utf-8", { fatal: true });
      try {
        while (true) {
          if (controller.signal.aborted) throw new ServiceError("aborted");
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 1024) throw new ServiceError("invalid_data");
          content += decoder.decode(value, { stream: true });
        }
        content += decoder.decode();
      } finally { controller.signal.removeEventListener("abort", abortBody); abortBody(); }
      const data: unknown = JSON.parse(content);
      if (!isPublicJevReply(data) || data.ok !== (response.status === 200)) throw new ServiceError("invalid_data");
      return data;
    })()]);
  } catch (error) { throw error instanceof ServiceError ? error : new ServiceError("network"); }
  finally { clearTimeout(timer); signal.removeEventListener("abort", cancel); controller.abort(); }
}
