import { element } from "../dom";
import { createImage } from "./media";
import { fileSizeLabel, validateHighResolution } from "../media/high-resolution";
import type { ImageOptions } from "../media/types";
import type { ViewerContent } from "../locales/types";

export function createImageViewer(images: readonly ImageOptions[], copy: ViewerContent) {
  const dialog = element("dialog", "image-viewer");
  dialog.setAttribute("aria-label", copy.title);
  const close = element("button", "button", copy.close);
  close.type = "button";
  close.autofocus = true;
  const previous = element("button", "button", copy.previous);
  const next = element("button", "button", copy.next);
  const load = element("button", "button viewer-load");
  for (const button of [previous, next, load]) button.type = "button";
  const controls = element("div", "viewer-controls");
  controls.append(close, previous, next, load);
  const stage = element("div", "viewer-stage");
  const status = element("p", "viewer-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  dialog.append(controls, stage, status);
  let index = 0;
  let generation = 0;
  let returnFocus: HTMLElement | undefined;
  let pending: HTMLImageElement | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let state: "preview" | "loading" | "loaded" | "error" = "preview";

  function invalidate() {
    generation++;
    clearTimeout(timeout);
    pending?.removeAttribute("src");
    pending = undefined;
  }

  function show(selected: number) {
    invalidate();
    index = (selected + images.length) % images.length;
    state = "preview";
    const image = images[index]!;
    stage.replaceChildren(createImage({ ...image, loading: "eager", sizes: "(max-width: 50rem) calc(100vw - 4rem), 48rem" }));
    stage.dataset.mode = "preview";
    stage.setAttribute("aria-busy", "false");
    const high = image.asset.highResolution;
    load.hidden = !high;
    load.removeAttribute("aria-disabled");
    if (high) {
      validateHighResolution(high, image.asset.id ?? "");
      load.textContent = `${copy.load} · ${fileSizeLabel(high.bytes)}`;
    }
    status.textContent = image.alt;
  }

  function finishClose() {
    if (dialog.open) return; // Ignore a queued close event after a new open.
    invalidate();
    stage.replaceChildren();
    returnFocus?.focus();
  }
  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", finishClose);
  dialog.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const buttons = [close, previous, next, load].filter((button) => !button.hidden);
    const first = buttons[0]!;
    const last = buttons[buttons.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  // Native modal dialog supplies Escape and focus containment, including loading failures.
  previous.addEventListener("click", () => show(index - 1));
  next.addEventListener("click", () => show(index + 1));
  load.addEventListener("click", () => {
    if (state !== "preview" || !dialog.open) return;
    const options = images[index]!;
    if (!options.asset.highResolution) return;
    const high = validateHighResolution(options.asset.highResolution, options.asset.id ?? "");
    const current = ++generation;
    state = "loading";
    load.setAttribute("aria-disabled", "true");
    status.textContent = copy.loading;
    stage.setAttribute("aria-busy", "true");
    const image = element("img", "media-image");
    image.alt = options.alt;
    image.width = high.width;
    image.height = high.height;
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    pending = image;
    const stillCurrent = () => current === generation && dialog.open;
    const fail = () => {
      if (!stillCurrent()) return;
      invalidate();
      state = "error";
      stage.setAttribute("aria-busy", "false");
      status.textContent = copy.error;
      // Keep the action disabled and focusable: same-URL image failures may be cached.
      // Selecting an image starts a new preview; this failed view offers no retry.
    };
    // Bound a stalled download without retrying. Closing never waits on it.
    timeout = setTimeout(fail, 60_000);
    // This is the only assignment of an R2 URL, inside the explicit click handler.
    image.src = high.url;
    void image.decode().then(() => {
      if (!stillCurrent()) return;
      if (image.naturalWidth !== high.width || image.naturalHeight !== high.height) { fail(); return; }
      clearTimeout(timeout);
      pending = undefined;
      stage.replaceChildren(image);
      stage.dataset.mode = "high-resolution";
      stage.setAttribute("aria-busy", "false");
      state = "loaded";
      status.textContent = copy.loaded;
    }).catch(fail);
  });

  return { dialog, open(selected: number, trigger: HTMLElement) {
    returnFocus = trigger;
    show(selected);
    dialog.showModal();
    close.focus();
  } };
}
