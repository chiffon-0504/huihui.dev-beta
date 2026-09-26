import { element } from "../dom";
import type { PublicJevContent } from "../locales/types";
import { askPublicJev, questionLength, validPublicQuestion } from "../services/jev-public";
import { ServiceError } from "../services/errors";

export function createPublicJev(copy: PublicJevContent) {
  const node = element("form", "jev-public");
  node.noValidate = true;
  node.autocomplete = "off";
  const label = element("label", "", copy.question);
  label.htmlFor = "jev-public-question";
  const input = element("textarea", "");
  input.id = label.htmlFor;
  input.rows = 1;
  input.required = true;
  input.autocomplete = "off";
  input.setAttribute("aria-describedby", "jev-public-counter");
  const counter = element("span", "desktop-muted", "0 / 99");
  counter.id = "jev-public-counter";
  const submit = element("button", "button", copy.submit);
  submit.type = "submit";
  const status = element("div", "");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  const result = element("p", "");
  const remaining = element("p", "desktop-muted");
  node.append(label, input, counter, submit, status);
  node.dataset.state = "idle";
  let pending: AbortController | undefined;
  const show = (state: string, text: string) => {
    node.dataset.state = state;
    result.textContent = text;
    if (!result.parentNode) status.prepend(result);
  };
  input.addEventListener("input", () => {
    counter.textContent = `${questionLength(input.value)} / 99`;
    input.setAttribute("aria-invalid", String(!validPublicQuestion(input.value)));
  });
  node.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (pending) return;
    if (!validPublicQuestion(input.value)) {
      input.setAttribute("aria-invalid", "true");
      show("invalid", copy.invalid);
      return;
    }
    const current = new AbortController();
    pending = current;
    // aria-disabled preserves the focused button; the guard prevents duplicates.
    submit.setAttribute("aria-disabled", "true");
    input.readOnly = true;
    input.setAttribute("aria-invalid", "false");
    show("loading", copy.loading);
    try {
      const reply = await askPublicJev(input.value, current.signal);
      if (pending !== current) return;
      remaining.textContent = `${copy.remaining} ${reply.remaining} / 3`;
      status.append(remaining);
      if (reply.ok) {
        const yes = reply.probability >= 0.5;
        show(yes ? "yes" : "no", `${yes ? "YES" : "NO"} ${Math.round((yes ? reply.probability : 1 - reply.probability) * 100)}%`);
      } else show(reply.error, reply.error === "busy" ? copy.busy : copy.limited);
    } catch (error) {
      if (pending !== current) return;
      const invalid = error instanceof ServiceError && [400, 413, 415].includes(error.status ?? 0);
      if (invalid) input.setAttribute("aria-invalid", "true");
      else remaining.remove();
      show(invalid ? "invalid" : "unavailable", invalid ? copy.invalid : copy.unavailable);
    } finally {
      if (pending === current) {
        pending = undefined;
        submit.removeAttribute("aria-disabled");
        input.readOnly = false;
      }
    }
  });
  return {
    node,
    cancel() {
      const active = pending;
      pending = undefined;
      active?.abort();
      submit.removeAttribute("aria-disabled");
      input.readOnly = false;
      if (active) {
        remaining.remove();
        show("unavailable", copy.unavailable);
      }
    },
  };
}
