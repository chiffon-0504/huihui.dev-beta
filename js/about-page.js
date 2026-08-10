const ABOUT_PAGE_CONFIG = {
  zh: {
    maimaiTitle: "maimai DX",
    galgameTitle: "Galgame",
    steamNames: {
      2458530: "魔女的夜宴",
      1829980: "星光咖啡館與死神之蝶",
      1044620: "蒼之彼方的四重奏",
      3682050: "痴情哥哥與病弱妹妹的鄉間生活",
    },
  },
  en: {
    maimaiTitle: "maimai DX",
    galgameTitle: "Galgame",
    steamNames: {
      2458530: "Sabbat of the Witch",
      1829980: "Café Stella and the Reaper's Butterflies",
      1044620: "Aokana - Four Rhythms Across the Blue",
      3682050: "Sickly Days and Summer Traces",
    },
  },
  ja: {
    maimaiTitle: "maimai でらっくす",
    galgameTitle: "美少女ゲーム",
    steamNames: {
      2458530: "サノバウィッチ",
      1829980: "喫茶ステラと死神の蝶",
      1044620: "蒼の彼方のフォーリズム",
      3682050: "ド田舎兄妹",
    },
  },
};

const ABOUT_LOCAL_IMAGE_METADATA = Object.freeze({
  "/images/1001_am.webp": Object.freeze({ width: 1624, height: 689 }),
  "/images/1002_amf.webp": Object.freeze({ width: 800, height: 800 }),
  "/images/1003_amb.webp": Object.freeze({ width: 400, height: 400 }),
  "/images/1005_aaf.webp": Object.freeze({ width: 747, height: 747 }),
  "/images/1006_aab.webp": Object.freeze({ width: 800, height: 677 }),
  "/images/1014_aa.webp": Object.freeze({ width: 837, height: 337 }),
  "/images/1032_a.webp": Object.freeze({ width: 850, height: 347 }),
  "/images/games/Cafe-Stella-and-the-Reapers-Butterflies.webp": Object.freeze({
    width: 600,
    height: 900,
  }),
  "/images/games/Sickly-Days-and-Summer-Traces.webp": Object.freeze({
    width: 300,
    height: 450,
  }),
  "/images/games/summer-pockets-rb-wide.webp": Object.freeze({
    width: 1232,
    height: 706,
  }),
  "/images/games/summer-pockets-rb.webp": Object.freeze({
    width: 600,
    height: 900,
  }),
});
const ABOUT_IMAGE_LOADING = Object.freeze({
  loading: "lazy",
  decoding: "async",
});

function createLocalAboutImage(src) {
  const dimensions = ABOUT_LOCAL_IMAGE_METADATA[src];

  if (!dimensions) {
    throw new Error(`Missing About image metadata: ${src}`);
  }

  return Object.freeze({ src, ...dimensions, ...ABOUT_IMAGE_LOADING });
}

const ABOUT_INTEREST_IMAGES = Object.freeze({
  maimaiProfile: createLocalAboutImage("/images/1001_am.webp"),
  maimaiFavorite: createLocalAboutImage("/images/1002_amf.webp"),
  maimaiBest: createLocalAboutImage("/images/1003_amb.webp"),
  arcaeaProfile: createLocalAboutImage("/images/1014_aa.webp"),
  arcaeaFavorite: createLocalAboutImage("/images/1005_aaf.webp"),
  arcaeaBest: createLocalAboutImage("/images/1006_aab.webp"),
  galgameBanner: createLocalAboutImage(
    "/images/games/summer-pockets-rb-wide.webp",
  ),
});

const STEAM_BANNER_APPID = 3418570;
const STEAM_FAVORITE_APPIDS = [2458530, 1829980, 1044620, 3682050];
const STEAM_REQUEST_TIMEOUT_MS = 8000;
const STEAM_BANNER_DEFAULT_NAME = "Summer Pockets REFLECTION BLUE";
const STEAM_BANNER_DEFAULT_URL =
  "https://store.steampowered.com/app/3418570/";
const STEAM_CUSTOM_IMAGES = {
  3418570: createLocalAboutImage("/images/games/summer-pockets-rb.webp"),
  1829980: createLocalAboutImage(
    "/images/games/Cafe-Stella-and-the-Reapers-Butterflies.webp",
  ),
  3682050: createLocalAboutImage(
    "/images/games/Sickly-Days-and-Summer-Traces.webp",
  ),
};

let steamRequestSequence = 0;
let activeSteamRequestController;

