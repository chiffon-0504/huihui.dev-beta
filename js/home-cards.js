const HUIHUI_API_BASE = "https://huihui-api.huihuigames01.workers.dev";

let homeCardsReady = false;

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

    link.textContent = `huihui.dev-stable · Updated ${data.updatedText || ""}`;
    link.href = data.link || "https://github.com/chiffon-0504/huihui.dev-stable";
  } catch (error) {
    link.textContent = "huihui.dev-stable";
    link.href = "https://github.com/chiffon-0504/huihui.dev-stable";
    console.error(error);
  }
}

function initHomeCards() {
  if (homeCardsReady) return;

  homeCardsReady = true;
  loadTechNews();
  loadApodCard();
  loadProjectUpdateCard();
  setInterval(loadProjectUpdateCard, 5 * 60 * 1000);
}
