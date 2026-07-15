function copyCode(button) {
  const code = button.closest(".code-block").querySelector("code").innerText;
  const original = button.innerHTML;

  navigator.clipboard.writeText(code).then(() => {
    button.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M20 6L9 17l-5-5"></path>
      </svg>
    `;

    setTimeout(() => {
      button.innerHTML = original;
    }, 1200);
  }).catch(() => {
    button.innerHTML = original;
    alert("複製失敗");
  });
}

function formatLangLabel(lang) {
  const map = {
    python: "Python",
    javascript: "JavaScript",
    css: "CSS",
    markup: "HTML",
    html: "HTML",
    js: "JavaScript",
    typescript: "TypeScript",
    ts: "TypeScript",
    json: "JSON",
    bash: "Bash",
    shell: "Shell",
    sh: "Shell",
    swift: "Swift"
  };

  return map[lang] || lang.toUpperCase();
}

function highlightKeywordInTextNode(textNode, keyword, className) {
  const text = textNode.textContent;
  if (!text.includes(keyword)) return;

  const fragment = document.createDocumentFragment();
  let lastIndex = 0;
  let index = text.indexOf(keyword);

  while (index !== -1) {
    if (index > lastIndex) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex, index)));
    }

    const span = document.createElement("span");
    span.className = className;
    span.textContent = keyword;
    fragment.appendChild(span);

    lastIndex = index + keyword.length;
    index = text.indexOf(keyword, lastIndex);
  }

  if (lastIndex < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
  }

  textNode.parentNode.replaceChild(fragment, textNode);
}

function highlightKeywordSafely(container, keyword, className) {
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        if (!node.nodeValue.includes(keyword)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  const textNodes = [];
  let current;

  while ((current = walker.nextNode())) {
    textNodes.push(current);
  }

  textNodes.forEach((node) => {
    highlightKeywordInTextNode(node, keyword, className);
  });
}

function highlightMultiColorKeyword(container, keyword, segments) {
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        if (!node.nodeValue.includes(keyword)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  const textNodes = [];
  let current;

  while ((current = walker.nextNode())) {
    textNodes.push(current);
  }

  textNodes.forEach((textNode) => {
    const text = textNode.textContent;
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let index = text.indexOf(keyword);

    while (index !== -1) {
      if (index > lastIndex) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex, index)));
      }

      segments.forEach(({ text, className }) => {
        if (!className) {
          fragment.appendChild(document.createTextNode(text));
          return;
        }

        const span = document.createElement("span");
        span.className = className;
        span.textContent = text;
        fragment.appendChild(span);
      });

      lastIndex = index + keyword.length;
      index = text.indexOf(keyword, lastIndex);
    }

    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    textNode.parentNode.replaceChild(fragment, textNode);
  });
}

function highlightCustomKeywords(block) {
  block.querySelectorAll(".token.string").forEach((token) => {
    highlightKeywordSafely(token, "Galgame", "kw-red");
    highlightKeywordSafely(token, "Morfonica", "kw-blue");
    highlightKeywordSafely(token, "Ave Mujica", "kw-reddishpurple");

    highlightMultiColorKeyword(token, "TOGENASHI TOGEARI", [
      { text: "TOG", className: "kw-togenashi-tog" },
      { text: "ENA", className: "kw-togenashi-ena" },
      { text: "SHI", className: "kw-togenashi-shi" },
      { text: " ", className: "" },
      { text: "TOG", className: "kw-togeari-tog" },
      { text: "EARI", className: "kw-togeari-eari" }
    ]);
  });
}

function ensureCodeLineNumbers(pre, code) {
  if (!pre || !code) return;

  pre.classList.add("line-numbers");

  let rows = pre.querySelector(".line-numbers-rows");
  if (!rows) {
    rows = document.createElement("span");
    rows.setAttribute("aria-hidden", "true");
    rows.className = "line-numbers-rows";
    pre.appendChild(rows);
  }

  const lineCount = Math.max(code.textContent.replace(/\n$/, "").split("\n").length, 1);
  rows.innerHTML = Array.from({ length: lineCount }, () => "<span></span>").join("");
}

const scrollRevealCodeBlocks = new Set();
let scrollRevealTicking = false;
let scrollRevealListenersReady = false;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function shouldReduceCodeRevealMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function setCodeRevealProgress(wrapper, progress) {
  const reduceMotion = shouldReduceCodeRevealMotion();
  const hiddenPercent = `${(1 - progress) * 100}%`;
  const clipPath = `inset(0 0 ${hiddenPercent} 0)`;
  const pre = wrapper.querySelector("pre");
  const code = wrapper.querySelector("code");
  const lineNumbers = wrapper.querySelector(".line-numbers-rows");

  wrapper.style.setProperty("--code-reveal-progress", progress.toFixed(3));

  if (pre) {
    pre.style.position = "relative";
  }

  [code, lineNumbers].forEach((element) => {
    if (!element) return;
    element.style.clipPath = clipPath;
    element.style.transition = reduceMotion ? "none" : "clip-path 0.08s linear";
    element.style.willChange = reduceMotion ? "auto" : "clip-path";
  });
}

function updateCodeRevealBlock(wrapper) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    setCodeRevealProgress(wrapper, 1);
    return;
  }

  const rect = wrapper.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const revealLine = viewportHeight * 0.82;
  const progress = clamp((revealLine - rect.top) / rect.height, 0, 1);

  setCodeRevealProgress(wrapper, progress);
}

function updateScrollRevealCodeBlocks() {
  scrollRevealCodeBlocks.forEach(updateCodeRevealBlock);
}

function requestScrollRevealUpdate() {
  if (scrollRevealTicking) return;

  scrollRevealTicking = true;
  requestAnimationFrame(() => {
    updateScrollRevealCodeBlocks();
    scrollRevealTicking = false;
  });
}

function ensureScrollRevealListeners() {
  if (scrollRevealListenersReady) return;

  scrollRevealListenersReady = true;
  window.addEventListener("scroll", requestScrollRevealUpdate, { passive: true });
  window.addEventListener("resize", requestScrollRevealUpdate);
}

function initScrollRevealCodeBlock(wrapper) {
  wrapper.classList.add("code-scroll-reveal");
  scrollRevealCodeBlocks.add(wrapper);
  ensureScrollRevealListeners();
  updateCodeRevealBlock(wrapper);
}

function initCodeBlocks() {
  const blocks = document.querySelectorAll("pre.code-auto");

  blocks.forEach((pre) => {
    if (pre.parentElement.classList.contains("code-block")) return;

    const code = pre.querySelector("code");
    if (!code) return;

    const langClass =
      [...code.classList]
        .find((c) => c.startsWith("language-"))
        ?.replace("language-", "") || "code";

    const wrapper = document.createElement("div");
    wrapper.className = "code-block";

    const header = document.createElement("div");
    header.className = "code-header";

    let fileName = "";
    const lines = code.textContent.split("\n");

    if (lines[0].startsWith("# ")) {
      fileName = lines[0].replace("# ", "").trim();
      lines.shift();

      while (lines.length && lines[0].trim() === "") {
        lines.shift();
      }

      code.textContent = lines.join("\n");
    }

    const file = document.createElement("span");
    file.className = "code-file";
    file.textContent = fileName || "code";

    const label = document.createElement("span");
    label.className = "code-lang";
    label.textContent = formatLangLabel(langClass);

    const left = document.createElement("div");
    left.className = "code-left";
    left.appendChild(file);
    left.appendChild(label);

    const button = document.createElement("button");
    button.className = "copy-btn";
    button.type = "button";
    button.setAttribute("aria-label", "複製程式碼");
    button.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect width="14" height="14" x="2" y="8" rx="2" ry="2"></rect>
        <path d="M8 4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2v10c0 1.1-.9 2-2 2"></path>
      </svg>
    `;

    button.addEventListener("click", () => copyCode(button));

    header.appendChild(left);
    header.appendChild(button);

    pre.classList.add("line-numbers");

    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.appendChild(header);
    wrapper.appendChild(pre);

    if (window.Prism) {
      Prism.highlightElement(code);
    }

    ensureCodeLineNumbers(pre, code);
    highlightCustomKeywords(code);
    initScrollRevealCodeBlock(wrapper);
  });
}
