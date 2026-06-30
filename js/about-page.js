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

const STEAM_FAVORITE_APPIDS = [2458530, 1829980, 1044620, 3682050];
const STEAM_CUSTOM_IMAGES = {
  3418570: "/images/games/summer-pockets-rb.webp",
  3682050: "/images/games/Sickly-Days-and-Summer-Traces.webp",
};

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

function renderAboutInterestCards() {
  const config = getAboutPageConfig();

  return `
    <article class="interest-card">
      <h4>${config.maimaiTitle}</h4>
      <div class="interest-gallery">
        <img src="/images/1001_a.webp" data-i18n-alt="about.images.maimai" />
      </div>
    </article>

    <article class="interest-card arcaea-card">
      <h4>
        <a
          href="https://arcaea.lowiro.com/zh-hant"
          target="_blank"
          rel="noopener noreferrer"
          class="arcaea-title-link"
        >
          Arcaea
        </a>
      </h4>

      <div class="arcaea-profile">
        <img
          src="/images/1033_a.webp"
          alt="Arcaea profile"
          class="zoomable"
          data-i18n-alt="about.images.arcaea"
          onerror="this.onerror=null; this.src='/images/1032_a.webp';"
        />
      </div>

      <div class="arcaea-records">
        <div class="arcaea-record">
          <img
            src="/images/1003_af.webp"
            alt="Favorite Arcaea song"
            class="arcaea-record-img zoomable"
            onerror="this.onerror=null; this.src='/images/1032_a.webp';"
          />

          <div class="arcaea-record-text">
            <h5>Favorite</h5>
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

        <div class="arcaea-record">
          <img
            src="/images/1004_ab.webp"
            alt="Best Arcaea record"
            class="arcaea-record-img zoomable"
            onerror="this.onerror=null; this.src='/images/1032_a.webp';"
          />

          <div class="arcaea-record-text">
            <h5>Best</h5>
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
      <h4>${config.galgameTitle}</h4>
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
            src="/images/games/summer-pockets-rb-wide.webp"
            data-i18n-alt="about.images.galgame"
          />
          <span class="galgame-banner-meta">
            <span class="steam-game-name" id="galgameBannerName">Summer Pockets REFLECTION BLUE</span>
            <span class="steam-game-hours" id="galgameBannerHours">Loading...</span>
          </span>
        </a>

        <div class="steam-favorites" id="steamFavorites" aria-live="polite">
          <p class="steam-loading" data-i18n="about.steam.loading"></p>
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
}

async function renderSteamFavorites() {
  const config = getAboutPageConfig();
  const container = document.getElementById("steamFavorites");
  const bannerLink = document.getElementById("galgameBannerLink");
  const bannerName = document.getElementById("galgameBannerName");
  const bannerHours = document.getElementById("galgameBannerHours");

  if (!container) return;

  try {
    const res = await fetch("https://api.huihui.dev/api/steam-library");

    if (!res.ok) {
      throw new Error("Steam API failed");
    }

    const data = await res.json();
    const games = Array.isArray(data.games) ? data.games : [];
    const selectedGames = STEAM_FAVORITE_APPIDS
      .map((appid) => games.find((game) => game.appid === appid))
      .filter(Boolean);
    const bannerGame = games.find((game) => game.appid === 3418570);

    if (bannerGame) {
      if (bannerLink) bannerLink.href = bannerGame.storeUrl;
      if (bannerName) bannerName.textContent = config.steamNames[bannerGame.appid] || bannerGame.name;
      if (bannerHours) bannerHours.textContent = `${bannerGame.playtimeHours} ${getAboutText("hours")}`;
    }

    if (selectedGames.length === 0) {
      container.innerHTML = `<p class="steam-error">${getAboutText("error")}</p>`;
      return;
    }

    container.innerHTML = selectedGames
      .map((game) => {
        const name = config.steamNames[game.appid] || game.name;
        const image = STEAM_CUSTOM_IMAGES[game.appid] || game.coverUrl;

        return `
          <a class="steam-game-card" href="${game.storeUrl}" target="_blank" rel="noopener">
            <img
              src="${image}"
              alt="${name}"
              loading="lazy"
              onerror="this.onerror=null; this.src='${game.capsuleUrl}';"
            >
            <span class="steam-game-meta">
              <span class="steam-game-name">${name}</span>
              <span class="steam-game-hours">${game.playtimeHours} ${getAboutText("hours")}</span>
            </span>
          </a>
        `;
      })
      .join("");
  } catch (error) {
    container.innerHTML = `<p class="steam-error">${getAboutText("error")}</p>`;
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

