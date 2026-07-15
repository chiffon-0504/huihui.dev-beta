let dragged = null;
let touchGhost = null;

const upload = document.getElementById("imageUpload");
const uploadButton = document.getElementById("uploadBtn");
const pool = document.getElementById("poolContent");
const board = document.getElementById("tierBoard");
const moveStatus = document.getElementById("tierMoveStatus");

function getTierMakerText(key, fallback = "") {
  const locale = typeof getCurrentLocale === "function" ? getCurrentLocale() : "zh";

  return (
    window.HUIHUI_I18N?.[locale]?.tierMaker?.[key] ||
    window.HUIHUI_I18N?.zh?.tierMaker?.[key] ||
    fallback
  );
}

function formatTierMakerText(key, replacements, fallback = "") {
  return Object.entries(replacements).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    getTierMakerText(key, fallback)
  );
}

function getTierZones() {
  return [...board.querySelectorAll(".tier-content"), pool];
}

function getTierItems(zone) {
  return [...zone.children].filter((child) => child.classList.contains("tier-item"));
}

function announceTierMove(img, zone) {
  if (!moveStatus) return;

  const items = getTierItems(zone);
  const position = items.indexOf(img) + 1;
  const destination = zone.getAttribute("aria-label") || getTierMakerText("pool", "Unsorted");
  const announcement = formatTierMakerText(
    "moveAnnouncement",
    {
      item: img.alt || getTierMakerText("uploadedImageAlt", "Uploaded image"),
      destination,
      position,
      count: items.length,
    },
    "{item} moved to {destination}, position {position} of {count}."
  );

  moveStatus.textContent = "";
  requestAnimationFrame(() => {
    moveStatus.textContent = announcement;
  });
}

function moveTierItemWithKeyboard(event) {
  const supportedKeys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];

  if (!supportedKeys.includes(event.key)) return;

  event.preventDefault();

  const img = event.currentTarget;
  const currentZone = img.parentElement;
  let moved = false;

  if (event.key === "ArrowLeft") {
    const previous = img.previousElementSibling;

    if (previous?.classList.contains("tier-item")) {
      currentZone.insertBefore(img, previous);
      moved = true;
    }
  } else if (event.key === "ArrowRight") {
    const next = img.nextElementSibling;

    if (next?.classList.contains("tier-item")) {
      currentZone.insertBefore(img, next.nextElementSibling);
      moved = true;
    }
  } else {
    const zones = getTierZones();
    const direction = event.key === "ArrowUp" ? -1 : 1;
    const destination = zones[zones.indexOf(currentZone) + direction];

    if (destination) {
      destination.appendChild(img);
      moved = true;
    }
  }

  if (moved) {
    img.focus();
    announceTierMove(img, img.parentElement);
  }
}

function syncTierRowLabels(row) {
  const input = row.querySelector(".tier-label");
  const zone = row.querySelector(".tier-content");
  const deleteButton = row.querySelector(".delete-tier");

  if (!input || !zone || !deleteButton) return;

  const name = input.value.trim() || getTierMakerText("newTier", "NEW");

  zone.setAttribute(
    "aria-label",
    formatTierMakerText("tierRegionLabel", { name }, "{name} tier")
  );
  deleteButton.setAttribute(
    "aria-label",
    formatTierMakerText("deleteNamedTier", { name }, "Delete {name} tier")
  );
}

function setupTierItem(img) {
  img.className = "tier-item";
  img.draggable = true;
  img.tabIndex = 0;
  img.setAttribute("role", "listitem");
  img.setAttribute("aria-describedby", "tierKeyboardInstructions");
  img.setAttribute("aria-keyshortcuts", "ArrowLeft ArrowRight ArrowUp ArrowDown");

  if (!img.alt) {
    img.alt = getTierMakerText("uploadedImageAlt", "Uploaded image");
  }

  img.addEventListener("keydown", moveTierItemWithKeyboard);

  img.addEventListener("dragstart", () => {
    dragged = img;
  });

  img.addEventListener(
    "touchstart",
    (e) => {
      dragged = img;
      img.classList.add("is-dragging");

      touchGhost = img.cloneNode(true);
      touchGhost.className = "tier-item touch-ghost";
      document.body.appendChild(touchGhost);

      moveGhost(e.touches[0]);
    },
    { passive: false }
  );

  img.addEventListener(
    "touchmove",
    (e) => {
      if (!dragged) return;

      e.preventDefault();
      moveGhost(e.touches[0]);
    },
    { passive: false }
  );

  img.addEventListener("touchend", (e) => {
    if (!dragged) return;

    const touch = e.changedTouches[0];
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    const zone = target?.closest(".tier-content,.pool-content");

    if (zone) {
      zone.appendChild(dragged);
    }

    cleanupTouchDrag();
  });
}

