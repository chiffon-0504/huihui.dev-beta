import { getContent, type Locale } from "../locales";
import { element } from "../dom";
import { createDesktop, createWindow } from "../components/desktop";
import { createImage } from "../components/media";
import { memoryImage, memoryImageSizes } from "../media/memories";

export function createHome(locale: Locale): HTMLElement {
  const copy = getContent(locale).home;
  const main = element("main", "home");
  main.id = "main-content";
  main.tabIndex = -1;

  const playing = createWindow("playing", copy.playing, copy.close, { x: 0.46, y: 0.14 });
  const games = element("ul", "desktop-list");
  for (const game of ["Arcaea", "BanG Dream! Our Notes"]) games.append(element("li", "", game));
  playing.content.append(games);

  const bishoujo = createWindow("bishoujo", copy.bishoujo, copy.close, { x: 0.03, y: 0.42 });
  const bishoujoGames = element("ul", "desktop-list");
  for (const game of ["Summer Pockets REFLECTION BLUE", "魔女的夜宴", "蒼之彼方的四重奏"]) {
    bishoujoGames.append(element("li", "", game));
  }
  bishoujo.content.append(bishoujoGames);

  const memories = createWindow("memories", copy.memories, copy.close, { x: 0.46, y: 0.90 });
  const photo = createImage({ asset: memoryImage, alt: "Ave Mujica LIVE TOUR 2026『Exitus』台北追加公演DAY2", sizes: memoryImageSizes });
  // Keep native image dragging from consuming the next title-bar pointer gesture.
  photo.draggable = false;
  memories.content.append(photo,
    element("p", "desktop-memory-caption", "Ave Mujica LIVE TOUR 2026『Exitus』"),
    element("p", "", "台北追加公演DAY2"),
  );

  let timer: ReturnType<typeof setInterval> | undefined;
  const stopClock = () => { clearInterval(timer); timer = undefined; };
  const clock = createWindow("clock", copy.time, copy.close, { x: 0.96, y: 0.02 }, stopClock);
  const date = element("span", "desktop-date");
  const time = element("span", "desktop-time");
  const timestamp = element("time", "desktop-clock");
  timestamp.append(date, time);
  clock.content.append(timestamp, element("p", "desktop-muted", copy.localTime));
  const tick = () => {
    const now = new Date();
    timestamp.dateTime = now.toISOString();
    date.textContent = `${now.getFullYear()} / ${now.getMonth() + 1} / ${now.getDate()}`;
    time.textContent = [now.getHours(), now.getMinutes(), now.getSeconds()].map((part) => String(part).padStart(2, "0")).join(" : ");
  };
  const startClock = () => {
    if (!clock.node.isConnected || document.hidden || timer !== undefined) return;
    tick();
    timer = setInterval(tick, 1000);
  };
  tick();
  const status = createWindow("status", copy.status, copy.close, { x: 0.85, y: 0.60 });
  status.content.append(element("p", "", copy.statusUnavailable));
  const services = element("dl", "desktop-services");
  for (const label of [copy.website, "API"]) {
    services.append(element("dt", "", label), element("dd", "desktop-muted", copy.notChecked));
  }
  status.content.append(services);

  const version = createWindow("version", copy.version, copy.close, { x: 0.12, y: 0.91 });
  version.content.append(element("p", "desktop-version", "V2.0.0"), element("p", "desktop-muted", copy.development));
  const notes = element("ul", "desktop-notes");
  for (const note of copy.notes) notes.append(element("li", "", note));
  version.content.append(notes);

  const desktop = createDesktop([playing, bishoujo, memories, clock, status, version]);
  main.append(desktop.node);
  const visibility = () => document.hidden ? stopClock() : startClock();
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("pageshow", startClock);
  window.addEventListener("pagehide", (event) => {
    stopClock();
    if (!event.persisted) {
      desktop.dispose();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pageshow", startClock);
    }
  });
  // The caller mounts main synchronously; avoid a detached-node interval.
  queueMicrotask(startClock);
  return main;
}