function attachImageFallbacks(root) {
  root.querySelectorAll("img[data-fallback-src]").forEach((image) => {
    const fallbackSrc = image.dataset.fallbackSrc;
    image.removeAttribute("data-fallback-src");

    if (!fallbackSrc) return;

    image.addEventListener(
      "error",
      () => {
        const fallbackDimensions = ABOUT_LOCAL_IMAGE_METADATA[fallbackSrc];

        if (fallbackDimensions) {
          image.width = fallbackDimensions.width;
          image.height = fallbackDimensions.height;
        } else {
          image.removeAttribute("width");
          image.removeAttribute("height");
        }

        image.src = fallbackSrc;
      },
      { once: true },
    );
  });
}

function getAboutPageConfig() {
  const locale = getCurrentLocale();
  return ABOUT_PAGE_CONFIG[locale] || ABOUT_PAGE_CONFIG.zh;
}

function getAboutText(key) {
  const locale = getCurrentLocale();

  return (
    window.HUIHUI_I18N?.[locale]?.about?.steam?.[key] ||
    window.HUIHUI_I18N?.zh?.about?.steam?.[key] ||
    ""
  );
}

function getSafeHttpsUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.href : "";
  } catch (error) {
    return "";
  }
}

function isValidSteamGame(game) {
  return Boolean(
    game &&
      typeof game === "object" &&
      Number.isInteger(game.appid) &&
      typeof game.name === "string" &&
      game.name.trim() &&
      Number.isFinite(game.playtimeHours) &&
      game.playtimeHours >= 0 &&
      getSafeHttpsUrl(game.coverUrl) &&
      getSafeHttpsUrl(game.capsuleUrl) &&
      getSafeHttpsUrl(game.storeUrl),
  );
}

function getSteamGames(data) {
  if (Array.isArray(data)) {
    if (data.length === 0) return data;

    throw new Error("Invalid Steam response");
  }

  if (
    !data ||
    typeof data !== "object" ||
    data.ok !== true ||
    !Array.isArray(data.games) ||
    !data.games.every(isValidSteamGame)
  ) {
    throw new Error("Invalid Steam response");
  }

  return data.games;
}

function createSteamStatus(className, key) {
  const message = document.createElement("p");
  message.className = className;
  message.textContent = getAboutText(key);
  return message;
}

function setSteamBannerStatus(elements, key) {
  if (elements.bannerLink) elements.bannerLink.href = STEAM_BANNER_DEFAULT_URL;
  if (elements.bannerName) {
    elements.bannerName.textContent = STEAM_BANNER_DEFAULT_NAME;
  }
  if (elements.bannerHours) {
    elements.bannerHours.textContent = getAboutText(key);
  }
}

function setSteamLoadingState(elements) {
  setSteamBannerStatus(elements, "loading");
  elements.container.replaceChildren(createSteamStatus("steam-loading", "loading"));
}

function setSteamFailureState(elements, key) {
  setSteamBannerStatus(elements, key);
  elements.container.replaceChildren(createSteamStatus("steam-error", key));
}

function renderSteamBanner(elements, game, config) {
  if (!game) {
    setSteamBannerStatus(elements, "bannerUnavailable");
    return;
  }

  if (elements.bannerLink) {
    elements.bannerLink.href = getSafeHttpsUrl(game.storeUrl);
  }
  if (elements.bannerName) {
    elements.bannerName.textContent = config.steamNames[game.appid] || game.name;
  }
  if (elements.bannerHours) {
    elements.bannerHours.textContent = `${game.playtimeHours} ${getAboutText("hours")}`;
  }
}

function createSteamGameCard(game, config) {
  const card = document.createElement("a");
  const image = document.createElement("img");
  const meta = document.createElement("span");
  const name = document.createElement("span");
  const hours = document.createElement("span");
  const localizedName = config.steamNames[game.appid] || game.name;
  const customImage = STEAM_CUSTOM_IMAGES[game.appid];

  card.className = "steam-game-card";
  card.href = getSafeHttpsUrl(game.storeUrl);
  card.target = "_blank";
  card.rel = "noopener";

  image.src = customImage?.src || getSafeHttpsUrl(game.coverUrl);
  image.alt = localizedName;
  image.loading = "lazy";
  image.decoding = "async";
  image.dataset.fallbackSrc = getSafeHttpsUrl(game.capsuleUrl);

  if (customImage) {
    image.width = customImage.width;
    image.height = customImage.height;
  }

  meta.className = "steam-game-meta";
  name.className = "steam-game-name";
  name.textContent = localizedName;
  hours.className = "steam-game-hours";
  hours.textContent = `${game.playtimeHours} ${getAboutText("hours")}`;

  meta.append(name, hours);
  card.append(image, meta);
  return card;
}

