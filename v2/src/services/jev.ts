import { ServiceError } from "./errors";

export type JevMode = "noul" | "score" | "choice";
type Common = { question: string; context: string[] };
export type JevFormRequest = Common & (
  | { mode: "noul" }
  | { mode: "score"; criteria: string[] }
  | { mode: "choice"; options: Array<{ id: string; label: string }> }
);
type Distribution = Array<{ id: string; probability: number }>;
export type JevResult =
  | { mode: "noul"; probability: number }
  | { mode: "score"; score: number; confidence: number; distribution: Distribution }
  | { mode: "choice"; choice: string; confidence: number; distribution: Distribution };

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const probability = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;

export function isJevResult(value: unknown, form: JevFormRequest): value is JevResult {
  if (!record(value) || value.mode !== form.mode) return false;
  if (value.mode === "noul") return probability(value.probability);
  if (!probability(value.confidence) || !Array.isArray(value.distribution)) return false;
  const ids = form.mode === "score" ? form.criteria.map((_, index) => String(index)) : form.mode === "choice" ? form.options.map(item => item.id) : [];
  const items = value.distribution;
  if (items.length !== ids.length || !items.every((item: unknown, i: number) => record(item) && item.id === ids[i] && probability(item.probability))) return false;
  if (Math.abs(items.reduce((sum: number, item: { probability: number }) => sum + item.probability, 0) - 1) > 0.001) return false;
  if (value.mode === "score") return typeof value.score === "number" && Number.isFinite(value.score) && value.score >= 0 && value.score <= ids.length - 1;
  return typeof value.choice === "string" && ids.includes(value.choice)
    && items.find((item: { id: string }) => item.id === value.choice)?.probability === Math.max(...items.map((item: { probability: number }) => item.probability));
}

// This private adapter deliberately does not widen the public GET transport.
// Relative URL + same-origin cookies keep the Access session on the page host.
export async function askJev(form: JevFormRequest): Promise<JevResult> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { reject(new ServiceError("timeout")); controller.abort(); }, 25000);
  });
  try {
    return await Promise.race([timeout, (async () => {
      const response = await fetch("/api/jev", {
        method: "POST", mode: "same-origin", credentials: "same-origin", redirect: "error", cache: "no-store", referrerPolicy: "no-referrer",
        headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(form), signal: controller.signal,
      });
      if (!response.ok) throw new ServiceError("http", response.status);
      if (!response.body) throw new ServiceError("invalid_data");
      const reader = response.body.getReader();
      const cancel = () => { void reader.cancel().catch(() => {}); };
      controller.signal.addEventListener("abort", cancel, { once: true });
      let content = "", bytes = 0;
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 16384) throw new ServiceError("invalid_data");
          content += decoder.decode(value, { stream: true });
        }
        content += decoder.decode();
      } finally { controller.signal.removeEventListener("abort", cancel); cancel(); }
      let data: unknown;
      try { data = JSON.parse(content); } catch { throw new ServiceError("invalid_json"); }
      if (!record(data) || data.ok !== true || !isJevResult(data.result, form)) throw new ServiceError("invalid_data");
      return data.result;
    })()]);
  } catch (error) { throw error instanceof ServiceError ? error : new ServiceError("network"); }
  finally { clearTimeout(timer); controller.abort(); }
}
