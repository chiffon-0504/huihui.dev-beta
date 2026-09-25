import { requestJson } from "./client";
import type { ApiEnvironment } from "./endpoints";

export const systemStatusValues = ["operational", "degraded_performance", "partial_outage", "major_outage", "unknown"] as const;
export type SystemStatusValue = (typeof systemStatusValues)[number];
type ComponentId = "website" | "api" | "contact";
export interface SystemStatus {
  readonly ok: true;
  readonly status: SystemStatusValue;
  readonly checkedAt: string;
  readonly components: readonly { readonly id: ComponentId; readonly status: SystemStatusValue }[];
}
export type SystemStatusState = { readonly state: "loading" | "unknown" } | { readonly state: "ready"; readonly data: SystemStatus };
const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const statusValue = (value: unknown): value is SystemStatusValue => systemStatusValues.some((status) => status === value);

export function isSystemStatus(value: unknown): value is SystemStatus {
  if (!object(value) || value.ok !== true || !statusValue(value.status) ||
    typeof value.checkedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.checkedAt) ||
    !Number.isFinite(Date.parse(value.checkedAt)) || new Date(value.checkedAt).toISOString() !== value.checkedAt ||
    !Array.isArray(value.components) || value.components.length < 2 || value.components.length > 3) return false;
  const ids = new Set<string>();
  for (const component of value.components) {
    if (!object(component) || typeof component.id !== "string" ||
      !["website", "api", "contact"].includes(component.id) || ids.has(component.id) || !statusValue(component.status)) return false;
    ids.add(component.id);
  }
  // Overall health belongs to the API (including Contact), not the two visible rows.
  return ids.has("website") && ids.has("api");
}

/** A surface owns one request generation. Closing or superseding it cancels all pending work. */
export function createSystemStatusClient(environment: ApiEnvironment, render: (state: SystemStatusState) => void) {
  let active: AbortController | undefined;
  let generation = 0;
  const cancel = () => { generation++; active?.abort(); active = undefined; };
  const refresh = async () => {
    cancel();
    const current = generation;
    const controller = new AbortController();
    active = controller;
    render({ state: "loading" });
    try {
      const data = await requestJson(environment, "/api/system-status", isSystemStatus, { signal: controller.signal, timeoutMs: 6000 });
      if (current === generation) render({ state: "ready", data });
    } catch {
      if (current === generation) render({ state: "unknown" });
    } finally {
      if (active === controller) active = undefined;
    }
  };
  return { refresh, cancel };
}
