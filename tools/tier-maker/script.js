let dragged = null;
let touchGhost = null;
let uploadQueue = Promise.resolve();
let exportInProgress = false;

const MAX_IMAGES = 50;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 4096;
const MAX_THUMBNAIL_EDGE = 1024;
const thumbnailUrls = new Set();

const upload = document.getElementById("imageUpload");
const uploadButton = document.getElementById("uploadBtn");
const pool = document.getElementById("poolContent");
const board = document.getElementById("tierBoard");
const saveButton = document.getElementById("saveBtn");
const tierStatus = document.getElementById("tierStatus");
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

function setTierStatus(message) {
  if (!tierStatus) return;

  tierStatus.textContent = "";
  requestAnimationFrame(() => {
    tierStatus.textContent = message;
  });
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

  img.addEventListener("dragend", cleanupDesktopDrag);

  img.addEventListener(
    "touchstart",
    (e) => {
      cleanupTouchDrag();
      dragged = img;
      img.classList.add("is-dragging");

      touchGhost = img.cloneNode(true);
      touchGhost.className = "tier-item touch-ghost";
      touchGhost.draggable = false;
      touchGhost.tabIndex = -1;
      touchGhost.setAttribute("aria-hidden", "true");
      touchGhost.removeAttribute("aria-describedby");
      touchGhost.removeAttribute("aria-keyshortcuts");
      touchGhost.removeAttribute("role");
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
    try {
      if (!dragged) return;

      const touch = e.changedTouches[0];

      if (!touch) return;

      const target = document.elementFromPoint(touch.clientX, touch.clientY);
      const zone = target?.closest(".tier-content,.pool-content");

      if (zone) {
        zone.appendChild(dragged);
      }
    } finally {
      cleanupTouchDrag();
    }
  });

  img.addEventListener("touchcancel", cleanupTouchDrag);
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

function cleanupDesktopDrag() {
  dragged = null;
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

function loadSourceImage(sourceUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image decoding failed"));
    image.src = sourceUrl;
  });
}

function createPngThumbnail(image) {
  const longestEdge = Math.max(image.naturalWidth, image.naturalHeight);
  const scale = Math.min(1, MAX_THUMBNAIL_EDGE / longestEdge);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    return Promise.reject(new Error("Canvas is unavailable"));
  }

  canvas.width = width;
  canvas.height = height;
  context.drawImage(image, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Thumbnail encoding failed"));
      }
    }, "image/png");
  });
}

async function createThumbnail(file) {
  let sourceUrl = "";

  try {
    sourceUrl = URL.createObjectURL(file);
    const image = await loadSourceImage(sourceUrl);

    if (
      image.naturalWidth > MAX_IMAGE_DIMENSION ||
      image.naturalHeight > MAX_IMAGE_DIMENSION
    ) {
      return { reason: "dimensions" };
    }

    if (!image.naturalWidth || !image.naturalHeight) {
      return { reason: "invalid" };
    }

    const thumbnail = await createPngThumbnail(image);
    return { thumbnailUrl: URL.createObjectURL(thumbnail) };
  } catch {
    return { reason: "invalid" };
  } finally {
    if (sourceUrl) {
      URL.revokeObjectURL(sourceUrl);
    }
  }
}

function revokeThumbnailUrl(thumbnailUrl) {
  if (!thumbnailUrl) return;

  URL.revokeObjectURL(thumbnailUrl);
  thumbnailUrls.delete(thumbnailUrl);
}

function releaseTierItem(img) {
  const thumbnailUrl = img.dataset.thumbnailUrl;

  revokeThumbnailUrl(thumbnailUrl);
  delete img.dataset.thumbnailUrl;
}

function appendTierItem(file, thumbnailUrl) {
  const img = document.createElement("img");

  img.src = thumbnailUrl;
  img.alt = file.name || getTierMakerText("uploadedImageAlt", "Uploaded image");
  img.dataset.thumbnailUrl = thumbnailUrl;

  try {
    setupTierItem(img);
    thumbnailUrls.add(thumbnailUrl);
    pool.appendChild(img);
  } catch (error) {
    revokeThumbnailUrl(thumbnailUrl);
    throw error;
  }
}

function getTotalTierItemCount() {
  return getTierZones().reduce((count, zone) => count + getTierItems(zone).length, 0);
}

