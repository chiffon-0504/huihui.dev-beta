let homeCardsReady = false;

// The Worker fetches its three RSS sources in parallel and caches responses for
// five minutes. Eight seconds leaves room for a normal cold request while still
// bounding an unusually slow or stalled client request.
const TECH_NEWS_REQUEST_TIMEOUT_MS = 8000;
const INFRASTRUCTURE_STATUS_REQUEST_TIMEOUT_MS = 6000;
const SYSTEM_STATUS_REQUEST_TIMEOUT_MS = 6000;
let techNewsRequestSequence = 0;
let activeTechNewsRequestController;
let infrastructureStatusRequestSequence = 0;
let activeInfrastructureStatusRequestController;
let systemStatusRequestSequence = 0;
let activeSystemStatusRequestController;
const SYSTEM_STATUS_VALUES = new Set([
  "operational",
  "degraded_performance",
  "partial_outage",
  "major_outage",
  "unknown",
]);
const SYSTEM_STATUS_RANK = Object.freeze({
  operational: 0,
  degraded_performance: 1,
  partial_outage: 2,
  major_outage: 3,
});
const SYSTEM_STATUS_COMPONENTS = Object.freeze([
  { id: "website", labelKey: "components.website", descKey: "descriptions.website" },
  { id: "api", labelKey: "components.api", descKey: "descriptions.api" },
  { id: "contact", labelKey: "components.contact", descKey: "descriptions.contact" },
]);
const SYSTEM_STATUS_ROUTES = Object.freeze({
  zh: "/status/",
  en: "/en/status/",
  ja: "/ja/status/",
});
const SYSTEM_STATUS_SYMBOLS = Object.freeze({
  operational: "●",
  degraded_performance: "▲",
  partial_outage: "◐",
  major_outage: "✕",
  unknown: "?",
});
const INFRASTRUCTURE_STATUS_VALUES = new Set([
  "operational",
  "under_maintenance",
  "degraded_performance",
  "partial_outage",
  "major_outage",
  "unknown",
]);
const INFRASTRUCTURE_PROVIDER_DEFINITIONS = Object.freeze([
  {
    id: "cloudflare",
    titleKey: "cloudflareTitle",
    url: "https://www.cloudflarestatus.com/",
    linkKey: "cloudflareLink",
    components: [
      { id: "pages", labelKey: "pages" },
      { id: "workers", labelKey: "workers" },
      { id: "dns", labelKey: "dns" },
      { id: "cdn", labelKey: "cdn" },
    ],
  },
  {
    id: "github",
    titleKey: "githubTitle",
    url: "https://www.githubstatus.com/",
    linkKey: "githubLink",
    components: [
      { id: "actions", labelKey: "actions" },
      { id: "api_requests", labelKey: "apiRequests" },
      { id: "git_operations", labelKey: "gitOperations" },
    ],
  },
]);
const INFRASTRUCTURE_STATUS_SYMBOLS = Object.freeze({
  operational: "●",
  under_maintenance: "◆",
  degraded_performance: "▲",
  partial_outage: "◐",
  major_outage: "✕",
  unknown: "?",
});

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

function getHomeInfrastructureText(keyPath) {
  const locale = typeof getCurrentLocale === "function" ? getCurrentLocale() : "zh";
  const getValue = (source) =>
    keyPath
      .split(".")
      .reduce((current, key) => (current ? current[key] : undefined), source);

  return (
    getValue(window.HUIHUI_I18N?.[locale]?.home?.infrastructure) ||
    getValue(window.HUIHUI_I18N?.zh?.home?.infrastructure) ||
    ""
  );
}

function getSystemStatusText(keyPath) {
  const locale = typeof getCurrentLocale === "function" ? getCurrentLocale() : "zh";
  const getValue = (source) =>
    keyPath
      .split(".")
      .reduce((current, key) => (current ? current[key] : undefined), source);

  return (
    getValue(window.HUIHUI_I18N?.[locale]?.systemStatus) ||
    getValue(window.HUIHUI_I18N?.zh?.systemStatus) ||
    ""
  );
}

function getSystemStatusLabel(status) {
  const statusKeys = {
    operational: "statuses.operational",
    degraded_performance: "statuses.degradedPerformance",
    partial_outage: "statuses.partialOutage",
    major_outage: "statuses.majorOutage",
    unknown: "statuses.unknown",
  };

  return getSystemStatusText(statusKeys[status] || statusKeys.unknown);
}

