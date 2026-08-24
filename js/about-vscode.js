const ABOUT_VSCODE_LABELS = {
  zh: {
    workspace: "huihuidev.py 個人檔案程式碼工作區",
    editor: "huihuidev.py 原始碼",
    explorer: "檔案總管",
    openEditors: "已開啟的編輯器",
    outline: "大綱",
    timeline: "時間表",
    problems: "問題",
    output: "輸出",
    debugConsole: "偵錯主控台",
    terminal: "終端機",
    ports: "連接埠",
    lineColumn: "第 3 行，第 1 欄",
    spaces: "空格: 4",
  },
  en: {
    workspace: "huihuidev.py profile code workspace",
    editor: "huihuidev.py source code",
    explorer: "Explorer",
    openEditors: "Open Editors",
    outline: "Outline",
    timeline: "Timeline",
    problems: "Problems",
    output: "Output",
    debugConsole: "Debug Console",
    terminal: "Terminal",
    ports: "Ports",
    lineColumn: "Ln 3, Col 1",
    spaces: "Spaces: 4",
  },
  ja: {
    workspace: "huihuidev.py プロフィールコードのワークスペース",
    editor: "huihuidev.py ソースコード",
    explorer: "エクスプローラー",
    openEditors: "開いているエディター",
    outline: "アウトライン",
    timeline: "タイムライン",
    problems: "問題",
    output: "出力",
    debugConsole: "デバッグ コンソール",
    terminal: "ターミナル",
    ports: "ポート",
    lineColumn: "行 3、列 1",
    spaces: "スペース: 4",
  },
};

const ABOUT_VSCODE_TREE = [
  ["contact", "folder"],
  ["css", "folder"],
  ["en", "folder"],
  ["images", "folder"],
  ["ja", "folder"],
  ["js", "folder"],
  ["milestones", "folder"],
  ["tests", "folder"],
  ["tools", "folder"],
  ["vendor", "folder"],
  ["workers", "folder"],
  ["works", "folder"],
  ["_headers", "text"],
  ["_redirects", "text"],
  [".gitattributes", "git"],
  [".gitignore", "git"],
  ["404.html", "html"],
  ["AGENTS.md", "markdown"],
  ["index.html", "html"],
  ["package-lock.json", "json"],
  ["package.json", "json"],
  ["playwright.base.config.mjs", "javascript"],
  ["playwright.config.mjs", "javascript"],
];

function getAboutVscodeLabels() {
  const locale = typeof getCurrentLocale === "function" ? getCurrentLocale() : "zh";
  return ABOUT_VSCODE_LABELS[locale] || ABOUT_VSCODE_LABELS.zh;
}

