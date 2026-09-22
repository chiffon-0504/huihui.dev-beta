import { askJev, type JevFormRequest, type JevMode, type JevResult } from "./services/jev";
import { ServiceError } from "./services/errors";
import { jevCopy } from "./locales/jev";
import "./styles/pages/jev.css";

type Row = { id: string; value: string };
let sequence = 0;
const row = (): Row => ({ id: `option_${++sequence}`, value: "" });
let locale: keyof typeof jevCopy = "zh-Hant";
let mode: JevMode = "noul";
let question = "";
const context: Row[] = [];
const criteria = [row(), row()];
const options = [row(), row()];
let busy = false;
const mount = document.querySelector<HTMLElement>("#jev-app");
if (!mount) throw new Error("Missing private tool mount.");
const app = mount;

function node<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className = ""): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag);
  result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
}
function button(text: string, action?: () => void, primary = false): HTMLButtonElement {
  const control = node("button", text, `button${primary ? " button--primary" : ""}`);
  control.type = "button";
  if (action) control.addEventListener("click", action);
  return control;
}

function render(): void {
  const copy = jevCopy[locale];
  document.documentElement.lang = locale;
  const skip = node("a", copy.skip, "skip-link"); skip.href = "#jev-question";
  const header = node("header", undefined, "jev-header");
  const home = node("a", "huihui.dev"); home.href = "/"; home.setAttribute("aria-label", copy.home);
  const languageLabel = node("label", copy.language);
  const language = node("select"); language.id = "jev-language"; languageLabel.htmlFor = language.id;
  for (const [value, label] of [["zh-Hant", "繁體中文"], ["en", "English"], ["ja", "日本語"]] as const) {
    const option = node("option", label); option.value = value; option.selected = value === locale; language.append(option);
  }
  language.addEventListener("change", () => { locale = language.value as keyof typeof jevCopy; render(); document.querySelector<HTMLElement>("#jev-language")?.focus(); });
  header.append(home, languageLabel, language);
  const main = node("main", undefined, "jev-main");
  const title = node("h1", "Personal Jev Console");
  const intro = node("p", copy.intro, "jev-muted");
  const form = node("form");
  // Private questions must not be retained in browser autofill history.
  form.autocomplete = "off";
  const controls = node("fieldset", undefined, "jev-controls");
  const modeGroup = node("fieldset", undefined, "jev-mode");
  modeGroup.append(node("legend", copy.mode));
  for (const value of ["noul", "score", "choice"] as const) {
    const label = node("label");
    const input = node("input"); input.type = "radio"; input.name = "mode"; input.value = value; input.checked = mode === value;
    input.addEventListener("change", () => { mode = value; render(); document.querySelector<HTMLInputElement>(`input[value="${value}"]`)?.focus(); });
    label.append(input, node("span", value[0]!.toUpperCase() + value.slice(1))); modeGroup.append(label);
  }
  const modeDescription = node("p", copy.modes[mode], "jev-muted");
  const questionLabel = node("label", copy.question); questionLabel.htmlFor = "jev-question";
  const questionInput = node("textarea"); questionInput.id = "jev-question"; questionInput.name = "question"; questionInput.rows = 4;
  questionInput.maxLength = 1000; questionInput.required = true; questionInput.value = question;
  questionInput.setAttribute("aria-describedby", "jev-question-hint");
  questionInput.addEventListener("input", () => { question = questionInput.value; });
  const hint = node("p", copy.questionHint, "jev-muted"); hint.id = "jev-question-hint";
  const result = node("section", undefined, "jev-result"); result.setAttribute("aria-labelledby", "jev-result-heading");
  const resultTitle = node("h2", copy.result); resultTitle.id = "jev-result-heading";
  const resultBody = node("div", copy.empty, "jev-result-body");
  result.append(resultTitle, resultBody);
  const status = node("p", "", "jev-status"); status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");

  function rows(values: Row[], kind: "context" | "criteria" | "options", max: number, addText: string): HTMLElement {
    const group = node("fieldset", undefined, "jev-list");
    group.append(node("legend", copy[kind]), node("p", copy[`${kind}Hint`], "jev-muted"));
    const list = node("div", undefined, "jev-rows");
    const add = button(addText, () => {
      if (values.length >= max) return;
      const item = row(); values.push(item); redraw(); document.getElementById(`${kind}-${item.id}`)?.focus();
    });
    function redraw(): void {
      list.replaceChildren();
      values.forEach((item, index) => {
        const wrap = node("div", undefined, "jev-row");
        const label = node("label", `${copy[kind]} ${kind === "criteria" ? index : index + 1}`);
        const input = node("textarea"); input.rows = 2; input.id = `${kind}-${item.id}`; input.name = input.id;
        input.maxLength = kind === "context" ? 500 : 300; input.required = true; input.value = item.value; label.htmlFor = input.id;
        input.addEventListener("input", () => { item.value = input.value; });
        const remove = button(copy.remove, () => {
          values.splice(index, 1); redraw();
          const target = values[Math.min(index, values.length - 1)];
          (target ? document.getElementById(`${kind}-${target.id}`) : add)?.focus();
        });
        remove.setAttribute("aria-label", `${copy.remove} ${label.textContent}`);
        const field = node("div"); field.append(label, input); wrap.append(field, remove); list.append(wrap);
      });
      add.disabled = values.length >= max;
    }
    redraw(); group.append(list, add); return group;
  }

  controls.append(modeGroup, modeDescription, questionLabel, questionInput, hint, rows(context, "context", 12, copy.addContext));
  if (mode === "score") controls.append(rows(criteria, "criteria", 10, copy.addCriterion));
  if (mode === "choice") controls.append(rows(options, "options", 12, copy.addOption));
  const submit = button(copy.ask, undefined, true); submit.type = "submit";
  const privacy = node("p", copy.privacy, "jev-privacy jev-muted");
  controls.append(submit, privacy);
  form.append(controls, status);
  const layout = node("div", undefined, "jev-layout"); layout.append(form, result);
  main.append(title, intro, layout);
  app.replaceChildren(skip, header, main);

  function showResult(value: JevResult, sent: JevFormRequest): void {
    resultBody.replaceChildren();
    const percent = (probability: number) => new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(probability);
    const probabilityRow = (label: string, probability: number, highest = false) => {
      const item = node("div", undefined, "jev-probability");
      const top = node("div", undefined, "jev-probability-label");
      top.append(node("span", label), node("strong", percent(probability)));
      const meter = node("progress"); meter.max = 1; meter.value = probability; meter.setAttribute("aria-label", `${label}: ${percent(probability)}`);
      item.append(top, meter);
      if (highest) item.append(node("small", copy.highest));
      resultBody.append(item);
    };
    if (value.mode === "noul") {
      probabilityRow(copy.yes, value.probability); probabilityRow(copy.no, 1 - value.probability);
    } else {
      if (value.mode === "score" && sent.mode === "score") {
        resultBody.append(node("p", `${copy.score}: ${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value.score)}`, "jev-score"));
        const low = Math.floor(value.score), high = Math.ceil(value.score);
        resultBody.append(node("p", `${copy.between}: ${low} · ${sent.criteria[low]}${low === high ? "" : ` — ${high} · ${sent.criteria[high]}`}`));
      }
      for (const item of value.distribution) {
        const label = sent.mode === "score" ? `${item.id} · ${sent.criteria[Number(item.id)]}` : sent.mode === "choice" ? sent.options.find(option => option.id === item.id)!.label : "";
        probabilityRow(label, item.probability, value.mode === "choice" && item.id === value.choice);
      }
      resultBody.append(node("p", `${copy.confidence}: ${percent(value.confidence)}`, "jev-muted"));
    }
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy) return;
    const common = { question: question.trim(), context: context.map(item => item.value.trim()) };
    const sent: JevFormRequest = mode === "noul" ? { ...common, mode } : mode === "score"
      ? { ...common, mode, criteria: criteria.map(item => item.value.trim()) }
      : { ...common, mode, options: options.map(item => ({ id: item.id, label: item.value.trim() })) };
    const items = sent.mode === "score" ? sent.criteria : sent.mode === "choice" ? sent.options.map(item => item.label) : null;
    if (!sent.question || sent.context.some(item => !item) || (items && (items.length < 2 || items.some(item => !item) || new Set(items).size !== items.length))
      || new TextEncoder().encode(JSON.stringify(sent)).byteLength > 16384) { status.textContent = copy.inputError; return; }
    busy = true; controls.disabled = true; language.disabled = true; status.textContent = copy.loading; result.setAttribute("aria-busy", "true");
    resultBody.textContent = copy.empty;
    try { showResult(await askJev(sent), sent); status.textContent = copy.ready; }
    catch (error) {
      status.textContent = error instanceof ServiceError
        ? error.status === 401 || error.status === 403 ? copy.authError : error.status === 429 ? copy.rateError
          : error.status === 400 || error.status === 413 || error.status === 415 ? copy.inputError
            : error.kind === "timeout" || error.status === 504 ? copy.timeoutError : copy.error
        : copy.error;
      if (error instanceof ServiceError && (error.kind === "network" || error.status === 401 || error.status === 403)) {
        const signIn = node("a", copy.signIn); signIn.href = "/tools/jev/";
        status.append(document.createTextNode(" "), signIn);
      }
    } finally { busy = false; controls.disabled = false; language.disabled = false; result.removeAttribute("aria-busy"); }
  });
}
render();