function renderSteamGameList(container, games, config) {
  if (games.length === 0) {
    container.replaceChildren(
      createSteamStatus("steam-error", "gamesUnavailable"),
    );
    return;
  }

  const fragment = document.createDocumentFragment();
  games.forEach((game) => fragment.append(createSteamGameCard(game, config)));
  container.replaceChildren(fragment);
  attachImageFallbacks(container);
}

function renderLocalAboutImageAttributes(image) {
  return [
    `src="${image.src}"`,
    `width="${image.width}"`,
    `height="${image.height}"`,
    `loading="${image.loading}"`,
    `decoding="${image.decoding}"`,
  ].join(" ");
}

function renderAboutInterestCards() {
  const config = getAboutPageConfig();

  return `
    <article class="interest-card rhythm-card maimai-card">
      <h3>
        <a
          href="https://maimai.sega.com/"
          target="_blank"
          rel="noopener noreferrer"
          class="rhythm-title-link"
        >
          ${config.maimaiTitle}
        </a>
      </h3>

      <div class="rhythm-profile">
        <img
          ${renderLocalAboutImageAttributes(ABOUT_INTEREST_IMAGES.maimaiProfile)}
          alt="maimai DX profile"
          class="zoomable"
          data-i18n-alt="about.images.maimai"
        />
      </div>

      <div class="rhythm-records">
        <div class="rhythm-record">
          <img
            ${renderLocalAboutImageAttributes(ABOUT_INTEREST_IMAGES.maimaiFavorite)}
            data-i18n-alt="about.images.maimaiFavorite"
            class="rhythm-record-img zoomable"
            data-fallback-src="/images/1001_am.webp"
          />

          <div class="rhythm-record-text">
            <h4 data-i18n="about.rhythm.favorite"></h4>
            <p>
              <a
                href="https://www.youtube.com/watch?v=zqH9qgVNzHI"
                target="_blank"
                rel="noopener noreferrer"
                class="rhythm-text-link"
              >
                Straight into the lights
              </a>
            </p>
            <p>Cosmograph</p>
          </div>
        </div>

        <div class="rhythm-record">
          <img
            ${renderLocalAboutImageAttributes(ABOUT_INTEREST_IMAGES.maimaiBest)}
            data-i18n-alt="about.images.maimaiBest"
            class="rhythm-record-img zoomable"
            data-fallback-src="/images/1001_am.webp"
          />

          <div class="rhythm-record-text">
            <h4 data-i18n="about.rhythm.best"></h4>
            <p>
              <a
                href="https://www.youtube.com/watch?v=-3wzWwhHW3g"
                target="_blank"
                rel="noopener noreferrer"
                class="rhythm-text-link"
              >
                Ref:rain (for 7th Heaven)
              </a>
            </p>
            <p>カモメサノエレクトリックオーケストラ include Limonène</p>
            <p><span data-i18n="about.rhythm.level"></span>: MASTER 14</p>
            <p><span data-i18n="about.rhythm.bestScore"></span>: 100.0943%</p>
          </div>
        </div>
      </div>
    </article>

    <article class="interest-card rhythm-card arcaea-card">
      <h3>
        <a
          href="https://arcaea.lowiro.com/zh-hant"
          target="_blank"
          rel="noopener noreferrer"
          class="arcaea-title-link"
        >
          Arcaea
        </a>
      </h3>

      <div class="rhythm-profile">
        <img
          ${renderLocalAboutImageAttributes(ABOUT_INTEREST_IMAGES.arcaeaProfile)}
          alt="Arcaea profile"
          class="zoomable"
          data-i18n-alt="about.images.arcaea"
          data-fallback-src="/images/1032_a.webp"
        />
      </div>

      <div class="rhythm-records">
        <div class="rhythm-record">
          <img
            ${renderLocalAboutImageAttributes(ABOUT_INTEREST_IMAGES.arcaeaFavorite)}
            data-i18n-alt="about.images.arcaeaFavorite"
            class="rhythm-record-img zoomable"
            data-fallback-src="/images/1032_a.webp"
          />

          <div class="rhythm-record-text">
            <h4 data-i18n="about.rhythm.favorite"></h4>
            <p>
              <a
                href="https://soundcloud.com/7ijhvp0echx6/ak-q-x-onoken-lzllel"
                target="_blank"
                rel="noopener noreferrer"
                class="arcaea-text-link"
              >
                ΛZΛLEΛ
              </a>
            </p>
            <p>ak+q × onoken</p>
          </div>
        </div>

        <div class="rhythm-record">
          <img
            ${renderLocalAboutImageAttributes(ABOUT_INTEREST_IMAGES.arcaeaBest)}
            data-i18n-alt="about.images.arcaeaBest"
            class="rhythm-record-img zoomable"
            data-fallback-src="/images/1032_a.webp"
          />

          <div class="rhythm-record-text">
            <h4 data-i18n="about.rhythm.best"></h4>
            <p>
              <a
                href="https://soundcloud.com/kss01/usao-cyaegha"
                target="_blank"
                rel="noopener noreferrer"
                class="arcaea-text-link"
              >
                Cyaegha
              </a>
            </p>
            <p>USAO</p>
          </div>
        </div>
      </div>
    </article>

    <article class="interest-card steam-favorites-card">
      <h3>${config.galgameTitle}</h3>
      <div class="galgame-showcase">
        <a
          class="galgame-banner-link"
          id="galgameBannerLink"
          href="https://store.steampowered.com/app/3418570/"
          target="_blank"
          rel="noopener"
        >
          <img
            class="galgame-banner"
            ${renderLocalAboutImageAttributes(ABOUT_INTEREST_IMAGES.galgameBanner)}
            data-i18n-alt="about.images.galgame"
          />
          <span class="galgame-banner-meta">
            <span class="steam-game-name" id="galgameBannerName">${STEAM_BANNER_DEFAULT_NAME}</span>
            <span class="steam-game-hours" id="galgameBannerHours" data-i18n="about.steam.loading">${getAboutText("loading")}</span>
          </span>
        </a>

        <div class="steam-favorites" id="steamFavorites" aria-live="polite">
          <p class="steam-loading" data-i18n="about.steam.loading">${getAboutText("loading")}</p>
        </div>
      </div>
    </article>
  `;
}

