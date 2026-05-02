# huihui.dev

<p align="center">
  <strong>A static-first personal website with multilingual pages, dynamic API cards, interactive tools, and a Cloudflare serverless backend.</strong>
</p>

<p align="center">
  <a href="https://huihui.dev">Live Site</a>
  ·
  <a href="https://github.com/chiffon-0504/huihui_project-v1">Repository</a>
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

**huihui.dev** is a personal portfolio and development-focused website.

The project began as a static HTML / CSS / JavaScript website and has evolved into a small but structured web system with:

- shared layout components
- ZH / EN / JA multilingual pages
- API-driven homepage cards
- Steam-powered About page content
- a custom code block renderer
- a browser-based Tier Maker tool
- Cloudflare Workers backend APIs
- Turnstile-protected contact form flow

The main design goal is simple: keep the frontend fast and maintainable, then use serverless APIs only where dynamic behavior is actually needed.

---

## Demo

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

## Highlights

| Feature | Description |
|---|---|
| Static-first frontend | HTML / CSS / Vanilla JavaScript pages deployed on Cloudflare Pages |
| Shared layout | Sidebar, navigation, language switcher, and footer are injected through `js/layout.js` |
| Multilingual content | ZH / EN / JA text is managed through locale files under `js/locales/` |
| Dynamic homepage cards | Tech Updates, NASA APOD, and GitHub project updates are loaded from API endpoints |
| About page renderer | `js/about-page.js` renders profile content, interest cards, and Steam-powered game cards |
| Code block system | Prism.js-based syntax highlighting with filename display, line numbers, copy button, and typing animation |
| Tier Maker | Client-side ranking tool with image upload, custom tiers, drag-and-drop sorting, and PNG export |
| Contact security | Cloudflare Turnstile + Workers server-side validation before forwarding messages |

---

## Architecture

```text
Browser
  |
  |-- Static pages
  |     HTML / CSS / Vanilla JavaScript
  |     Shared layout
  |     Locale files
  |     Client-side tools
  |
  |-- Dynamic cards / form actions
        Cloudflare Workers APIs
          |-- RSS feeds
          |-- GitHub API
          |-- NASA APOD API
          |-- Steam Web API
          |-- Turnstile verification

Deployment
  GitHub → Cloudflare Pages → huihui.dev
```

---

## Main Features

### Pages

- Homepage
- About
- Works
- Posts
- Contact
- Tier Maker
- English pages
- Japanese pages

### Dynamic Cards

The homepage loads dynamic content through Cloudflare Workers:

- **Tech Updates**
  - OpenAI News
  - Apple Developer News
  - Android Developers Blog
- **NASA APOD**
- **GitHub Project Updates**

### About Page

The About page is rendered through JavaScript components and includes:

- localized profile section
- generated Python-style profile code block
- maimai / Arcaea / Galgame interest cards
- Steam API game display
- custom game names and fallback images

### Code Block Renderer

Use this pattern anywhere in the site:

```html
<pre class="code-auto"><code class="language-python">
# example.py

print("Hello World")
</code></pre>
```

It automatically adds:

- language label
- filename display
- syntax highlighting
- line numbers
- copy button
- typing animation

### Contact Form Security

```text
Contact form
  ↓
Cloudflare Turnstile
  ↓
Cloudflare Worker
  ↓
Server-side token validation
  ↓
Form handler
  ↓
Inbox
```

Turnstile is only used where user input is accepted. Static display pages do not need it.

---

## Tech Stack

| Layer | Tools |
|---|---|
| Frontend | HTML5, CSS3, Vanilla JavaScript |
| UI / Code rendering | Prism.js, custom JS renderer |
| i18n | Locale files + path-based routing |
| Hosting | Cloudflare Pages |
| Backend | Cloudflare Workers |
| Security | Cloudflare Turnstile |
| APIs | GitHub API, Steam Web API, NASA APOD API, RSS feeds |
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

The site is deployed through Cloudflare Pages.

```bash
git add .
git commit -m "update"
git push
```

After pushing to GitHub, Cloudflare Pages automatically rebuilds and deploys the latest version.

---

## Design Principles

- Keep static pages fast and simple
- Avoid backend complexity unless the feature actually needs it
- Centralize repeated layout and multilingual text
- Cache API responses where possible
- Keep tools client-side when no persistence is required
- Use Turnstile only for user-submitted data

---

## Scope

### Included

- Personal portfolio pages
- Multilingual structure
- Shared layout system
- Locale-based content management
- API-driven homepage cards
- Steam-powered About section
- Contact form with Turnstile validation
- Tier Maker tool
- Custom code block rendering

### Not Included by Design

- Full CMS
- User accounts
- Full authentication system
- Database-backed content editing
- Heavy backend processing
- AI model training or inference

---

## Status

Actively maintained.

Current direction: a static-first personal website with reusable multilingual components and selective Cloudflare Workers backend features.