function renderAboutVscodeIcon(name) {
  const paths = {
    account:
      '<circle cx="12" cy="8" r="3.2"></circle><path d="M5.8 19.2c.9-3.5 3-5.2 6.2-5.2s5.3 1.7 6.2 5.2"></path>',
    assistant:
      '<path d="M12 3.4c1.9 0 3.4 1.5 3.4 3.4 1.7-.9 3.8-.3 4.7 1.4.9 1.7.3 3.8-1.4 4.7 1.7.9 2.3 3 1.4 4.7-.9 1.7-3 2.3-4.7 1.4 0 1.9-1.5 3.4-3.4 3.4S8.6 20.9 8.6 19c-1.7.9-3.8.3-4.7-1.4-.9-1.7-.3-3.8 1.4-4.7-1.7-.9-2.3-3-1.4-4.7.9-1.7 3-2.3 4.7-1.4 0-1.9 1.5-3.4 3.4-3.4Z"></path><circle cx="12" cy="12.9" r="3.3"></circle>',
    branch:
      '<circle cx="6" cy="5" r="2"></circle><circle cx="18" cy="6" r="2"></circle><circle cx="6" cy="19" r="2"></circle><path d="M6 7v10M8 7c5.8 0 4.2 7 8 7h2"></path>',
    explorer:
      '<path d="M7 3.5h8.5L20 8v12.5H7z"></path><path d="M15.5 3.5V8H20M4 7.5h3M4 11.5h3M4 15.5h3"></path>',
    extensions:
      '<rect x="4" y="4" width="6" height="6" rx="1"></rect><rect x="14" y="4" width="6" height="6" rx="1"></rect><rect x="4" y="14" width="6" height="6" rx="1"></rect><path d="M17 13v8M13 17h8"></path>',
    graph:
      '<circle cx="6" cy="5" r="2"></circle><circle cx="17.5" cy="8" r="2"></circle><circle cx="8" cy="19" r="2"></circle><path d="M7.8 6.2 15.7 7.6M16.1 9.6 9.3 17.4M6.5 7l1.1 10"></path>',
    history:
      '<circle cx="12" cy="12" r="7.5"></circle><path d="M12 7.7V12l3.2 2M5.5 5.5 3.8 8.8 7.3 9"></path>',
    layout:
      '<rect x="3.5" y="4" width="17" height="16" rx="1.5"></rect><path d="M12 4v16M3.5 14.5H12"></path>',
    panel:
      '<rect x="3.5" y="4" width="17" height="16" rx="1.5"></rect><path d="M3.5 14.5h17"></path>',
    python:
      '<path d="M12 3.5c-4 0-4.5 1.8-4.5 4.1V10h8.8c2.1 0 3.7 1.7 3.7 3.8v2.1c0 2.5-2.1 4.6-4.6 4.6H12v-3.2"></path><path d="M12 20.5c4 0 4.5-1.8 4.5-4.1V14H7.7A3.7 3.7 0 0 1 4 10.2V8.1c0-2.5 2.1-4.6 4.6-4.6H12v3.2"></path><circle cx="9.1" cy="6.6" r=".7" fill="currentColor" stroke="none"></circle><circle cx="14.9" cy="17.4" r=".7" fill="currentColor" stroke="none"></circle>',
    remote:
      '<rect x="3.5" y="5" width="17" height="12" rx="1.5"></rect><path d="M8.5 21h7M12 17v4"></path>',
    run:
      '<path d="M7 4.5 18 12 7 19.5z"></path><path d="M15 4.5h4.5V9"></path>',
    search:
      '<circle cx="10.5" cy="10.5" r="6"></circle><path d="m15 15 5 5"></path>',
    settings:
      '<circle cx="12" cy="12" r="3"></circle><path d="M12 2.8v2.1M12 19.1v2.1M2.8 12h2.1M19.1 12h2.1M5.5 5.5 7 7M17 17l1.5 1.5M18.5 5.5 17 7M7 17l-1.5 1.5"></path>',
    sidebar:
      '<rect x="3.5" y="4" width="17" height="16" rx="1.5"></rect><path d="M9 4v16"></path>',
    split:
      '<rect x="3.5" y="4" width="17" height="16" rx="1.5"></rect><path d="M12 4v16"></path>',
    testing:
      '<path d="M9 3h6M10 3v5l-5 9.2A2.5 2.5 0 0 0 7.2 21h9.6a2.5 2.5 0 0 0 2.2-3.8L14 8V3"></path><path d="M7.5 16h9"></path>',
  };

  return `
    <svg class="vscode-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      ${paths[name] || paths.explorer}
    </svg>
  `;
}

function renderAboutVscodeActivityBar() {
  const primary = [
    ["explorer", "is-active"],
    ["search", ""],
    ["branch", ""],
    ["run", ""],
    ["extensions", ""],
    ["testing", ""],
    ["graph", ""],
    ["history", ""],
    ["python", ""],
    ["remote", ""],
  ];

  return `
    <aside class="vscode-activity-bar" aria-hidden="true">
      <div class="vscode-activity-primary">
        ${primary
          .map(
            ([icon, className]) =>
              `<span class="vscode-activity-item ${className}">${renderAboutVscodeIcon(icon)}</span>`,
          )
          .join("")}
      </div>
      <div class="vscode-activity-secondary">
        <span class="vscode-activity-item">${renderAboutVscodeIcon("account")}</span>
        <span class="vscode-activity-item">${renderAboutVscodeIcon("settings")}</span>
      </div>
    </aside>
  `;
}

function renderAboutVscodeExplorer(labels) {
  const tree = ABOUT_VSCODE_TREE.map(([name, type]) => {
    const marker = type === "folder" ? "›" : "";
    const fileMarks = {
      git: "◆",
      html: "‹›",
      javascript: "JS",
      json: "{}",
      markdown: "↓",
      text: "≡",
    };
    const icon =
      type === "folder"
        ? "vscode-tree-folder"
        : `vscode-tree-file vscode-tree-${type}`;
    return `
      <div class="vscode-tree-row">
        <span class="vscode-tree-chevron">${marker}</span>
        <span class="${icon}">${type === "folder" ? "" : fileMarks[type] || ""}</span>
        <span class="vscode-tree-name">${name}</span>
      </div>
    `;
  }).join("");

  return `
    <aside class="vscode-explorer" aria-hidden="true">
      <div class="vscode-explorer-heading">
        <span>${labels.explorer}</span><span class="vscode-ellipsis">•••</span>
      </div>
      <div class="vscode-explorer-section">
        <div class="vscode-section-title"><span>⌄</span> ${labels.openEditors}</div>
      </div>
      <div class="vscode-explorer-section vscode-repository-tree">
        <div class="vscode-section-title"><span>⌄</span> HUIHUI.DEV-BETA</div>
        <div class="vscode-tree">${tree}</div>
      </div>
      <div class="vscode-explorer-footer">
        <div class="vscode-explorer-footer-row"><span>›</span> ${labels.outline}</div>
        <div class="vscode-explorer-footer-row"><span>›</span> ${labels.timeline}</div>
      </div>
    </aside>
  `;
}