board.querySelectorAll(".tier-row").forEach(syncTierRowLabels);

uploadButton.addEventListener("click", () => {
  upload.click();
});

function moveGhost(touch) {
  if (!touchGhost) return;

  touchGhost.style.position = "fixed";
  touchGhost.style.pointerEvents = "none";
  touchGhost.style.transform = "translate(-50%,-50%)";
  touchGhost.style.left = `${touch.clientX}px`;
  touchGhost.style.top = `${touch.clientY}px`;
}

function cleanupTouchDrag() {
  if (dragged) {
    dragged.classList.remove("is-dragging");
  }

  dragged = null;

  if (touchGhost) {
    touchGhost.remove();
    touchGhost = null;
  }
}

function prepareExportLabels() {
  document.querySelectorAll(".tier-label-wrap").forEach((wrap) => {
    const input = wrap.querySelector(".tier-label");

    if (!input || wrap.querySelector(".tier-label-export")) return;

    const span = document.createElement("span");
    span.className = "tier-label-export";
    span.textContent = input.value;
    wrap.appendChild(span);
  });
}

function cleanupExportLabels() {
  document.querySelectorAll(".tier-label-export").forEach((el) => el.remove());
}

upload.addEventListener("change", (e) => {
  for (const file of e.target.files) {
    const reader = new FileReader();

    reader.onload = (event) => {
      const img = document.createElement("img");

      img.src = event.target.result;
      img.alt = file.name || getTierMakerText("uploadedImageAlt", "Uploaded image");

      setupTierItem(img);
      pool.appendChild(img);
    };

    reader.readAsDataURL(file);
  }
});

document.addEventListener("dragover", (e) => {
  e.preventDefault();
});

document.addEventListener("drop", (e) => {
  const zone = e.target.closest(".tier-content,.pool-content");

  if (zone && dragged) {
    zone.appendChild(dragged);
    dragged = null;
  }
});

const slider = document.getElementById("sizeSlider");

slider.addEventListener("input", (e) => {
  document.querySelectorAll(".tier-item").forEach((img) => {
    img.style.height = `${e.target.value}px`;
  });
});

document.addEventListener("input", (e) => {
  if (e.target.classList.contains("tier-color")) {
    const wrap = e.target.closest(".tier-label-wrap");

    if (wrap) {
      wrap.style.background = e.target.value;
    }
  } else if (e.target.classList.contains("tier-label")) {
    const row = e.target.closest(".tier-row");

    if (row) {
      syncTierRowLabels(row);
    }
  }
});

const addBtn = document.getElementById("addTierBtn");

addBtn.addEventListener("click", () => {
  const tierName = getTierMakerText("newTier", "NEW");
  const tierNameLabel = getTierMakerText("tierName", "Tier name");
  const tierColorLabel = getTierMakerText("tierColor", "Tier color");

  const row = document.createElement("div");
  row.className = "tier-row";

  row.innerHTML = `
    <div class="tier-label-wrap" style="background:#ccc">
      <input class="tier-label" value="${tierName}" aria-label="${tierNameLabel}" data-i18n-aria-label="tierMaker.tierName">
      <input class="tier-color" type="color" value="#cccccc" aria-label="${tierColorLabel}" data-i18n-aria-label="tierMaker.tierColor">
    </div>
    <div class="tier-content" role="list"></div>
    <button type="button" class="delete-tier">×</button>
  `;

  board.appendChild(row);
  syncTierRowLabels(row);
});

document.addEventListener("click", (e) => {
  if (e.target.classList.contains("delete-tier")) {
    e.target.closest(".tier-row")?.remove();
  }
});

document.getElementById("saveBtn").addEventListener("click", () => {
  prepareExportLabels();
  board.classList.add("exporting");

  import("https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/+esm").then(({ default: html2canvas }) => {
    html2canvas(board, { backgroundColor: "#000" }).then((canvas) => {
      board.classList.remove("exporting");
      cleanupExportLabels();

      const link = document.createElement("a");
      link.download = getTierMakerText("downloadFileName", "tier-list.png");
      link.href = canvas.toDataURL();
      link.click();
    });
  });
});
