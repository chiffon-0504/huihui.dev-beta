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
  titleBar.setAttribute("role", "group");
  titleBar.setAttribute("aria-labelledby", `${id}-title`);
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

/** One manager owns pointer dragging, bounded positions and a finite stacking order. */
export function createDesktop(windows: readonly DesktopWindow[], keyboardMove: string) {
  const node = element("div", "desktop");
  let compact = false;
  let layoutFrame = 0;
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
    // Force the connected canvas's first layout before reading its query result.
    if (!node.isConnected || node.clientWidth === 0) return;
    // The container query measures this canvas, including scrollbar deductions.
    // Read after mounting, before changing layout; no temporary desktop reflow.
    if (order.length) compact = getComputedStyle(order[0]!.node).getPropertyValue("--desktop-compact").trim() === "1";
    node.classList.toggle("is-compact", compact);
    endDrag();
    for (const item of [...order]) {
      item.titleBar.tabIndex = compact ? -1 : 0;
      if (compact) {
        item.titleBar.removeAttribute("aria-description");
        item.titleBar.removeAttribute("aria-keyshortcuts");
        if (document.activeElement === item.titleBar) item.close.focus({ preventScroll: true });
        item.node.style.removeProperty("left");
        item.node.style.removeProperty("top");
      } else {
        item.titleBar.setAttribute("aria-description", keyboardMove);
        item.titleBar.setAttribute("aria-keyshortcuts", "ArrowUp ArrowDown ArrowLeft ArrowRight");
        const saved = positions.get(item);
        const point = place(item, saved ?? {
          x: item.start.x * (node.clientWidth - item.node.offsetWidth),
          y: item.start.y * (node.clientHeight - item.node.offsetHeight),
        });
        if (saved) positions.set(item, point);
      }
    }
  };
  const observer = new ResizeObserver(() => {
    // Mode changes resize the canvas/windows; write outside observer delivery.
    cancelAnimationFrame(layoutFrame);
    layoutFrame = requestAnimationFrame(layout);
  });
  for (const item of windows) {
    node.append(item.node);
    observer.observe(item.node);
    item.node.addEventListener("pointerdown", () => raise(item), { signal: events.signal });
    item.node.addEventListener("focusin", () => raise(item), { signal: events.signal });
    item.titleBar.addEventListener("keydown", (event) => {
      if (compact || drag || event.defaultPrevented || event.target !== item.titleBar ||
        document.activeElement !== item.titleBar || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const dx = event.key === "ArrowLeft" ? -24 : event.key === "ArrowRight" ? 24 : 0;
      const dy = event.key === "ArrowUp" ? -24 : event.key === "ArrowDown" ? 24 : 0;
      if (!dx && !dy) return;
      event.preventDefault();
      raise(item);
      positions.set(item, place(item, { x: item.node.offsetLeft + dx, y: item.node.offsetTop + dy }));
    }, { signal: events.signal });
    item.titleBar.addEventListener("pointerdown", (event) => {
      if (compact || drag || !event.isPrimary || event.button !== 0 ||
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
  window.addEventListener("blur", endDrag, { signal: events.signal });
  // The page mounts synchronously. Place windows before their first paint,
  // rather than waiting for the observer's first asynchronous notification.
  queueMicrotask(layout);
  return {
    node,
    dispose() {
      endDrag();
      observer.disconnect();
      cancelAnimationFrame(layoutFrame);
      events.abort();
      for (const item of order) item.onClose?.();
    },
  };
}