function renderAboutPage() {
  const root = document.getElementById("aboutPage");

  if (!root) return;

  root.classList.add("about-page");
  root.innerHTML = `
    <div class="about-content">
      <header class="page-header">
        <h1 data-i18n="about.title"></h1>
      </header>

    <div class="page-body">

      <pre class="code-auto"><code id="profileCode" class="language-python"></code></pre>

      <section>
        <h2 data-i18n="about.interests"></h2>

        <div class="interest-cards">
          ${renderAboutInterestCards()}
        </div>
      </section>

            <p class="interest-note" data-i18n="about.copyright"></p>
      </div>
    </div>
  `;

  attachImageFallbacks(root);
}

async function renderSteamFavorites() {
  const config = getAboutPageConfig();
  const elements = {
    container: document.getElementById("steamFavorites"),
    bannerLink: document.getElementById("galgameBannerLink"),
    bannerName: document.getElementById("galgameBannerName"),
    bannerHours: document.getElementById("galgameBannerHours"),
  };

  if (!elements.container) return;

  const requestSequence = ++steamRequestSequence;
  activeSteamRequestController?.abort();

  const controller = new AbortController();
  let didTimeout = false;
  const timeoutId = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, STEAM_REQUEST_TIMEOUT_MS);

  activeSteamRequestController = controller;
  setSteamLoadingState(elements);

  try {
    const res = await fetch(`${getHuihuiApiBase()}/api/steam-library`, {
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error("Steam API failed");
    }

    const data = await res.json();
    const games = getSteamGames(data);
    const selectedGames = STEAM_FAVORITE_APPIDS
      .map((appid) => games.find((game) => game.appid === appid))
      .filter(Boolean);
    const bannerGame = games.find((game) => game.appid === STEAM_BANNER_APPID);

    if (requestSequence !== steamRequestSequence) return;

    renderSteamBanner(elements, bannerGame, config);
    renderSteamGameList(elements.container, selectedGames, config);
  } catch (error) {
    if (requestSequence !== steamRequestSequence) return;

    setSteamFailureState(elements, didTimeout ? "timeout" : "loadError");
  } finally {
    clearTimeout(timeoutId);

    if (activeSteamRequestController === controller) {
      activeSteamRequestController = undefined;
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  renderAboutPage();

  if (typeof applyI18n === "function") {
    applyI18n();
  }

  if (typeof renderProfileCode === "function") {
    renderProfileCode();
  }

  if (typeof initCodeBlocks === "function") {
    initCodeBlocks();
  }

  renderSteamFavorites();
});

