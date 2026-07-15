let homeCardsReady = false;

function getSafeTechNewsUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.href : "";
  } catch (error) {
    return "";
  }
}

// ===== Tech Updates =====
async function loadTechNews() {
  const container = document.getElementById("techNewsCards");
  if (!container) return;

  try {
    const response = await fetch(`${getHuihuiApiBase()}/api/tech-news`);

    if (!response.ok) {
      throw new Error("API request failed");
    }

    const data = await response.json();

    if (!Array.isArray(data.techNews)) {
      throw new Error("Invalid API response");
    }

    const fragment = document.createDocumentFragment();

    data.techNews.forEach((item) => {
      const card = document.createElement("a");
      const link = getSafeTechNewsUrl(item.link);
      const category = document.createElement("div");
      const title = document.createElement("h3");
      const source = document.createElement("p");
      const tag = document.createElement("span");

      card.className = "tech-news-card";
      card.target = "_blank";
      card.rel = "noopener noreferrer";

      if (link) {
        card.href = link;
      }

      category.className = "tech-news-category";
      category.textContent = item.category;
      title.textContent = item.title;
      source.textContent = `最新來源：${item.source}${item.timeAgo ? ` · ${item.timeAgo}` : ""}`;
      tag.className = "tech-news-tag";
      tag.textContent = item.tag;

      card.append(category, title, source, tag);
      fragment.append(card);
    });

    container.replaceChildren(fragment);
  } catch (error) {
    const message = document.createElement("p");
    message.className = "tech-news-error";
    message.textContent = "Failed to load tech updates.";
    container.replaceChildren(message);
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
    const res = await fetch(`${getHuihuiApiBase()}/api/apod`);
    if (!res.ok) throw new Error("APOD API failed");

    const data = await res.json();

    link.href = data.originalUrl || "https://apod.nasa.gov/apod/";

    if (data.imageUrl) {
      image.src = data.imageUrl;
    } else {
      image.src = "/images/0001_hp.webp";
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
    const res = await fetch(`${getHuihuiApiBase()}/api/github-updates`);

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
