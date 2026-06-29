function renderPosts() {
  const c = document.getElementById("postsList");
  if (!c) return;

  c.innerHTML = HUIHUI_POSTS.map((p) => {
    const imagesHtml = p.images
      ? `
        <figure class="post-figure">
          <div class="post-images">
            ${p.images.map((image) => `
              <img
                src="${image.src}"
                alt="${image.alt || ""}"
                class="zoomable"
                loading="lazy"
              />
            `).join("")}
          </div>
          ${p.caption ? `<figcaption class="post-caption">${p.caption}</figcaption>` : ""}
        </figure>
      `
      : p.image
        ? `
          <figure class="post-figure">
            <div class="post-image">
              <img
                src="${p.image.src}"
                ${p.image.altKey ? `data-i18n-alt="${p.image.altKey}"` : `alt="${p.image.alt || ""}"`}
                class="zoomable"
                loading="lazy"
              />
            </div>
            ${p.image.caption ? `<figcaption class="post-caption">${p.image.caption}</figcaption>` : ""}
          </figure>
        `
        : "";

    return `
      <article class="post-card">
        <div class="post-meta">
          <span class="post-name">${p.authorName}</span>
          <span class="post-handle">${p.authorHandle}</span>
          <span class="post-dot">·</span>
          <time class="post-date">${p.date}</time>
        </div>
        <div class="post-content">${p.content}</div>
        ${imagesHtml}
      </article>
    `;
  }).join("");
}

document.addEventListener("DOMContentLoaded", renderPosts);