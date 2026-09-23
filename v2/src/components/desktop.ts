import { element } from "../dom";

export interface DesktopWindow {
  readonly node: HTMLElement;
  readonly titleBar: HTMLElement;
  readonly content: HTMLElement;
  readonly close: HTMLButtonElement;
  readonly start: { readonly x: number; readonly y: number };
  readonly onClose?: () => void;
}

export function createWindow(id: string, title: string, closeLabel: string,
  start: DesktopWindow["start"], onClose?: () => void): DesktopWindow {
  const node = element("section", "desktop-window");
  node.id = id;
  node.tabIndex = -1;
  node.setAttribute("aria-labelledby", `${id}-title`);
  const titleBar = element("div", "window-titlebar");
  const heading = element("h2", "", title);
  heading.id = `${id}-title`;
  const close = element("button", "window-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", `${closeLabel}: ${title}`);
  titleBar.append(heading, close);
  const content = element("div", "window-content");
  node.append(titleBar, content);
  return { node, titleBar, content, close, start, ...(onClose ? { onClose } : {}) };
}

/** One manager owns pointer capture, bounded positions and a finite stacking order. */
export function createDesktop(windows: readonly DesktopWindow[]) {
  const node = element("div", "desktop");
  // Match the existing page-layout breakpoint in home.css.
  const compact = matchMedia("(max-width: 40rem)");
  const events = new AbortController();
  const order = [...windows];
  const positions = new Map<DesktopWindow, { x: number; y: number }>();
  let drag: { window: DesktopWindow; pointerId: number; dx: number; dy: number } | undefined;
  const restack = () => order.forEach((item, index) => { item.node.style.zIndex = String(index + 1); });
  const raise = (item: DesktopWindow) => {
    const index = order.indexOf(item);
    if (index < 0) return;
    order.splice(index, 1);
    order.push(item);
    restack();
  };
  const place = (item: DesktopWindow, point: { x: number; y: number }) => {
    const x = Math.max(0, Math.min(point.x, node.clientWidth - item.node.offsetWidth));
    const y = Math.max(0, Math.min(point.y, node.clientHeight - item.node.offsetHeight));
    item.node.style.left = `${x}px`;
    item.node.style.top = `${y}px`;
    return { x, y };
  };
  const endDrag = () => {
    if (!drag) return;
    const { window: item, pointerId } = drag;
    drag = undefined;
    item.node.classList.remove("is-dragging");
    if (item.titleBar.hasPointerCapture(pointerId)) item.titleBar.releasePointerCapture(pointerId);
  };
  const layout = () => {
    endDrag();
    for (const item of order) {
      if (compact.matches) {
        item.node.style.removeProperty("left");
        item.node.style.removeProperty("top");
      } else {
        const saved = positions.get(item);
        const point = place(item, saved ?? {
          x: item.start.x * (node.clientWidth - item.node.offsetWidth),
          y: item.start.y * (node.clientHeight - item.node.offsetHeight),
        });
        if (saved) positions.set(item, point);
      }
    }
  };
  const observer = new ResizeObserver(layout);
  for (const item of windows) {
    node.append(item.node);
    observer.observe(item.node);
    item.node.addEventListener("pointerdown", () => raise(item), { signal: events.signal });
    item.node.addEventListener("focusin", () => raise(item), { signal: events.signal });
    item.titleBar.addEventListener("pointerdown", (event) => {
      if (compact.matches || drag || !event.isPrimary || event.button !== 0 ||
        (event.target instanceof Element && event.target.closest("button"))) return;
      event.preventDefault();
      const rect = item.node.getBoundingClientRect();
      drag = { window: item, pointerId: event.pointerId, dx: event.clientX - rect.left, dy: event.clientY - rect.top };
      item.node.classList.add("is-dragging");
      item.titleBar.setPointerCapture(event.pointerId);
    }, { signal: events.signal });
    item.titleBar.addEventListener("pointermove", (event) => {
      if (drag?.window !== item || drag.pointerId !== event.pointerId) return;
      const rect = node.getBoundingClientRect();
      positions.set(item, place(item, { x: event.clientX - rect.left - drag.dx, y: event.clientY - rect.top - drag.dy }));
    }, { signal: events.signal });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"] as const) {
      item.titleBar.addEventListener(type, (event) => {
        if (drag?.pointerId === event.pointerId) endDrag();
      }, { signal: events.signal });
    }
    item.close.addEventListener("click", () => {
      endDrag();
      const restoreFocus = item.node.contains(document.activeElement);
      order.splice(order.indexOf(item), 1);
      observer.unobserve(item.node);
      positions.delete(item);
      item.node.remove();
      item.onClose?.();
      restack();
      if (restoreFocus) (order.at(-1)?.close ?? node.closest("main"))?.focus({ preventScroll: true });
    }, { signal: events.signal });
  }
  restack();
  observer.observe(node);
  compact.addEventListener("change", layout, { signal: events.signal });
  window.addEventListener("blur", endDrag, { signal: events.signal });
  // The page mounts synchronously. Place windows before their first paint,
  // rather than waiting for the observer's first asynchronous notification.
  queueMicrotask(layout);
  return {
    node,
    dispose() {
      endDrag();
      observer.disconnect();
      events.abort();
      for (const item of order) item.onClose?.();
    },
  };
}