function renderAboutVscodeTitlebar() {
  return `
    <div class="vscode-titlebar" aria-hidden="true">
      <span class="vscode-brand-mark">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M16.7 2.8 9.4 9.3 5.2 6.1 2.8 8.2l4.1 3.8-4.1 3.8 2.4 2.1 4.2-3.2 7.3 6.5 4.5-2.1V4.9zM16.5 8v8l-4.4-4z"></path>
        </svg>
      </span>
      <span class="vscode-menu-mark"><i></i><i></i><i></i></span>
      <span class="vscode-title-spacer"></span>
      <span class="vscode-history"><span>←</span><span>→</span></span>
      <span class="vscode-command-center">
        <span>huihui.dev-beta</span><span class="vscode-command-spacer"></span>
        <span class="vscode-command-indicator"></span><span>50</span>
        <span class="vscode-command-separator"></span>
        <span class="vscode-command-assistant">${renderAboutVscodeIcon("assistant")}</span><span>⌄</span>
      </span>
      <span class="vscode-title-tools">
        <span class="vscode-title-cube">◆</span>
        ${renderAboutVscodeIcon("sidebar")}
        ${renderAboutVscodeIcon("layout")}
        ${renderAboutVscodeIcon("panel")}
        ${renderAboutVscodeIcon("split")}
      </span>
      <span class="vscode-window-controls"><span>−</span><span>□</span><span>×</span></span>
    </div>
  `;
}

function renderAboutVscodeTerminal(labels) {
  return `
    <div class="vscode-terminal" aria-hidden="true">
      <div class="vscode-terminal-tabs">
        <span>${labels.problems}</span><span>${labels.output}</span><span>${labels.debugConsole}</span><span class="is-active">${labels.terminal}</span><span>${labels.ports}</span>
        <span class="vscode-terminal-spacer"></span>
        <span class="vscode-terminal-tools">
          <span class="vscode-terminal-add">＋</span><span class="vscode-terminal-chevron">⌄</span>
          <span class="vscode-terminal-shell">▣&nbsp; powershell</span>
          <span>${renderAboutVscodeIcon("split")}</span><span>♲</span><span>•••</span>
          <i></i><span>⌃</span><span>×</span>
        </span>
      </div>
      <pre class="vscode-terminal-output"><span class="vscode-terminal-prompt">●</span> PS D:\\VSCode\\huihui.dev-beta&gt; <span class="vscode-terminal-command">git status</span>
On branch main
Your branch is up to date with 'origin/main'.

nothing to commit, working tree clean
PS D:\\VSCode\\huihui.dev-beta&gt; <span class="vscode-terminal-caret"> </span></pre>
    </div>
  `;
}

function renderAboutVscodeStatusbar(labels) {
  return `
    <footer class="vscode-statusbar" aria-hidden="true">
      <span>〉</span><span>⑂ main</span><span>↻</span><span>⑂</span><span>♢</span><span>♧ Launchpad</span>
      <span>ⓧ 0</span><span>△ 0</span>
      <span class="vscode-status-spacer"></span>
      <span>${labels.lineColumn}</span><span>${labels.spaces}</span><span>UTF-8</span><span>CRLF</span>
      <span>{ } Python</span><span>♧&nbsp; Python 3.14 (64-bit)</span><span>◉ Go Live</span><span>✓ Prettier</span><span>♧</span>
    </footer>
  `;
}