async function processUploadBatch(files) {
  let totalCount = getTotalTierItemCount();
  let addedCount = 0;
  let countLimitReached = false;
  const rejectionMessages = [];

  for (const file of files) {
    if (totalCount >= MAX_IMAGES) {
      countLimitReached = true;
      break;
    }

    const fileName = file.name || getTierMakerText("uploadedImageAlt", "Uploaded image");

    if (file.size > MAX_FILE_SIZE) {
      rejectionMessages.push(
        formatTierMakerText(
          "uploadFileTooLarge",
          { file: fileName },
          "{file} was not added because it exceeds 10 MiB."
        )
      );
      continue;
    }

    if (file.type && !file.type.startsWith("image/")) {
      rejectionMessages.push(
        formatTierMakerText(
          "uploadInvalidImage",
          { file: fileName },
          "{file} was not added because it is not a readable image."
        )
      );
      continue;
    }

    const result = await createThumbnail(file);

    if (result.reason === "dimensions") {
      rejectionMessages.push(
        formatTierMakerText(
          "uploadDimensionsTooLarge",
          { file: fileName },
          "{file} was not added because its dimensions exceed 4096 × 4096 pixels."
        )
      );
      continue;
    }

    if (!result.thumbnailUrl) {
      rejectionMessages.push(
        formatTierMakerText(
          "uploadInvalidImage",
          { file: fileName },
          "{file} was not added because it is not a readable image."
        )
      );
      continue;
    }

    try {
      appendTierItem(file, result.thumbnailUrl);
      totalCount += 1;
      addedCount += 1;
    } catch {
      rejectionMessages.push(
        formatTierMakerText(
          "uploadInvalidImage",
          { file: fileName },
          "{file} was not added because it is not a readable image."
        )
      );
    }
  }

  if (countLimitReached) {
    rejectionMessages.push(
      getTierMakerText(
        "uploadCountLimit",
        "The 50-image limit was reached. Extra files were not added."
      )
    );
  }

  const successMessage = formatTierMakerText(
    "uploadSuccess",
    { count: addedCount },
    "Images added: {count}."
  );

  setTierStatus([successMessage, ...rejectionMessages].join(" "));
}

upload.addEventListener("change", (e) => {
  const files = [...e.target.files];

  upload.value = "";
  uploadQueue = uploadQueue
    .catch(() => {})
    .then(() => processUploadBatch(files))
    .finally(() => {
      upload.value = "";
    })
    .catch(() => {});
});

document.addEventListener("dragover", (e) => {
  e.preventDefault();
});

document.addEventListener("drop", (e) => {
  try {
    const zone = e.target.closest(".tier-content,.pool-content");

    if (zone && dragged) {
      zone.appendChild(dragged);
    }
  } finally {
    cleanupDesktopDrag();
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
    const row = e.target.closest(".tier-row");

    if (!row) return;

    if (dragged && row.contains(dragged)) {
      cleanupTouchDrag();
    }

    row.querySelectorAll(".tier-item").forEach(releaseTierItem);
    row.remove();
  }
});

async function exportTierBoard() {
  if (exportInProgress) return;

  exportInProgress = true;
  const wasDisabled = saveButton.disabled;
  const previousBusy = saveButton.getAttribute("aria-busy");

  saveButton.disabled = true;
  saveButton.setAttribute("aria-busy", "true");

  try {
    prepareExportLabels();
    board.classList.add("exporting");

    const { default: html2canvas } = await import(
      "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/+esm"
    );
    const canvas = await html2canvas(board, { backgroundColor: "#000" });
    const link = document.createElement("a");

    link.download = getTierMakerText("downloadFileName", "tier-list.png");
    link.href = canvas.toDataURL();
    link.click();
    setTierStatus(getTierMakerText("exportSuccess", "PNG download started."));
  } catch {
    setTierStatus(
      getTierMakerText(
        "exportFailure",
        "The PNG could not be created. Please try again."
      )
    );
  } finally {
    board.classList.remove("exporting");
    cleanupExportLabels();
    saveButton.disabled = wasDisabled;

    if (previousBusy === null) {
      saveButton.removeAttribute("aria-busy");
    } else {
      saveButton.setAttribute("aria-busy", previousBusy);
    }

    exportInProgress = false;
  }
}

saveButton.addEventListener("click", exportTierBoard);

window.addEventListener("pagehide", (event) => {
  if (event.persisted) return;

  [...thumbnailUrls].forEach(revokeThumbnailUrl);
});
