# huihui.dev

<p align="center">
  <strong>A static-first personal website with multilingual pages, reusable UI components, interactive tools, and Cloudflare Workers APIs.</strong>
</p>

<p align="center">
  <a href="https://huihui.dev">Live Site</a>
  ·
  <a href="https://github.com/chiffon-0504/huihui.dev-project-v1">Repository</a>
</p>

<p align="center">
  <img alt="HTML5" src="https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white">
  <img alt="CSS3" src="https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white">
  <img alt="JavaScript" src="https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=111">
  <img alt="Cloudflare Pages" src="https://img.shields.io/badge/Cloudflare%20Pages-F38020?style=flat-square&logo=cloudflare&logoColor=white">
  <img alt="Cloudflare Workers" src="https://img.shields.io/badge/Cloudflare%20Workers-F38020?style=flat-square&logo=cloudflare&logoColor=white">
</p>

---

## Overview

**huihui.dev** is a personal portfolio and development website built with HTML, CSS, and Vanilla JavaScript.

The project started as a static website and has gradually evolved into a small web system with shared frontend components, multilingual content, dynamic API cards, and selected serverless backend features powered by Cloudflare Workers.

The core direction is:

- keep the frontend static, fast, and maintainable
- centralize repeated layout and multilingual content
- add backend APIs only when dynamic behavior is actually useful
- avoid unnecessary framework or CMS complexity

---

## Live Pages

| Area | URL |
|---|---|
| Homepage | <https://huihui.dev> |
| About | <https://huihui.dev/about/> |
| Works | <https://huihui.dev/works/> |
| Posts | <https://huihui.dev/posts/> |
| Contact | <https://huihui.dev/contact/> |
| Tier Maker | <https://huihui.dev/tools/tier-maker/> |
| English | <https://huihui.dev/en/> |
| Japanese | <https://huihui.dev/ja/> |

---

## Features

| Feature | Description |
|---|---|
| Static-first frontend | HTML / CSS / Vanilla JavaScript pages deployed through Cloudflare Pages |
| Shared layout system | Sidebar, navigation, language switcher, and footer are injected through `js/layout.js` |
| Multilingual support | ZH / EN / JA content is managed through locale files under `js/locales/` |
| API-powered homepage | Tech Updates, NASA APOD, and GitHub project updates are loaded through Workers endpoints |
| About page renderer | Profile content, interest cards, and Steam-powered game cards are rendered through JavaScript |
| Code block UI | Prism.js-based syntax highlighting with filename display, line numbers, copy button, and typing animation |
| Tier Maker | Browser-based ranking tool with custom tiers, image upload, drag-and-drop sorting, and PNG export |
| Contact protection | Cloudflare Turnstile with server-side Worker validation before forwarding messages |
| Responsive UI | Desktop and mobile layouts are handled with shared CSS rules |

---

## Architecture

```text
Browser
  |
  |-- Static frontend
  |     |-- HTML pages
  |     |-- CSS styling
  |     |-- Vanilla JavaScript
  |     |-- Shared layout injection
  |     |-- Locale-based i18n
  |     |-- Client-side tools
  |
  |-- Dynamic data / form actions
        |-- Cloudflare Workers APIs
              |-- RSS feeds
              |-- GitHub API
              |-- NASA APOD API
              |-- Steam Web API
              |-- Turnstile verification

Deployment
  GitHub -> Cloudflare Pages -> huihui.dev
```

---

## Dynamic Content

### Tech Updates

The homepage displays technology news through API-backed cards.

Current sources:

- OpenAI News
- Apple Developer News
- Android Developers Blog

The frontend receives normalized data from a Worker endpoint instead of directly parsing external RSS feeds in the browser.

### NASA APOD

The homepage includes a NASA Astronomy Picture of the Day card.

The Worker handles API fetching, caching, and fallback behavior so the card can remain stable even when the external response changes or fails.

### GitHub Project Updates

The homepage can show the latest repository update information through the GitHub API.

This is used as a lightweight development activity card for the site itself.

### Steam Game Display

The About page includes Steam-powered game cards with:

- app ID mapping
- playtime display
- custom display names
- cover image fallback handling
- selected favorite games

---

## Code Block System

Code blocks use Prism.js plus custom JavaScript behavior.

Example:

```html
<pre class="code-auto"><code class="language-python">
# example.py

print("Hello World")
</code></pre>
```

The renderer automatically adds:

- language label
- filename display
- syntax highlighting
- line numbers
- copy button
- typing animation

This keeps article and About-page code blocks consistent across the site.

---

## Contact Form Flow

```text
Contact form
  ↓
Cloudflare Turnstile
  ↓
Cloudflare Worker
  ↓
Server-side token verification
  ↓
Form handler
  ↓
Inbox
```

Turnstile is only used for user-submitted data. Static pages and read-only content do not need verification.

---

## Tech Stack

| Layer | Tools |
|---|---|
| Frontend | HTML5, CSS3, Vanilla JavaScript |
| UI behavior | Custom JavaScript components |
| Code rendering | Prism.js |
| i18n | Locale files + path-based routing |
| Hosting | Cloudflare Pages |
| Backend APIs | Cloudflare Workers |
| Security | Cloudflare Turnstile |
| External APIs | GitHub API, Steam Web API, NASA APOD API, RSS feeds |
| Version control | Git / GitHub |

---

## Project Structure

```text
/
├── index.html
├── about/
├── works/
├── posts/
├── contact/
├── en/
├── ja/
├── tools/
│   └── tier-maker/
├── images/
│   └── games/
├── js/
│   ├── about-page.js
│   ├── i18n.js
│   ├── layout.js
│   ├── lightbox.js
│   ├── main.js
│   ├── profile-code.js
│   └── locales/
│       ├── zh.js
│       ├── en.js
│       └── ja.js
├── style.css
└── README.md
```

---

## Deployment

The site is deployed through Cloudflare Pages with automatic builds from GitHub.

```bash
git add .
git commit -m "update"
git push
```

After pushing to GitHub, Cloudflare Pages rebuilds and deploys the latest version automatically.

---

## Design Principles

- Keep static pages fast and simple
- Use shared components for repeated layout
- Manage multilingual text through locale files
- Keep tools client-side when no persistence is required
- Cache API responses where possible
- Use Workers only for API normalization, secrets, caching, and validation
- Use Turnstile only where users can submit data
- Avoid full CMS or framework complexity unless the project actually needs it

---

## Scope

### Included

- Personal portfolio pages
- ZH / EN / JA multilingual structure
- Shared layout system
- Locale-based content management
- API-driven homepage cards
- Steam-powered About section
- Turnstile-protected contact form
- Tier Maker tool
- Custom code block renderer
- Cloudflare Pages deployment
- Cloudflare Workers backend endpoints

### Not Included by Design

- Full CMS
- User accounts
- Database-backed content editing
- Heavy backend processing
- AI model training or inference
- Public API platform

---

## Status

Actively maintained.

Current direction: a static-first personal website with reusable multilingual components, interactive frontend tools, and selective Cloudflare Workers backend features.
