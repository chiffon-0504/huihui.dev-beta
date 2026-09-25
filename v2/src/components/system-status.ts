import { element } from "../dom";
import type { HomeContent } from "../locales/types";
import type { ApiEnvironment } from "../services/endpoints";
import { createSystemStatusClient, type SystemStatusValue } from "../services/system-status";

export function createSystemStatus(copy: HomeContent, environment: ApiEnvironment) {
  const node = element("div", "");
  node.setAttribute("role", "status");
  node.setAttribute("aria-live", "polite");
  node.setAttribute("aria-atomic", "true");
  const summary = element("p", "");
  const services = element("dl", "desktop-services");
  const rows = { website: element("dd", ""), api: element("dd", "") };
  for (const id of ["website", "api"] as const) {
    rows[id].dataset.component = id;
    services.append(element("dt", "", id === "website" ? copy.website : "API"), rows[id]);
  }
  node.append(summary, services);
  const show = (target: HTMLElement, status: SystemStatusValue, text: string) => {
    target.dataset.status = status;
    const dot = element("span", "status-dot", "● ");
    dot.setAttribute("aria-hidden", "true");
    dot.dataset.tone = status === "operational" ? "good" : status === "major_outage" ? "error" : status === "unknown" ? "unknown" : "warning";
    target.replaceChildren(dot, document.createTextNode(text));
  };
  const client = createSystemStatusClient(environment, (result) => {
    node.dataset.state = result.state;
    node.setAttribute("aria-busy", String(result.state === "loading"));
    const overall = result.state === "ready" ? result.data.status : "unknown";
    show(summary, overall, result.state === "loading" ? copy.statusLoading :
      overall === "operational" ? copy.statusHealthy : copy.statusLabels[overall]);
    for (const id of ["website", "api"] as const) {
      const status = result.state === "ready" ? result.data.components.find((component) => component.id === id)!.status : "unknown";
      show(rows[id], status, result.state === "loading" ? copy.statusLoading : copy.statusLabels[status]);
    }
  });
  return { node, ...client };
}
