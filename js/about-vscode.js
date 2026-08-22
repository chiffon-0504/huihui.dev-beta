const ABOUT_VSCODE_LABELS = {
  zh: {
    workspace: "huihuidev.py 個人檔案程式碼工作區",
    editor: "huihuidev.py 原始碼",
  },
  en: {
    workspace: "huihuidev.py profile code workspace",
    editor: "huihuidev.py source code",
  },
  ja: {
    workspace: "huihuidev.py プロフィールコードのワークスペース",
    editor: "huihuidev.py ソースコード",
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
    branch:
      '<circle cx="6" cy="5" r="2"></circle><circle cx="18" cy="6" r="2"></circle><circle cx="6" cy="19" r="2"></circle><path d="M6 7v10M8 7c5.8 0 4.2 7 8 7h2"></path>',
    explorer:
      '<path d="M7 3.5h8.5L20 8v12.5H7z"></path><path d="M15.5 3.5V8H20M4 7.5h3M4 11.5h3M4 15.5h3"></path>',
    extensions:
      '<rect x="4" y="4" width="6" height="6" rx="1"></rect><rect x="14" y="4" width="6" height="6" rx="1"></rect><rect x="4" y="14" width="6" height="6" rx="1"></rect><path d="M17 13v8M13 17h8"></path>',
    run:
      '<path d="M7 4.5 18 12 7 19.5z"></path><path d="M15 4.5h4.5V9"></path>',
    search:
      '<circle cx="10.5" cy="10.5" r="6"></circle><path d="m15 15 5 5"></path>',
    settings:
      '<circle cx="12" cy="12" r="3"></circle><path d="M12 2.8v2.1M12 19.1v2.1M2.8 12h2.1M19.1 12h2.1M5.5 5.5 7 7M17 17l1.5 1.5M18.5 5.5 17 7M7 17l-1.5 1.5"></path>',
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

function renderAboutVscodeExplorer() {
  const tree = ABOUT_VSCODE_TREE.map(([name, type]) => {
    const marker = type === "folder" ? "›" : "";
    const icon =
      type === "folder"
        ? "vscode-tree-folder"
        : `vscode-tree-file vscode-tree-${type}`;
    return `
      <div class="vscode-tree-row">
        <span class="vscode-tree-chevron">${marker}</span>
        <span class="${icon}"></span>
        <span class="vscode-tree-name">${name}</span>
      </div>
    `;
  }).join("");

  return `
    <aside class="vscode-explorer" aria-hidden="true">
      <div class="vscode-explorer-heading">
        <span>檔案總管</span><span class="vscode-ellipsis">•••</span>
      </div>
      <div class="vscode-explorer-section">
        <div class="vscode-section-title"><span>⌄</span> 已開啟的編輯器</div>
        <div class="vscode-open-editor">
          <span class="vscode-python-mark">●</span>
          <span>huihuidev.py</span>
          <span class="vscode-editor-close">×</span>
        </div>
      </div>
      <div class="vscode-explorer-section vscode-repository-tree">
        <div class="vscode-section-title"><span>⌄</span> HUIHUI.DEV-BETA</div>
        <div class="vscode-tree">${tree}</div>
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
      <span class="vscode-menu-mark">☰</span>
      <span class="vscode-title-spacer"></span>
      <span class="vscode-history">←</span>
      <span class="vscode-history">→</span>
      <span class="vscode-command-center">huihui.dev-beta</span>
      <span class="vscode-title-tools">● &nbsp; 50 &nbsp; ◇ &nbsp; ◫ &nbsp; ◧</span>
      <span class="vscode-window-controls">─　□　×</span>
    </div>
  `;
}

function renderAboutVscodeTerminal() {
  return `
    <div class="vscode-terminal" aria-hidden="true">
      <div class="vscode-terminal-tabs">
        <span>問題</span><span>輸出</span><span>偵錯主控台</span>
        <span class="is-active">終端機</span><span>連接埠</span>
        <span class="vscode-terminal-spacer"></span>
        <span>＋⌄　▣　♲　•••　⌃　×</span>
      </div>
      <pre class="vscode-terminal-output"><span class="vscode-terminal-prompt">●</span> PS D:\\VSCode\\huihui.dev-beta&gt; <span class="vscode-terminal-command">git status</span>
On branch main
Your branch is up to date with 'origin/main'.

nothing to commit, working tree clean
PS D:\\VSCode\\huihui.dev-beta&gt; <span class="vscode-terminal-caret"> </span></pre>
    </div>
  `;
}

function renderAboutVscodeStatusbar() {
  return `
    <footer class="vscode-statusbar" aria-hidden="true">
      <span>〉</span><span>⑂ main</span><span>↻</span><span>⑂</span><span>🚀</span><span>🔗 Launchpad</span>
      <span>ⓧ 0</span><span>△ 0</span>
      <span class="vscode-status-spacer"></span>
      <span>第 33 行，第 47 欄</span><span>空格: 4</span><span>UTF-8</span><span>CRLF</span>
      <span>{ } Python</span><span>Python 3.14 (64-bit)</span><span>◉ Go Live</span><span>✓ Prettier</span><span>♧</span>
    </footer>
  `;
}

function renderAboutVscodeMinimap() {
  const widths = [68, 42, 76, 55, 84, 34, 72, 61, 48, 78, 52, 88, 39, 65, 74, 44, 82, 58];
  return `
    <div class="vscode-minimap" aria-hidden="true">
      ${widths
        .map(
          (width, index) =>
            `<span style="--minimap-width:${width}%;--minimap-indent:${(index % 4) * 7}%"></span>`,
        )
        .join("")}
    </div>
  `;
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
  tabActions.append(copyButton, copyStatus);
  header.classList.add("vscode-tabbar");
  header.replaceChildren(left, tabActions);

  const editorScroll = document.createElement("div");
  editorScroll.className = "vscode-editor-scroll";
  editorScroll.setAttribute("role", "region");
  editorScroll.setAttribute("aria-label", labels.editor);
  editorScroll.tabIndex = 0;
  editorScroll.append(pre);

  const editorViewport = document.createElement("div");
  editorViewport.className = "vscode-editor-viewport";
  editorViewport.append(editorScroll);
  editorViewport.insertAdjacentHTML("beforeend", renderAboutVscodeMinimap());

  const breadcrumb = document.createElement("div");
  breadcrumb.className = "vscode-breadcrumb";
  breadcrumb.setAttribute("aria-hidden", "true");
  breadcrumb.innerHTML =
    "<span>D:</span><b>›</b><span>VSCode</span><b>›</b><span class=\"vscode-python-mark\">●</span><span>huihuidev.py</span><b>›</b><span>HuiHui</span><b>›</b><span>__init__</span>";

  const editor = document.createElement("div");
  editor.className = "vscode-editor-area";
  editor.append(header, breadcrumb, editorViewport);
  editor.insertAdjacentHTML("beforeend", renderAboutVscodeTerminal());

  const workbench = document.createElement("div");
  workbench.className = "vscode-workbench";
  workbench.innerHTML = `${renderAboutVscodeActivityBar()}${renderAboutVscodeExplorer()}`;
  workbench.append(editor);
  workbench.insertAdjacentHTML("beforeend", renderAboutVscodeStatusbar());

  wrapper.replaceChildren();
  wrapper.insertAdjacentHTML("afterbegin", renderAboutVscodeTitlebar());
  wrapper.append(workbench);
}

document.addEventListener("DOMContentLoaded", () => {
  requestAnimationFrame(() => {
    initAboutVscodeWorkspace();
  });
});
