const POSTS_INTL_LOCALES = Object.freeze({
  zh: "zh-Hant",
  en: "en",
  ja: "ja"
});

function getPostsLocale(path = window.location.pathname) {
  if (/^\/en(?:\/|$)/.test(path)) return "en";
  if (/^\/ja(?:\/|$)/.test(path)) return "ja";
  return "zh";
}

function getLocalizedPostValue(value, locale) {
  if (!value || typeof value !== "object") return "";
  return typeof value[locale] === "string" ? value[locale] : "";
}

function getLocalizedPosts(locale) {
  return HUIHUI_POSTS.map((post) => ({
    id: post.id,
    authorName: post.authorName,
    authorHandle: post.authorHandle,
    date: post.date,
    content: getLocalizedPostValue(post.content, locale),
    images: post.images.map((image) => ({
      id: image.id,
      src: image.src,
      srcset: image.srcset,
      sizes: image.sizes,
      fullSrc: image.fullSrc,
      width: image.width,
      height: image.height,
      decoding: image.decoding,
      alt: getLocalizedPostValue(image.alt, locale)
    })),
    links: post.links.map((link) => ({ ...link })),
    caption: getLocalizedPostValue(post.caption, locale)
  }));
}

function escapeHtmlAttribute(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatPostDate(dateValue, locale) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
  if (!match) return "";

  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));

  return new Intl.DateTimeFormat(
    POSTS_INTL_LOCALES[locale] || POSTS_INTL_LOCALES.zh,
    {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC"
    }
  ).format(date);
}

function renderPostLinks(links) {
  return links
    .map(
      (link) =>
        `<a class="${link.className}" href="${link.href}" target="${link.target}" rel="${link.rel}">${link.label}</a>`
    )
    .join("\n");
}

function renderPostImageAttributes(image) {
  return [
    `src="${escapeHtmlAttribute(image.src)}"`,
    image.srcset
      ? `srcset="${escapeHtmlAttribute(image.srcset)}"`
      : "",
    image.sizes ? `sizes="${escapeHtmlAttribute(image.sizes)}"` : "",
    `alt="${escapeHtmlAttribute(image.alt)}"`,
    `width="${image.width}"`,
    `height="${image.height}"`,
    'class="zoomable"',
    'loading="lazy"',
    image.decoding ? `decoding="${image.decoding}"` : "",
    `data-image-id="${image.id}"`,
    image.fullSrc
      ? `data-full-src="${escapeHtmlAttribute(image.fullSrc)}"`
      : ""
  ]
    .filter(Boolean)
    .join("\n                ");
}

function renderPostImages(post) {
  if (post.images.length === 0) return "";

  const imageContainerClass =
    post.images.length > 1 ? "post-images" : "post-image";

  return `
    <figure class="post-figure">
      <div class="${imageContainerClass}">
        ${post.images
          .map(
            (image) => `
              <img
                ${renderPostImageAttributes(image)}
              />
            `
          )
          .join("")}
      </div>
      ${post.caption ? `<figcaption class="post-caption">${post.caption}</figcaption>` : ""}
    </figure>
  `;
}

function renderPosts() {
  const container = document.getElementById("postsList");
  if (!container) return;

  const locale = getPostsLocale();
  const posts = getLocalizedPosts(locale);

  container.innerHTML = posts
    .map((post) => {
      const content = [post.content, renderPostLinks(post.links)]
        .filter(Boolean)
        .join("\n\n");

      return `
        <article class="post-card" data-post-id="${post.id}">
          <div class="post-meta">
            <span class="post-name">${post.authorName}</span>
            <span class="post-handle">${post.authorHandle}</span>
            <span class="post-dot">·</span>
            <time class="post-date" datetime="${post.date}">${formatPostDate(post.date, locale)}</time>
          </div>
          <div class="post-content">${content}</div>
          ${renderPostImages(post)}
        </article>
      `;
    })
    .join("");
}

document.addEventListener("DOMContentLoaded", renderPosts);