function aggregateSystemStatus(components) {
  if (components.some((component) => component.status === "unknown")) {
    return "unknown";
  }

  return components.reduce(
    (worst, component) =>
      SYSTEM_STATUS_RANK[component.status] > SYSTEM_STATUS_RANK[worst]
        ? component.status
        : worst,
    "operational",
  );
}

function unknownSystemStatus() {
  return {
    status: "unknown",
    checkedAt: null,
    components: SYSTEM_STATUS_COMPONENTS.map((component) => ({
      ...component,
      status: "unknown",
    })),
  };
}

function getValidSystemStatus(data) {
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    data.ok !== true ||
    !SYSTEM_STATUS_VALUES.has(data.status) ||
    !Array.isArray(data.components) ||
    typeof data.checkedAt !== "string" ||
    !Number.isFinite(Date.parse(data.checkedAt))
  ) {
    return null;
  }

  const components = SYSTEM_STATUS_COMPONENTS.map((definition) => {
    const matches = data.components.filter(
      (component) =>
        component &&
        typeof component === "object" &&
        !Array.isArray(component) &&
        component.id === definition.id,
    );

    if (
      matches.length !== 1 ||
      !SYSTEM_STATUS_VALUES.has(matches[0].status)
    ) {
      return null;
    }

    return { ...definition, status: matches[0].status };
  });

  if (
    components.some((component) => component === null) ||
    data.components.length !== SYSTEM_STATUS_COMPONENTS.length ||
    aggregateSystemStatus(components) !== data.status
  ) {
    return null;
  }

  return {
    status: data.status,
    checkedAt: data.checkedAt,
    components,
  };
}

function createStatusText(status, label, symbolText, className, symbolClassName) {
  const wrapper = document.createElement("span");
  const symbol = document.createElement("span");
  const text = document.createElement("span");

  wrapper.className = className;
  wrapper.dataset.status = status;
  symbol.className = `status-symbol ${symbolClassName}`;
  symbol.setAttribute("aria-hidden", "true");
  symbol.textContent = symbolText;
  text.textContent = label;
  wrapper.append(symbol, text);
  return wrapper;
}

function createSystemStatusState(status, className) {
  return createStatusText(
    status,
    getSystemStatusLabel(status),
    SYSTEM_STATUS_SYMBOLS[status],
    className,
    "system-status-symbol",
  );
}

