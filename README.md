# huihui.dev

<p align="center">
  <strong>Static-first personal website with Liquid Glass UI, multilingual layout components, and Cloudflare Workers APIs.</strong>
</p>

<p align="center">
  <a href="https://huihui.dev">Stable Site</a>
  ·
  <a href="https://beta.huihui.dev">Beta Site</a>
  ·
  <a href="https://github.com/chiffon-0504/huihui.dev-beta">Development Repository</a>
  ·
  <a href="https://github.com/chiffon-0504/huihui.dev-stable">Production Repository</a>
</p>

<p align="center">
  <img alt="HTML5" src="https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white">
  <img alt="CSS3" src="https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white">
  <img alt="JavaScript" src="https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=111">
  <img alt="GitHub Actions" src="https://img.shields.io/badge/GitHub%20Actions-2088FF?style=flat-square&logo=githubactions&logoColor=white">
  <img alt="Cloudflare Pages" src="https://img.shields.io/badge/Cloudflare%20Pages-F38020?style=flat-square&logo=cloudflare&logoColor=white">
  <img alt="Cloudflare Workers" src="https://img.shields.io/badge/Cloudflare%20Workers-F38020?style=flat-square&logo=cloudflare&logoColor=white">
</p>

---

## Overview

**huihui.dev** is a static-first personal website and lightweight web system built with HTML, CSS, and Vanilla JavaScript.

The project keeps the frontend deployable as static files while using Cloudflare Workers for API normalization, external data access, caching, form validation, and protected server-side operations. The current direction remains:

- static-first frontend
- Liquid Glass UI system
- shared multilingual layout components
- selected Cloudflare Workers API endpoints
- GitHub Actions-based deployment into Cloudflare

This repository, `huihui.dev-beta`, is the development repository for the beta environment. Stable production is maintained separately in `huihui.dev-stable`.

---

## Features

| Area | Description |
|---|---|
| Static-first frontend | HTML, CSS, and Vanilla JavaScript pages hosted through Cloudflare Pages |
| Liquid Glass UI | Layered blur, tint, border, shadow, and translucent surface rules for a readable glass interface |
| Shared layout system | Sidebar, navigation, language switcher, and footer are injected through `js/layout.js` |
| Multilingual i18n | ZH / EN / JA content is organized through locale files under `js/locales/` with path-based routing |
| Workers APIs | Cloudflare Workers normalize RSS, GitHub, NASA APOD, Steam, and contact-form flows |
| API-powered homepage | Dynamic homepage cards are loaded from Worker-backed endpoints |
| Posts UI | Posts pages use refined card, layout, and responsive presentation patterns |
| Tier Maker | Client-side ranking tool with custom tiers, image upload, drag-and-drop sorting, and PNG export |
| Contact protection | Cloudflare Turnstile validation is handled through a Worker before message forwarding |
| Code block UI | Prism.js-based renderer with filename display, line numbers, copy action, and typing effects |

---

## Architecture

```text
Browser
  |
  |-- Static frontend
  |     |-- HTML pages
  |     |-- CSS styling
  |     |-- Liquid Glass UI system
  |     |-- Vanilla JavaScript components
  |     |-- Shared layout injection
  |     |-- Locale-based i18n
  |     |-- Client-side tools
  |
  |-- Dynamic data and form actions
        |-- Cloudflare Workers APIs
              |-- RSS feed normalization
              |-- GitHub API data
              |-- NASA APOD API data
              |-- Steam Web API data
              |-- Turnstile verification
              |-- Contact form forwarding
```

### Repository and Environment Model

| Repository | Role | Deployment Target |
|---|---|---|
| `huihui.dev-beta` | Development repository | `beta.huihui.dev` |
| `huihui.dev-stable` | Production repository | `huihui.dev` |

The beta repository is used for active development and validation. Stable production is released through the stable repository after changes are ready for production.

---

## Deployment Flow

Deployment now runs through GitHub Actions before publishing to Cloudflare.

```text
Local changes
  -> GitHub
  -> GitHub Actions
  -> Cloudflare Pages / Cloudflare Workers
  -> beta.huihui.dev or huihui.dev
```

