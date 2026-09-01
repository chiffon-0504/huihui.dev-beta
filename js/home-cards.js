let homeCardsReady = false;

// The Worker fetches its three RSS sources in parallel and caches responses for
// five minutes. Eight seconds leaves room for a normal cold request while still
// bounding an unusually slow or stalled client request.
const TECH_NEWS_REQUEST_TIMEOUT_MS = 8000;
const INFRASTRUCTURE_STATUS_REQUEST_TIMEOUT_MS = 6000;
const SYSTEM_STATUS_REQUEST_TIMEOUT_MS = 6000;
const SYSTEM_STATUS_HISTORY_REQUEST_TIMEOUT_MS = 6000;
const SYSTEM_STATUS_INCIDENTS_REQUEST_TIMEOUT_MS = 6000;
let systemStatusIncidentsRequestSequence = 0;
let activeSystemStatusIncidentsRequestController;
let systemStatusIncidentsLifecycleReady = false;
let systemStatusHistoryRequestSequence = 0;
let activeSystemStatusHistoryRequestController;
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
const SYSTEM_STATUS_PAGE_URL = "https://huihui-dev.betteruptime.com/";
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

    link.className = "status-link system-status-link";
    link.href = SYSTEM_STATUS_PAGE_URL;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
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

function formatTechNewsTimeAgo(value) {
  if (typeof value !== "string" || !value) return "";

  // The current API exposes only timeAgo, not a publication timestamp.
  const match = /^(-?\d+) (mins?|minutes?|hours?|days?) ago$/.exec(value);
  if (value !== "just now" && !match) return value;

  const amount = match ? Number(match[1]) : 0;
  if (!Number.isSafeInteger(amount)) return "";

  const locale = typeof getCurrentLocale === "function" ? getCurrentLocale() : "zh";
  const localeTag = { zh: "zh-Hant", en: "en", ja: "ja" }[locale] || "zh-Hant";
  if (value === "just now" || amount < 0) {
    return localeTag === "en"
      ? "just now"
      : new Intl.RelativeTimeFormat(localeTag, { numeric: "auto" }).format(
          0,
          "second",
        );
  }

  const unit = match[2].startsWith("min")
    ? "minute"
    : match[2].startsWith("hour")
      ? "hour"
      : "day";
  return new Intl.RelativeTimeFormat(localeTag, { numeric: "always" }).format(
    -amount,
    unit,
  );
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
    timeAgo: formatTechNewsTimeAgo(item.timeAgo),
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

function isSystemStatusHistoryObject(value) {
  return value !== null && typeof value === "object" &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function isSystemStatusHistoryDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function getValidSystemStatusHistory(data) {
  if (
    !isSystemStatusHistoryObject(data) || data.source !== "better_stack" ||
    typeof data.ok !== "boolean" || typeof data.complete !== "boolean" ||
    !Number.isInteger(data.windowDays) || data.windowDays !== 90 ||
    typeof data.fetchedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(data.fetchedAt) ||
    !isSystemStatusHistoryDate(data.fetchedAt.slice(0, 10)) ||
    !Number.isFinite(Date.parse(data.fetchedAt)) ||
    !Array.isArray(data.components) || data.components.length !== SYSTEM_STATUS_COMPONENTS.length
  ) return null;

  const components = [];
  for (const definition of SYSTEM_STATUS_COMPONENTS) {
    const matches = data.components.filter((item) =>
      isSystemStatusHistoryObject(item) && item.id === definition.id);
    if (matches.length !== 1) return null;
    const component = matches[0];
    if (
      !SYSTEM_STATUS_VALUES.has(component.status) ||
      (component.availabilityPercent !== null &&
        (!Number.isFinite(component.availabilityPercent) ||
          component.availabilityPercent < 0 || component.availabilityPercent > 100)) ||
      !Number.isInteger(component.observedDays) || component.observedDays < 0 ||
      component.observedDays > 90 || !Array.isArray(component.history) ||
      component.history.length !== component.observedDays
    ) return null;

    const history = [];
    let previousDate = "";
    for (const record of component.history) {
      if (
        !isSystemStatusHistoryObject(record) || !isSystemStatusHistoryDate(record.date) ||
        record.date <= previousDate || !SYSTEM_STATUS_VALUES.has(record.status) ||
        !Number.isFinite(record.downtimeSeconds) || record.downtimeSeconds < 0 ||
        !Number.isFinite(record.maintenanceSeconds) || record.maintenanceSeconds < 0
      ) return null;
      previousDate = record.date;
      history.push({
        date: record.date, status: record.status,
        downtimeSeconds: record.downtimeSeconds, maintenanceSeconds: record.maintenanceSeconds,
      });
    }
    if (
      component.historyStartDate !== (history[0]?.date ?? null) ||
      component.historyEndDate !== (history.at(-1)?.date ?? null)
    ) return null;
    components.push({
      ...definition, status: component.status, availabilityPercent: component.availabilityPercent,
      observedDays: component.observedDays, historyStartDate: component.historyStartDate,
      historyEndDate: component.historyEndDate, history,
    });
  }
  // Match the B1 Worker's completeness predicate after validating the public fields.
  const complete = components.every((component) =>
    component.status !== "unknown" && component.availabilityPercent !== null &&
    component.history.every((item) => item.status !== "unknown")
  );
  if (data.ok !== complete || data.complete !== complete) return null;
  return { complete, fetchedAt: data.fetchedAt, components };
}

function getSystemStatusHistoryLocale() {
  const locale = typeof getCurrentLocale === "function" ? getCurrentLocale() : "zh";
  return { zh: "zh-Hant", en: "en", ja: "ja" }[locale] || "zh-Hant";
}

function formatSystemStatusHistoryDate(value) {
  // Daily buckets are calendar dates, not instants in the visitor's time zone.
  return new Intl.DateTimeFormat(getSystemStatusHistoryLocale(), {
    dateStyle: "medium", timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatSystemStatusHistoryCellDate(value, includeYear = false) {
  return new Intl.DateTimeFormat(getSystemStatusHistoryLocale(), {
    year: includeYear ? "numeric" : undefined,
    month: "numeric", day: "numeric", timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatSystemStatusHistoryDuration(seconds) {
  if (seconds > 0 && seconds < 1) return getSystemStatusText("history.lessThanSecond");
  const parts = [];
  let remaining = Math.floor(seconds);
  for (const [size, unit] of [[86400, "day"], [3600, "hour"], [60, "minute"], [1, "second"]]) {
    const value = Math.floor(remaining / size);
    remaining %= size;
    if (value > 0 || (unit === "second" && parts.length === 0)) {
      parts.push(new Intl.NumberFormat(getSystemStatusHistoryLocale(), {
        style: "unit", unit, unitDisplay: "short", maximumFractionDigits: 0,
      }).format(value));
    }
  }
  return parts.join(" ");
}

function hasSystemStatusHistoryImpact(record) {
  return record.status === "degraded_performance" ||
    record.status === "partial_outage" || record.status === "major_outage" ||
    record.downtimeSeconds > 0 || record.maintenanceSeconds > 0;
}

function getSystemStatusHistoryImpactText(record) {
  const parts = [];
  if (record.downtimeSeconds > 0) {
    parts.push(`${getSystemStatusText("history.downtime")}: ${formatSystemStatusHistoryDuration(record.downtimeSeconds)}`);
  }
  if (record.maintenanceSeconds > 0) {
    parts.push(`${getSystemStatusText("history.maintenance")}: ${formatSystemStatusHistoryDuration(record.maintenanceSeconds)}`);
  }
  return parts.join(" · ");
}

function createSystemStatusHistoryText(tag, className, text) {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

function createSystemStatusHistoryCard(component) {
  const card = document.createElement("article");
  card.className = "system-status-history-card";
  card.dataset.component = component.id;
  const heading = createSystemStatusHistoryText("h3", "", getSystemStatusText(component.labelKey));
  const availability = component.availabilityPercent === null
    ? getSystemStatusText("history.availabilityUnknown")
    : getSystemStatusText("history.availability").replace("{value}",
      new Intl.NumberFormat(getSystemStatusHistoryLocale(), {
        style: "percent", maximumFractionDigits: 3,
      }).format(component.availabilityPercent / 100));
  const observed = getSystemStatusText(component.observedDays === 1
    ? "history.observedOne" : "history.observedMany").replace("{count}",
    new Intl.NumberFormat(getSystemStatusHistoryLocale()).format(component.observedDays));
  card.append(heading, createSystemStatusHistoryText("p", "system-status-history-summary", `${availability} · ${observed}`));

  if (component.history.length === 0) {
    card.append(createSystemStatusHistoryText("p", "system-status-history-empty", getSystemStatusText("history.noHistory")));
  } else {
    const range = `${formatSystemStatusHistoryDate(component.historyStartDate)} – ${formatSystemStatusHistoryDate(component.historyEndDate)}`;
    card.append(createSystemStatusHistoryText("p", "system-status-history-range",
      `${getSystemStatusText("history.dateRange")}: ${range}`));
    const strip = document.createElement("ol");
    strip.className = "system-status-history-strip";
    strip.setAttribute("aria-label", getSystemStatusText("history.chronological"));
    const crossYear = component.history[0].date.slice(0, 4) !== component.history.at(-1).date.slice(0, 4);
    if (crossYear) strip.dataset.crossYear = "true";
    component.history.forEach((record) => {
      const cell = document.createElement("li");
      cell.className = "system-status-history-cell";
      cell.dataset.status = record.status;
      cell.dataset.date = record.date;
      const date = createSystemStatusHistoryText("time", "system-status-history-cell-date", formatSystemStatusHistoryCellDate(record.date, crossYear));
      date.dateTime = record.date;
      date.setAttribute("aria-hidden", "true");
      const symbol = createSystemStatusHistoryText("span", "status-symbol", SYSTEM_STATUS_SYMBOLS[record.status]);
      symbol.setAttribute("aria-hidden", "true");
      const text = [formatSystemStatusHistoryDate(record.date), getSystemStatusLabel(record.status), getSystemStatusHistoryImpactText(record)].filter(Boolean).join(" · ");
      // Text remains available to assistive technology; symbols and the visible legend do not require hover.
      cell.append(date, symbol, createSystemStatusHistoryText("span", "system-status-history-cell-text", text));
      strip.append(cell);
    });
    card.append(strip);
  }

  card.append(createSystemStatusHistoryText("h4", "", getSystemStatusText("history.recentImpact")));
  const impacts = component.history.filter(hasSystemStatusHistoryImpact);
  if (impacts.length === 0) {
    card.append(createSystemStatusHistoryText("p", "system-status-history-empty", getSystemStatusText("history.noImpact")));
  } else {
    const list = document.createElement("ul");
    list.className = "system-status-history-impacts";
    impacts.slice().reverse().forEach((record) => {
      const row = document.createElement("li");
      const date = createSystemStatusHistoryText("time", "", formatSystemStatusHistoryDate(record.date));
      date.dateTime = record.date;
      row.append(date, createSystemStatusState(record.status, "status-chip"));
      const duration = getSystemStatusHistoryImpactText(record);
      if (duration) row.append(createSystemStatusHistoryText("span", "system-status-history-duration", duration));
      list.append(row);
    });
    card.append(list);
  }
  return card;
}

function renderSystemStatusHistory(container, history, state = "ready") {
  container.dataset.historyState = state;
  const content = container.querySelector(".system-status-history-content");
  const message = container.querySelector(".system-status-history-message");
  message.textContent = state === "loading" ? getSystemStatusText("history.loading")
    : state === "error" ? getSystemStatusText("history.unavailable") : getSystemStatusText("history.loaded");
  content.replaceChildren();
  if (!history) return;

  if (!history.complete) {
    content.append(createSystemStatusHistoryText("p", "system-status-history-notice", getSystemStatusText("history.incomplete")));
  }
  history.components.forEach((component) => content.append(createSystemStatusHistoryCard(component)));
  content.append(createSystemStatusHistoryText("p", "system-status-history-fetched",
    `${getSystemStatusText("history.fetched")}: ${formatSystemStatusTime(history.fetchedAt)}`));
  const legend = document.createElement("ul");
  legend.className = "system-status-history-legend";
  legend.setAttribute("aria-label", getSystemStatusText("history.legend"));
  SYSTEM_STATUS_VALUES.forEach((status) => {
    const item = document.createElement("li");
    item.append(createSystemStatusState(status, "status-chip"));
    legend.append(item);
  });
  content.append(legend);
}

async function loadSystemStatusHistory() {
  const container = document.getElementById("systemStatusHistory");
  if (!container) return;
  const requestSequence = ++systemStatusHistoryRequestSequence;
  activeSystemStatusHistoryRequestController?.abort();
  const controller = new AbortController();
  activeSystemStatusHistoryRequestController = controller;
  const timeoutId = setTimeout(() => {
    controller.abort();
    if (requestSequence === systemStatusHistoryRequestSequence) {
      renderSystemStatusHistory(container, null, "error");
    }
  }, SYSTEM_STATUS_HISTORY_REQUEST_TIMEOUT_MS);
  renderSystemStatusHistory(container, null, "loading");
  try {
    const response = await fetch(`${getHuihuiApiBase()}/api/system-status/history`, {
      signal: controller.signal, cache: "no-store",
    });
    if (!response.ok) throw new Error("API request failed");
    const history = getValidSystemStatusHistory(await response.json());
    if (controller.signal.aborted || requestSequence !== systemStatusHistoryRequestSequence) return;
    if (!history) throw new Error("Invalid API response");
    renderSystemStatusHistory(container, history);
  } catch (error) {
    if (requestSequence !== systemStatusHistoryRequestSequence) return;
    renderSystemStatusHistory(container, null, "error");
  } finally {
    clearTimeout(timeoutId);
    if (activeSystemStatusHistoryRequestController === controller) {
      activeSystemStatusHistoryRequestController = undefined;
    }
  }
}

function isSystemStatusIncidentInstant(value) {
  // B3.1 emits canonical UTC instants; reject calendar rollover and ambiguous dates.
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function isSystemStatusIncidentUrl(value) {
  // Validate raw input as well as URL properties: normalization must not repair paths.
  if (typeof value !== "string" || !/^https:\/\/[^/?#\\@\s]+\/incident\/[A-Za-z0-9_-]{1,128}$/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.href === value && url.protocol === "https:" && !url.port &&
      !url.username && !url.password && !url.search && !url.hash;
  } catch (error) {
    return false;
  }
}

function getValidSystemStatusIncidents(data) {
  if (!isSystemStatusHistoryObject(data) || data.ok !== true || data.source !== "better_stack" ||
    !Array.isArray(data.reports) || data.reports.length > 20 ||
    !isSystemStatusIncidentInstant(data.fetchedAt)) return null;
  const keys = new Set();
  const reports = [];
  let previousLatest = Infinity;
  let incidentOrigin;
  for (const report of data.reports) {
    if (!isSystemStatusHistoryObject(report) || typeof report.key !== "string" ||
      report.key.length !== 64 || !/^[a-f0-9]{64}$/.test(report.key) || keys.has(report.key) ||
      typeof report.title !== "string" || !report.title.trim() || report.title.length > 200 ||
      !isSystemStatusIncidentUrl(report.url) || !Array.isArray(report.updates) ||
      report.updates.length < 1 || report.updates.length > 20) return null;
    // B3.1 authenticates the configured provider origin; B3.2 requires payload consistency.
    const reportOrigin = new URL(report.url).origin;
    if (incidentOrigin !== undefined && reportOrigin !== incidentOrigin) return null;
    incidentOrigin = reportOrigin;
    keys.add(report.key);
    const seen = new Set();
    const updates = [];
    let previousTime = -Infinity;
    for (const update of report.updates) {
      if (!isSystemStatusHistoryObject(update) || !isSystemStatusIncidentInstant(update.publishedAt) ||
        typeof update.message !== "string" || !update.message.trim() || update.message.length > 4000) return null;
      const time = Date.parse(update.publishedAt);
      const identity = JSON.stringify([time, update.message]);
      if (time < previousTime || seen.has(identity)) return null;
      seen.add(identity);
      previousTime = time;
      updates.push({ publishedAt: update.publishedAt, message: update.message });
    }
    if (previousTime > previousLatest) return null;
    previousLatest = previousTime;
    // Keys identify provider records only; they never enter the presentation model.
    reports.push({ title: report.title, url: report.url, updates });
  }
  return { reports, fetchedAt: data.fetchedAt };
}

function formatSystemStatusIncidentTime(value) {
  const locale = typeof getCurrentLocale === "function" ? getCurrentLocale() : "zh";
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-Hant" : locale, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short",
  }).format(new Date(value));
}

function createSystemStatusIncidentText(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function createSystemStatusIncidentTime(value) {
  const time = createSystemStatusIncidentText("time", "", formatSystemStatusIncidentTime(value));
  time.dateTime = value;
  return time;
}

function createSystemStatusIncidentReport(report) {
  const article = document.createElement("article");
  article.className = "system-status-incident";
  const header = document.createElement("header");
  const title = createSystemStatusIncidentText("h3", "", report.title);
  const link = createSystemStatusIncidentText("a", "status-link system-status-incident-link", getSystemStatusText("incidents.viewReport"));
  link.href = report.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.setAttribute("aria-label", `${getSystemStatusText("incidents.viewReport")}: ${report.title}`);
  header.append(title, link);
  const updates = document.createElement("ol");
  updates.className = "system-status-incident-updates";
  updates.setAttribute("aria-label", getSystemStatusText("incidents.chronological"));
  report.updates.forEach((update) => {
    const item = document.createElement("li");
    item.append(createSystemStatusIncidentTime(update.publishedAt),
      createSystemStatusIncidentText("p", "system-status-incident-message", update.message));
    updates.append(item);
  });
  article.append(header, updates);
  return article;
}

function renderSystemStatusIncidents(container, incidents, state = "ready") {
  container.dataset.incidentsState = state;
  const message = container.querySelector(".system-status-incidents-message");
  const content = container.querySelector(".system-status-incidents-content");
  const populated = state === "ready" && incidents?.reports.length > 0;
  message.classList.toggle("system-status-incidents-announcement", populated);
  message.textContent = getSystemStatusText(`incidents.${state === "loading" ? "loading"
    : state === "error" ? "unavailable" : populated ? "loaded" : "empty"}`);
  content.replaceChildren();
  if (state !== "ready" || !incidents) return;
  incidents.reports.forEach((report) => content.append(createSystemStatusIncidentReport(report)));
  const fetched = createSystemStatusIncidentText("p", "system-status-incidents-fetched", `${getSystemStatusText("incidents.fetched")}: `);
  fetched.append(createSystemStatusIncidentTime(incidents.fetchedAt));
  content.append(fetched);
}

async function loadSystemStatusIncidents() {
  const container = document.getElementById("systemStatusIncidents");
  if (!container) return;
  if (!systemStatusIncidentsLifecycleReady) {
    systemStatusIncidentsLifecycleReady = true;
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) loadSystemStatusIncidents();
    });
  }
  const requestSequence = ++systemStatusIncidentsRequestSequence;
  activeSystemStatusIncidentsRequestController?.abort();
  const controller = new AbortController();
  activeSystemStatusIncidentsRequestController = controller;
  const isCurrent = () => requestSequence === systemStatusIncidentsRequestSequence &&
    document.getElementById("systemStatusIncidents") === container;
  const onPageHide = () => {
    if (requestSequence === systemStatusIncidentsRequestSequence) systemStatusIncidentsRequestSequence += 1;
    controller.abort();
  };
  window.addEventListener("pagehide", onPageHide, { once: true });
  const timeoutId = setTimeout(() => {
    controller.abort();
    if (isCurrent()) renderSystemStatusIncidents(container, null, "error");
  }, SYSTEM_STATUS_INCIDENTS_REQUEST_TIMEOUT_MS);
  renderSystemStatusIncidents(container, null, "loading");
  try {
    const response = await fetch(`${getHuihuiApiBase()}/api/system-status/incidents`, {
      signal: controller.signal, cache: "no-store",
    });
    if (!response.ok) throw new Error("API request failed");
    const incidents = getValidSystemStatusIncidents(await response.json());
    if (controller.signal.aborted || !isCurrent()) return;
    if (!incidents) throw new Error("Invalid API response");
    renderSystemStatusIncidents(container, incidents);
  } catch (error) {
    if (isCurrent()) renderSystemStatusIncidents(container, null, "error");
  } finally {
    clearTimeout(timeoutId);
    window.removeEventListener("pagehide", onPageHide);
    if (activeSystemStatusIncidentsRequestController === controller) activeSystemStatusIncidentsRequestController = undefined;
  }
}

function initHomeCards() {
  if (homeCardsReady) return;

  homeCardsReady = true;
  loadSystemStatus();
  loadSystemStatusHistory();
  loadSystemStatusIncidents();
  loadTechNews();
  loadInfrastructureStatus();
}
