let homeCardsReady = false;

// The Worker fetches its three RSS sources in parallel and caches responses for
// five minutes. Eight seconds leaves room for a normal cold request while still
// bounding an unusually slow or stalled client request.
const TECH_NEWS_REQUEST_TIMEOUT_MS = 8000;
let techNewsRequestSequence = 0;
let activeTechNewsRequestController;

function getSafeTechNewsUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.href : "";
  } catch (error) {
    return "";
  }
}

function getHomeTechNewsText(key) {
  const locale = typeof getCurrentLocale === "function" ? getCurrentLocale() : "zh";

  return (
    window.HUIHUI_I18N?.[locale]?.home?.tech?.[key] ||
    window.HUIHUI_I18N?.zh?.home?.tech?.[key] ||
    ""
  );
}

function setTechNewsStatus(container, state) {
  const messageKeys = {
    loading: "loading",
    empty: "empty",
    error: "loadError",
    timeout: "timeout",
  };
  const message = document.createElement("p");

  // Reuse the existing full-grid status styles without changing Home CSS.
  message.className = state === "loading" ? "tech-news-loading" : "tech-news-error";
  message.classList.add("tech-news-status");
  message.dataset.techNewsState = state;
  message.textContent = getHomeTechNewsText(messageKeys[state]);
  container.replaceChildren(message);
}

function getValidTechNewsItem(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;

  const requiredFields = ["category", "title", "source", "tag"];
  const hasRequiredText = requiredFields.every(
    (field) => typeof item[field] === "string" && item[field].trim(),
  );

  if (!hasRequiredText) return null;

  return {
    category: item.category,
    title: item.title,
    source: item.source,
    timeAgo: typeof item.timeAgo === "string" ? item.timeAgo : "",
    tag: item.tag,
    link: getSafeTechNewsUrl(item.link),
  };
}

function renderTechNewsCards(container, items) {
  const validItems = items.map(getValidTechNewsItem).filter(Boolean);

  if (validItems.length === 0) {
    setTechNewsStatus(container, "empty");
    return;
  }

  const fragment = document.createDocumentFragment();
  const sourceLabel = getHomeTechNewsText("sourceLabel");
  const sourceSpacing = sourceLabel.endsWith(":") ? " " : "";

  validItems.forEach((item) => {
    const card = document.createElement("a");
    const category = document.createElement("div");
    const title = document.createElement("h3");
    const source = document.createElement("p");
    const tag = document.createElement("span");

    card.className = "tech-news-card";
    card.target = "_blank";
    card.rel = "noopener noreferrer";

    if (item.link) {
      card.href = item.link;
    }

    category.className = "tech-news-category";
    category.textContent = item.category;
    title.textContent = item.title;
    source.textContent = `${sourceLabel}${sourceSpacing}${item.source}${item.timeAgo ? ` · ${item.timeAgo}` : ""}`;
    tag.className = "tech-news-tag";
    tag.textContent = item.tag;

    card.append(category, title, source, tag);
    fragment.append(card);
  });
  container.replaceChildren(fragment);
}

// ===== Tech Updates =====
async function loadTechNews() {
  const container = document.getElementById("techNewsCards");
  if (!container) return;

  const requestSequence = ++techNewsRequestSequence;
  activeTechNewsRequestController?.abort();

  const controller = new AbortController();
  let didTimeout = false;
  const timeoutId = setTimeout(() => {
    didTimeout = true;
    controller.abort();

    if (requestSequence === techNewsRequestSequence) {
      setTechNewsStatus(container, "timeout");
    }
  }, TECH_NEWS_REQUEST_TIMEOUT_MS);

  activeTechNewsRequestController = controller;
  setTechNewsStatus(container, "loading");

  try {
    const response = await fetch(`${getHuihuiApiBase()}/api/tech-news`, {
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error("API request failed");
    }

    const data = await response.json();

    if (didTimeout || requestSequence !== techNewsRequestSequence) return;

    if (!data || data.ok !== true || !Array.isArray(data.techNews)) {
      throw new Error("Invalid API response");
    }

    renderTechNewsCards(container, data.techNews);
  } catch (error) {
    if (requestSequence !== techNewsRequestSequence) return;

    setTechNewsStatus(container, didTimeout ? "timeout" : "error");
  } finally {
    clearTimeout(timeoutId);

    if (activeTechNewsRequestController === controller) {
      activeTechNewsRequestController = undefined;
    }
  }
}

function initHomeCards() {
  if (homeCardsReady) return;

  homeCardsReady = true;
  loadTechNews();
}