function initAboutVscodeScrollStage(wrapper, verticalLayer) {
  const stage = document.createElement("div");
  let enabled = true;
  let stageStart = 0;
  let stageScrollableDistance = 0;
  let maxEditorScroll = 0;
  let scrollFrame = null;
  let measureFrame = null;

  stage.className = "vscode-scroll-stage";
  wrapper.before(stage);
  stage.append(wrapper);

  const syncEditorScroll = () => {
    scrollFrame = null;
    if (!enabled) return;
    const progress =
      stageScrollableDistance > 0
        ? Math.min(
            Math.max((window.scrollY - stageStart) / stageScrollableDistance, 0),
            1,
          )
        : 0;

    verticalLayer.scrollTop = progress * maxEditorScroll;
  };

  const requestScrollSync = () => {
    if (!enabled) return;
    if (scrollFrame !== null) return;
    scrollFrame = requestAnimationFrame(syncEditorScroll);
  };

  const measureStage = () => {
    measureFrame = null;
    if (!enabled) return;
    const workspaceHeight = wrapper.offsetHeight;
    const stickyTop = Math.max(
      0,
      Math.min(120, (window.innerHeight - workspaceHeight) / 2),
    );

    maxEditorScroll = Math.max(
      0,
      verticalLayer.scrollHeight - verticalLayer.clientHeight,
    );
    stageScrollableDistance = maxEditorScroll;

    const stageHeight = workspaceHeight + stageScrollableDistance;
    const nextHeight = `${stageHeight}px`;
    const nextStickyTop = `${stickyTop}px`;

    if (stage.style.height !== nextHeight) stage.style.height = nextHeight;
    if (stage.style.getPropertyValue("--vscode-sticky-top") !== nextStickyTop) {
      stage.style.setProperty("--vscode-sticky-top", nextStickyTop);
    }

    stageStart = window.scrollY + stage.getBoundingClientRect().top - stickyTop;
    stage.dataset.scrollStageStart = String(stageStart);
    stage.dataset.scrollStageDistance = String(stageScrollableDistance);
    stage.dataset.scrollStageReady = "true";
    requestScrollSync();
  };

  const requestStageMeasure = () => {
    if (!enabled) return;
    if (measureFrame !== null) return;
    measureFrame = requestAnimationFrame(measureStage);
  };

  measureStage();
  requestStageMeasure();
  window.addEventListener("scroll", requestScrollSync, { passive: true });
  window.addEventListener("resize", requestStageMeasure, { passive: true });

  if (typeof ResizeObserver === "function") {
    const resizeObserver = new ResizeObserver(requestStageMeasure);
    resizeObserver.observe(wrapper);
  }

  return {
    setEnabled(nextEnabled) {
      if (enabled === nextEnabled) return;
      enabled = nextEnabled;

      if (!enabled) {
        if (scrollFrame !== null) cancelAnimationFrame(scrollFrame);
        if (measureFrame !== null) cancelAnimationFrame(measureFrame);
        scrollFrame = null;
        measureFrame = null;
        delete stage.dataset.scrollStageReady;
        return;
      }

      measureStage();
      requestStageMeasure();
    },
  };
}

function initAboutVscodeMotionBehavior(wrapper, editorScroll, verticalLayer) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let stageController = null;

  const handleEditorKeydown = (event) => {
    if (!reducedMotion.matches) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const maxScroll = verticalLayer.scrollHeight - verticalLayer.clientHeight;
    const code = verticalLayer.querySelector("code");
    const lineHeight = Number.parseFloat(getComputedStyle(code).lineHeight) || 16;
    const pageStep = verticalLayer.clientHeight * 0.9;
    let nextScrollTop;

    switch (event.key) {
      case "ArrowDown":
        nextScrollTop = verticalLayer.scrollTop + lineHeight;
        break;
      case "ArrowUp":
        nextScrollTop = verticalLayer.scrollTop - lineHeight;
        break;
      case "PageDown":
        nextScrollTop = verticalLayer.scrollTop + pageStep;
        break;
      case "PageUp":
        nextScrollTop = verticalLayer.scrollTop - pageStep;
        break;
      case " ":
        nextScrollTop =
          verticalLayer.scrollTop + (event.shiftKey ? -pageStep : pageStep);
        break;
      case "Home":
        nextScrollTop = 0;
        break;
      case "End":
        nextScrollTop = maxScroll;
        break;
      default:
        return;
    }

    const clampedScrollTop = Math.max(0, Math.min(nextScrollTop, maxScroll));
    if (clampedScrollTop === verticalLayer.scrollTop) return;

    event.preventDefault();
    verticalLayer.scrollTop = clampedScrollTop;
  };

  const applyMotionPreference = () => {
    if (reducedMotion.matches) {
      stageController?.setEnabled(false);
      return;
    }

    if (stageController) {
      stageController.setEnabled(true);
    } else {
      stageController = initAboutVscodeScrollStage(wrapper, verticalLayer);
    }
  };

  applyMotionPreference();
  reducedMotion.addEventListener("change", applyMotionPreference);
  editorScroll.addEventListener("keydown", handleEditorKeydown);
}