Expected flow:

1. Changes are committed and pushed to GitHub.
2. GitHub Actions runs the configured deployment workflow.
3. Static assets are deployed to Cloudflare Pages.
4. Worker-side API updates are deployed to Cloudflare Workers when relevant.
5. The beta or stable domain receives the deployed version based on repository/environment.

This keeps GitHub as the source of truth, GitHub Actions as the deployment coordinator, and Cloudflare as the hosting/runtime platform.

---

## Recent Improvements

### Stable Release

- `v1.2.1` is the latest stable release.
- The repository model is now split between development and production:
  - `huihui.dev-beta` for development
  - `huihui.dev-stable` for production
  - `beta.huihui.dev` for testing
  - `huihui.dev` for stable production

### Layout and Responsiveness

- Sidebar and layout consistency fixes were completed across desktop and mobile views.
- Responsive drawer behavior was tightened for smaller screens.
- Shared layout injection remains centralized in `js/layout.js` to keep navigation and page chrome consistent.

### Posts UI

- Posts UI was redesigned and refined for clearer scanning, better responsive behavior, and stronger alignment with the Liquid Glass system.
- Post surfaces, spacing, and page structure were adjusted to better match the shared site layout.

---

## Tech Stack

| Layer | Tools |
|---|---|
| Frontend | HTML5, CSS3, Vanilla JavaScript |
| UI system | Liquid Glass UI, custom CSS, responsive sidebar and drawer navigation |
| Layout | Shared layout injection through `js/layout.js` |
| i18n | Locale files in `js/locales/` with path-based routing |
| Code rendering | Prism.js plus custom renderer behavior |
| Hosting | Cloudflare Pages |
| API runtime | Cloudflare Workers |
| Security | Cloudflare Turnstile |
| CI/CD | GitHub Actions |
| External APIs | GitHub API, Steam Web API, NASA APOD API, RSS feeds |
| Version control | Git / GitHub |

---

## Project Structure

```text
/
|-- .github/
|   `-- workflows/
|-- index.html
|-- about/
|-- works/
|-- posts/
|-- contact/
|-- en/
|-- ja/
|-- tools/
|   `-- tier-maker/
|-- images/
|   `-- games/
|-- js/
|   |-- about-page.js
|   |-- i18n.js
|   |-- layout.js
|   |-- lightbox.js
|   |-- main.js
|   |-- profile-code.js
|   `-- locales/
|       |-- zh.js
|       |-- en.js
|       `-- ja.js
|-- style.css
`-- README.md
```

Key directories:

| Path | Purpose |
|---|---|
| `/` | Static entry pages and top-level routes |
| `js/` | Shared frontend behavior, layout injection, i18n, page renderers, and UI helpers |
| `js/locales/` | Multilingual content modules for ZH / EN / JA |
| `posts/` | Posts listing and article-facing UI structure |
| `tools/tier-maker/` | Client-side Tier Maker tool |
| `.github/workflows/` | GitHub Actions deployment workflows |

---

## Design Principles

- Keep the site static-first unless dynamic behavior is required.
- Use Liquid Glass as a readable interface system, not a decorative overlay.
- Separate blur, tint, border, opacity, and shadow concerns in CSS.
- Keep shared layout behavior centralized and consistent across languages.
- Manage multilingual text through locale files rather than duplicated page logic.
- Keep client-side tools local when persistence is not required.
- Use Cloudflare Workers for API normalization, secrets, caching, and validation.
- Use Turnstile only where user-submitted data requires protection.
- Avoid CMS, database, or framework complexity unless the project scope requires it.

---

## Status

| Item | Status |
|---|---|
| Development repository | `chiffon-0504/huihui.dev-beta` |
| Production repository | `chiffon-0504/huihui.dev-stable` |
| Beta environment | <https://beta.huihui.dev> |
| Stable production | <https://huihui.dev> |
| Latest stable release | `v1.2.1` |
| Deployment | Cloudflare Pages Git integration (static site) / GitHub Actions (Workers) |
| Current direction | Static-first site with Liquid Glass UI, multilingual shared layout, and Workers-backed APIs |

Actively maintained.
