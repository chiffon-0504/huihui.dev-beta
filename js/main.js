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
    python: "PYTHON",
    javascript: "JAVASCRIPT",
    css: "CSS",
    markup: "HTML",
    html: "HTML",
    js: "JAVASCRIPT",
    typescript: "TYPESCRIPT",
    ts: "TYPESCRIPT",
    json: "JSON",
    bash: "BASH",
    shell: "SHELL",
    sh: "SHELL",
    swift: "SWIFT"
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

function highlightCustomKeywords(block) {
  block.querySelectorAll(".token.string").forEach((token) => {
    highlightKeywordSafely(token, "Galgame", "kw-red");
    highlightKeywordSafely(token, "Morfonica", "kw-blue");
    highlightKeywordSafely(token, "Ave Mujica", "kw-reddishpurple");
  });
}

function typeCodeBlock(block) {
  if (!window.Prism) return;

  const raw = block.textContent;
  block.textContent = "";

  let i = 0;

  function typing() {
    if (i < raw.length) {
      block.textContent += raw.charAt(i);
      i++;

      if (i % 5 === 0 || i === raw.length) {
        Prism.highlightElement(block);
      }

      setTimeout(typing, 2);
    } else {
      highlightCustomKeywords(block);
    }
  }

  typing();
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
        <rect x="9" y="9" width="11" height="11" rx="2"></rect>
        <rect x="4" y="4" width="11" height="11" rx="2"></rect>
      </svg>
    `;

    button.addEventListener("click", () => copyCode(button));

    header.appendChild(left);
    header.appendChild(button);

    pre.classList.add("line-numbers");

    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.appendChild(header);
    wrapper.appendChild(pre);

    typeCodeBlock(code);
  });
}

document.addEventListener("DOMContentLoaded", initCodeBlocks);

const HUIHUI_API_BASE = "https://huihui-api.huihuigames01.workers.dev";

// ===== Tech Updates =====
async function loadTechNews() {
  const container = document.getElementById("techNewsCards");
  if (!container) return;

  try {
    const response = await fetch(`${HUIHUI_API_BASE}/api/tech-news`);

    if (!response.ok) {
      throw new Error("API request failed");
    }

    const data = await response.json();

    if (!Array.isArray(data.techNews)) {
      throw new Error("Invalid API response");
    }

    container.innerHTML = data.techNews
      .map((item) => `
        <a
          class="tech-news-card"
          href="${item.link}"
          target="_blank"
          rel="noopener noreferrer"
        >
          <div class="tech-news-category">${item.category}</div>
          <h3>${item.title}</h3>
          <p>
            最新來源：${item.source}${item.timeAgo ? ` · ${item.timeAgo}` : ""}
          </p>
          <span class="tech-news-tag">${item.tag}</span>
        </a>
      `)
      .join("");
  } catch (error) {
    container.innerHTML = `
      <p class="tech-news-error">Failed to load tech updates.</p>
    `;
    console.error(error);
  }
}

document.addEventListener("DOMContentLoaded", loadTechNews);

// ===== NASA APOD =====
async function loadApodCard() {
  const image = document.getElementById("apod-image");
  const link = document.getElementById("apod-link");
  const title = document.getElementById("apodTitle");
  const desc = document.getElementById("apod-desc");
  const date = document.getElementById("apod-date");

  if (!image || !link || !title || !desc || !date) return;

  try {
    const res = await fetch(`${HUIHUI_API_BASE}/api/apod`);
    if (!res.ok) throw new Error("APOD API failed");

    const data = await res.json();

    link.href = data.originalUrl || "https://apod.nasa.gov/apod/";

    if (data.imageUrl) {
      image.src = data.imageUrl;
    } else {
      image.src = "images/0001_hp.webp";
    }

    title.textContent = data.title || "Daily Space Inspiration";
    desc.textContent = shortenText(data.explanation || "", 140);

    const mediaLabel = data.mediaType === "video" ? "NASA APOD · Video" : "NASA APOD";
    date.textContent = data.date ? `${mediaLabel} · ${data.date}` : mediaLabel;
  } catch (error) {
    title.textContent = "Daily Space Inspiration";
    desc.textContent = "NASA APOD is temporarily unavailable.";
    date.textContent = "Fallback mode";
  }
}

function shortenText(text, maxLength) {
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength).trim()}...` : text;
}

async function loadProjectUpdateCard() {
  const link = document.getElementById("projectUpdateLink");
  if (!link) return;

  try {
    const res = await fetch(`${HUIHUI_API_BASE}/api/github-updates`);

    if (!res.ok) {
      throw new Error("GitHub updates API failed");
    }

    const data = await res.json();

    if (!data.ok) {
      throw new Error("Invalid GitHub updates response");
    }

    link.textContent = `${data.repo || "huihui.dev-stable"} · Updated ${data.updatedText || ""}`;
    link.href = data.link || "https://github.com/chiffon-0504/huihui.dev-stable";
  } catch (error) {
    link.textContent = "huihui.dev-stable";
    link.href = "https://github.com/chiffon-0504/huihui.dev-stable";
    console.error(error);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadApodCard();

  loadProjectUpdateCard();
  setInterval(loadProjectUpdateCard, 5 * 60 * 1000);
});

(() => {
  const root = document.documentElement;
  const updateMaterial = () => {
    root.style.setProperty("--glass-tint-opacity", "0.58");
    root.style.setProperty("--glass-tint-hover-opacity", "0.64");
  };
  let ticking = false;
  const requestUpdate = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      updateMaterial();
      ticking = false;
    });
  };
  document.addEventListener("DOMContentLoaded", updateMaterial);
  addEventListener("scroll", requestUpdate, { passive: true });
  addEventListener("resize", requestUpdate);
})();

function initMobileDrawer() {
  const sidebar = document.querySelector(".sidebar");
  if (!sidebar || document.getElementById("menuToggle")) return;

  const toggle = document.createElement("button");
  toggle.id = "menuToggle";
  toggle.type = "button";
  toggle.setAttribute("aria-label", "Open navigation");
  toggle.setAttribute("aria-expanded", "false");
  toggle.textContent = "☰";

  const overlay = document.createElement("div");
  overlay.className = "sidebar-overlay";

  document.body.prepend(overlay);
  document.body.prepend(toggle);

  const setOpen = (open) => {
    sidebar.classList.toggle("open", open);
    overlay.classList.toggle("active", open);
    toggle.setAttribute("aria-expanded", String(open));
  };

  toggle.addEventListener("click", () => setOpen(!sidebar.classList.contains("open")));
  overlay.addEventListener("click", () => setOpen(false));
  sidebar.querySelectorAll("nav a").forEach((link) => {
    link.addEventListener("click", () => setOpen(false));
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setOpen(false);
  });
}

document.addEventListener("DOMContentLoaded", initMobileDrawer);