function initAboutVscodeWorkspace() {
  const wrapper = document.querySelector(".about-page .code-block");
  const pre = wrapper?.querySelector(":scope > pre");
  const header = wrapper?.querySelector(":scope > .code-header");

  if (!wrapper || !pre || !header || wrapper.dataset.vscodeReady === "true") return;

  const labels = getAboutVscodeLabels();
  const file = header.querySelector(".code-file");
  const language = header.querySelector(".code-lang");
  const left = header.querySelector(".code-left");
  const copyButton = header.querySelector(".copy-btn");
  const copyStatus = header.querySelector(".code-copy-status");

  if (!file || !language || !left || !copyButton || !copyStatus) return;

  wrapper.classList.add("vscode-window");
  wrapper.dataset.vscodeReady = "true";
  wrapper.setAttribute("role", "region");
  wrapper.setAttribute("aria-label", labels.workspace);

  file.textContent = "huihuidev.py";
  language.textContent = "Python";

  const pythonMark = document.createElement("span");
  pythonMark.className = "vscode-python-mark";
  pythonMark.setAttribute("aria-hidden", "true");
  pythonMark.textContent = "●";
  const closeMark = document.createElement("span");
  closeMark.className = "vscode-tab-close";
  closeMark.setAttribute("aria-hidden", "true");
  closeMark.textContent = "×";
  left.prepend(pythonMark);
  left.append(closeMark);

  const tabActions = document.createElement("div");
  tabActions.className = "vscode-tab-actions";
  tabActions.innerHTML = `
    <span class="vscode-editor-tool">${renderAboutVscodeIcon("run")}</span>
    <span class="vscode-editor-tool vscode-editor-tool-chevron" aria-hidden="true">⌄</span>
    <span class="vscode-editor-tool vscode-editor-tool-assistant" aria-hidden="true">${renderAboutVscodeIcon("assistant")}</span>
    <span class="vscode-editor-tool" aria-hidden="true">${renderAboutVscodeIcon("split")}</span>
  `;
  copyButton.classList.add("vscode-copy-control");
  copyButton.setAttribute("aria-hidden", "true");
  copyButton.tabIndex = -1;
  tabActions.append(copyButton);
  tabActions.insertAdjacentHTML(
    "beforeend",
    '<span class="vscode-editor-tool vscode-editor-tool-more" aria-hidden="true">•••</span>',
  );
  tabActions.append(copyStatus);
  header.classList.add("vscode-tabbar");
  header.replaceChildren(left, tabActions);

  const editorScroll = document.createElement("div");
  editorScroll.className = "vscode-editor-scroll";
  editorScroll.setAttribute("role", "region");
  editorScroll.setAttribute("aria-label", labels.editor);
  editorScroll.tabIndex = 0;
  pre.removeAttribute("tabindex");

  const verticalLayer = document.createElement("div");
  verticalLayer.className = "vscode-editor-vertical";
  verticalLayer.append(pre);
  editorScroll.append(verticalLayer);

  const editorViewport = document.createElement("div");
  editorViewport.className = "vscode-editor-viewport";
  editorViewport.append(editorScroll);

  const breadcrumb = document.createElement("div");
  breadcrumb.className = "vscode-breadcrumb";
  breadcrumb.setAttribute("aria-hidden", "true");
  breadcrumb.innerHTML =
    "<span>D:</span><b>›</b><span>VSCode</span><b>›</b><span class=\"vscode-python-mark\">●</span><span>huihuidev.py</span><b>›</b><span>…</span>";

  const editor = document.createElement("div");
  editor.className = "vscode-editor-area";
  editor.append(header, breadcrumb, editorViewport);
  editor.insertAdjacentHTML("beforeend", renderAboutVscodeTerminal(labels));

  const workbench = document.createElement("div");
  workbench.className = "vscode-workbench";
  workbench.innerHTML = `${renderAboutVscodeActivityBar()}${renderAboutVscodeExplorer(labels)}`;
  workbench.append(editor);
  workbench.insertAdjacentHTML("beforeend", renderAboutVscodeStatusbar(labels));

  wrapper.replaceChildren();
  wrapper.insertAdjacentHTML("afterbegin", renderAboutVscodeTitlebar());
  wrapper.append(workbench);
  initAboutVscodeMotionBehavior(wrapper, editorScroll, verticalLayer);
}

document.addEventListener("DOMContentLoaded", () => {
  requestAnimationFrame(() => {
    initAboutVscodeWorkspace();
  });
});
