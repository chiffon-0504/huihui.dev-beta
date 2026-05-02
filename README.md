# huihui_project-v1

## Overview

huihui.dev is a personal portfolio and development-focused website built with a static frontend and a serverless backend layer.

The project started as a personal static site, but has evolved into a structured web project with shared layouts, multilingual content management, API-driven cards, interactive tools, and Cloudflare edge deployment.

---

## Live Site

- Website: <https://huihui.dev>
- Repository: <https://github.com/chiffon-0504/huihui_project-v1>

---

## Features

### Core Pages

- Homepage with hero section and dynamic cards
- About page
- Works gallery
- Posts page
- Contact page
- Tier Maker tool
- ZH / EN / JA language versions

### Shared Layout / i18n

- Shared sidebar, navigation, language switcher, and footer via `js/layout.js`
- Locale-based text management via:
  - `js/locales/zh.js`
  - `js/locales/en.js`
  - `js/locales/ja.js`
- Path-based language routing:
  - `/`
  - `/en/`
  - `/ja/`

### Code Block System

Custom Prism.js-based code block rendering:

- Syntax highlighting
- Line numbers
- Filename display
- Language label
- Copy button
- Typing animation effect
- Custom keyword highlighting

Example usage:

```html
<pre class="code-auto"><code class="language-python">
# example.py

print("Hello World")
</code></pre>
```

### Dynamic Homepage Cards

Homepage dynamic content is loaded through Cloudflare Workers APIs:

- Tech Updates
  - OpenAI News
  - Apple Developer News
  - Android Developers Blog
- NASA APOD
- GitHub project update card

### About Page Dynamic Content

The About page is component-driven and includes:

- Generated profile code block via `js/profile-code.js`
- About page rendering via `js/about-page.js`
- Steam API integration for Galgame display
- Custom Steam game names and fallback images
- Localized labels and copyright notes

### Interactive Tools

- Tier Maker
- Custom tier rows
- User image upload
- Drag-and-drop sorting
- Client-side PNG export
- Localized ZH / EN / JA versions

### Contact Form / Security

The contact form uses a real anti-spam flow:

```text
Contact form
→ Cloudflare Turnstile
→ Cloudflare Worker
→ Server-side Turnstile validation
→ Form handler
→ Inbox
```

This prevents spam more effectively than frontend-only validation.

---

## Architecture

```text
Static frontend
  ↓
HTML / CSS / Vanilla JavaScript
  ↓
Shared layout + i18n layer
  ↓
Cloudflare Pages

Dynamic features
  ↓
Cloudflare Workers APIs
  ↓
External sources / validation services
```

### Frontend

- Static HTML pages
- CSS-based responsive UI
- Vanilla JavaScript components
- Prism.js for code rendering
- Lightbox for image previews
- Client-side rendering for tools

### Serverless Backend

Cloudflare Workers are used only where backend behavior is needed:

- RSS / API fetching
- Data normalization
- Response caching
- GitHub update fetching
- NASA APOD fetching
- Steam library fetching
- Contact form validation
- Turnstile server-side verification

### Deployment

- Cloudflare Pages for frontend hosting
- Cloudflare Workers for API endpoints
- GitHub push-based deployment

---

## Tech Stack

- HTML5
- CSS3
- JavaScript
- Prism.js
- Cloudflare Pages
- Cloudflare Workers
- Cloudflare Turnstile
- GitHub
- Steam Web API
- NASA APOD API
- RSS feeds

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

## Deployment Workflow

```bash
git add .
git commit -m "update"
git push
```

After pushing to GitHub, Cloudflare Pages automatically rebuilds and deploys the latest version.

---

## Design Decisions

- Static-first architecture for speed and simplicity
- Serverless backend only for features that require external fetching, validation, or secrets
- Shared layout to reduce duplicated HTML across languages
- Locale files to reduce repeated multilingual edits
- Client-side rendering for lightweight interactive tools
- API caching to avoid instability from external sources
- Turnstile only where user input is accepted

---

## Current Scope

### Included

- Personal portfolio pages
- Multilingual site structure
- Shared layout system
- Locale-based text management
- API-driven homepage cards
- Steam-powered About page section
- Contact form with Turnstile verification
- Tier Maker tool
- Code block rendering system

### Not Included by Design

- Full database-backed CMS
- Full authentication system
- User accounts
- Heavy backend processing
- AI model execution or training

---

## Notes

- Dynamic cards depend on external sources and may fall back when a source is temporarily unavailable.
- Most pages remain static and do not require backend interaction.
- Contact form protection is handled server-side through Workers and Turnstile.
- API endpoints should be cached where possible to reduce external request instability.

---

## Status

Actively maintained.

Current direction: a personal website with a static-first frontend, reusable multilingual components, and selective serverless backend features.