function formatSystemStatusTime(value) {
  if (!value) return getSystemStatusText("notChecked");

  const locale = typeof getCurrentLocale === "function" ? getCurrentLocale() : "zh";
  const localeTag = { zh: "zh-Hant", en: "en", ja: "ja" }[locale] || "zh-Hant";

  return new Intl.DateTimeFormat(localeTag, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function createSystemStatusComponents(status, isDetail) {
  const list = document.createElement(isDetail ? "div" : "dl");

  list.className = isDetail
    ? "system-status-component-grid"
    : "system-status-component-list";

  status.components.forEach((component) => {
    if (isDetail) {
      const card = document.createElement("article");
      const heading = document.createElement("h2");
      const description = document.createElement("p");
      const state = document.createElement("p");

      card.className = "system-status-component-card";
      card.dataset.component = component.id;
      card.dataset.status = component.status;
      heading.textContent = getSystemStatusText(component.labelKey);
      description.textContent = getSystemStatusText(component.descKey);
      state.append(
        createSystemStatusState(
          component.status,
          "status-chip system-status-state",
        ),
      );
      card.append(heading, description, state);
      list.append(card);
      return;
    }

    const row = document.createElement("div");
    const name = document.createElement("dt");
    const state = document.createElement("dd");

    row.className = "system-status-component-row";
    name.textContent = getSystemStatusText(component.labelKey);
    state.append(
      createSystemStatusState(
        component.status,
        "status-chip system-status-state",
      ),
    );
    row.append(name, state);
    list.append(row);
  });

  return list;
}

function renderSystemStatus(container, status, state = "ready") {
  const isDetail = container.dataset.systemStatusSurface === "detail";
  const fragment = document.createDocumentFragment();
  const overall = document.createElement(isDetail ? "p" : "h2");
  const checkedAt = document.createElement("p");

  container.dataset.status = status.status;
  container.dataset.systemStatusState = state;
  overall.className = "system-status-overall";
  if (!isDetail) overall.id = "systemStatusTitle";

  if (state === "loading") {
    overall.textContent = getSystemStatusText("checking");
  } else if (status.status === "operational") {
    overall.append(
      createSystemStatusState("operational", "system-status-summary-state"),
    );
    overall.lastElementChild.lastElementChild.textContent =
      getSystemStatusText("allOperational");
  } else if (status.status === "unknown") {
    overall.append(
      createSystemStatusState("unknown", "system-status-summary-state"),
    );
    overall.lastElementChild.lastElementChild.textContent =
      getSystemStatusText("statusUnknown");
  } else {
    overall.append(
      createSystemStatusState(status.status, "system-status-summary-state"),
    );
  }

  checkedAt.className = "system-status-checked-at";
  checkedAt.textContent = `${getSystemStatusText("lastChecked")}: ${formatSystemStatusTime(status.checkedAt)}`;
  fragment.append(overall, createSystemStatusComponents(status, isDetail), checkedAt);

  if (state === "error") {
    const error = document.createElement("p");
    error.className = "system-status-error";
    error.textContent = getSystemStatusText("unable");
    fragment.append(error);
  }

  if (!isDetail) {
    const link = document.createElement("a");
    const locale = typeof getCurrentLocale === "function" ? getCurrentLocale() : "zh";

    link.className = "status-link system-status-link";
    link.href = SYSTEM_STATUS_ROUTES[locale] || SYSTEM_STATUS_ROUTES.zh;
    link.textContent = getSystemStatusText("viewStatus");
    fragment.append(link);
  }

  container.replaceChildren(fragment);
}

function setTechNewsStatus(container, state) {
  const messageKeys = {
    loading: "loading",
    empty: "empty",
    error: "loadError",
    timeout: "timeout",
  };
  const existingStatus = container.querySelector(":scope > .tech-news-status");
  const message = existingStatus || document.createElement("p");

  // Reuse the existing full-grid status styles without changing Home CSS.
  message.className = state === "loading" ? "tech-news-loading" : "tech-news-error";
  message.classList.add("tech-news-status");
  message.setAttribute("role", "status");
  message.setAttribute("aria-live", "polite");
  message.setAttribute("aria-atomic", "true");
  message.dataset.techNewsState = state;
  message.textContent = getHomeTechNewsText(messageKeys[state]);

  if (!existingStatus) container.replaceChildren(message);
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

function getInfrastructureStatusText(status) {
  const statusKeys = {
    operational: "statuses.operational",
    under_maintenance: "statuses.underMaintenance",
    degraded_performance: "statuses.degradedPerformance",
    partial_outage: "statuses.partialOutage",
    major_outage: "statuses.majorOutage",
    unknown: "statuses.unknown",
  };

  return getHomeInfrastructureText(statusKeys[status] || statusKeys.unknown);
}

function getValidInfrastructureProvider(provider, definition) {
  if (
    !provider ||
    typeof provider !== "object" ||
    Array.isArray(provider) ||
    provider.id !== definition.id ||
    !Array.isArray(provider.components)
  ) {
    provider = { components: [] };
  }

  let hasUnknown = false;
  const components = definition.components.map((component) => {
    const matches = provider.components.filter(
      (candidate) =>
        candidate &&
        typeof candidate === "object" &&
        !Array.isArray(candidate) &&
        candidate.id === component.id,
    );
    const status =
      matches.length === 1 &&
      INFRASTRUCTURE_STATUS_VALUES.has(matches[0].status)
        ? matches[0].status
        : "unknown";

    if (status === "unknown") hasUnknown = true;

    return { ...component, status };
  });
  const status =
    !hasUnknown && INFRASTRUCTURE_STATUS_VALUES.has(provider.status)
      ? provider.status
      : "unknown";

  return { ...definition, status, components };
}

function createInfrastructureStatusText(status, className) {
  return createStatusText(
    status,
    getInfrastructureStatusText(status),
    INFRASTRUCTURE_STATUS_SYMBOLS[status],
    `status-chip ${className}`,
    "infrastructure-status-symbol",
  );
}

function createInfrastructureCard(provider) {
  const card = document.createElement("article");
  const title = document.createElement("h3");
  const summary = document.createElement("p");
  const components = document.createElement("dl");
  const link = document.createElement("a");

  card.className = "tech-news-card infrastructure-status-card";
  card.dataset.provider = provider.id;
  card.dataset.status = provider.status;
  title.textContent = getHomeInfrastructureText(provider.titleKey);
  summary.className = "infrastructure-provider-summary";
  summary.append(
    createInfrastructureStatusText(
      provider.status,
      "infrastructure-status-text",
    ),
  );
  components.className = "infrastructure-component-list";

  provider.components.forEach((component) => {
    const row = document.createElement("div");
    const name = document.createElement("dt");
    const status = document.createElement("dd");

    row.className = "infrastructure-component-row";
    name.textContent = getHomeInfrastructureText(
      `components.${component.labelKey}`,
    );
    status.append(
      createInfrastructureStatusText(
        component.status,
        "infrastructure-component-status",
      ),
    );
    row.append(name, status);
    components.append(row);
  });

  link.className = "status-link infrastructure-status-link";
  link.href = provider.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = getHomeInfrastructureText(provider.linkKey);
  card.append(title, summary, components, link);
  return card;
}

function renderInfrastructureStatus(container, providers, hasLoadError = false) {
  const fragment = document.createDocumentFragment();

  if (hasLoadError) {
    const message = document.createElement("p");

    message.className = "infrastructure-status-message";
    message.setAttribute("role", "status");
    message.setAttribute("aria-live", "polite");
    message.setAttribute("aria-atomic", "true");
    message.dataset.infrastructureStatusState = "error";
    message.textContent = getHomeInfrastructureText("loadError");
    fragment.append(message);
  }

  INFRASTRUCTURE_PROVIDER_DEFINITIONS.forEach((definition) => {
    const matches = Array.isArray(providers)
      ? providers.filter((provider) => provider?.id === definition.id)
      : [];
    const provider = getValidInfrastructureProvider(
      matches.length === 1 ? matches[0] : null,
      definition,
    );

    fragment.append(createInfrastructureCard(provider));
  });

  container.replaceChildren(fragment);
}

function setInfrastructureStatusLoading(container) {
  const message = document.createElement("p");

  message.className = "infrastructure-status-message";
  message.setAttribute("role", "status");
  message.setAttribute("aria-live", "polite");
  message.setAttribute("aria-atomic", "true");
  message.dataset.infrastructureStatusState = "loading";
  message.textContent = getHomeInfrastructureText("loading");
  container.replaceChildren(message);
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

async function loadInfrastructureStatus() {
  const container = document.getElementById("infrastructureStatusCards");
  if (!container) return;

  const requestSequence = ++infrastructureStatusRequestSequence;
  activeInfrastructureStatusRequestController?.abort();

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    INFRASTRUCTURE_STATUS_REQUEST_TIMEOUT_MS,
  );

  activeInfrastructureStatusRequestController = controller;
  setInfrastructureStatusLoading(container);

  try {
    const response = await fetch(
      `${getHuihuiApiBase()}/api/infrastructure-status`,
      { signal: controller.signal },
    );

    if (!response.ok) throw new Error("API request failed");

    const data = await response.json();

    if (requestSequence !== infrastructureStatusRequestSequence) return;

    if (!data || data.ok !== true || !Array.isArray(data.providers)) {
      throw new Error("Invalid API response");
    }

    renderInfrastructureStatus(container, data.providers);
  } catch (error) {
    if (requestSequence !== infrastructureStatusRequestSequence) return;

    renderInfrastructureStatus(container, [], true);
  } finally {
    clearTimeout(timeoutId);

    if (activeInfrastructureStatusRequestController === controller) {
      activeInfrastructureStatusRequestController = undefined;
    }
  }
}

async function loadSystemStatus() {
  const containers = [...document.querySelectorAll("[data-system-status-surface]")];
  if (containers.length === 0) return;

  const requestSequence = ++systemStatusRequestSequence;
  activeSystemStatusRequestController?.abort();

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    SYSTEM_STATUS_REQUEST_TIMEOUT_MS,
  );

  activeSystemStatusRequestController = controller;
  containers.forEach((container) =>
    renderSystemStatus(container, unknownSystemStatus(), "loading"),
  );

  try {
    const response = await fetch(`${getHuihuiApiBase()}/api/system-status`, {
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) throw new Error("API request failed");

    const status = getValidSystemStatus(await response.json());

    if (requestSequence !== systemStatusRequestSequence) return;
    if (!status) throw new Error("Invalid API response");

    containers.forEach((container) => renderSystemStatus(container, status));
  } catch (error) {
    if (requestSequence !== systemStatusRequestSequence) return;

    containers.forEach((container) =>
      renderSystemStatus(container, unknownSystemStatus(), "error"),
    );
  } finally {
    clearTimeout(timeoutId);

    if (activeSystemStatusRequestController === controller) {
      activeSystemStatusRequestController = undefined;
    }
  }
}

function initHomeCards() {
  if (homeCardsReady) return;

  homeCardsReady = true;
  loadSystemStatus();
  loadTechNews();
  loadInfrastructureStatus();
}
