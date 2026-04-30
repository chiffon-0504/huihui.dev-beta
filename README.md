# huihui_project-v1

## Overview

huihui.dev is a personal portfolio and development-focused website built with a hybrid architecture combining static frontend and serverless backend.

The project emphasizes clean UI, maintainability, and real-world engineering practices, including shared layouts, API integration, and edge deployment.

---

## Features

### Core Pages
- Homepage (hero + dynamic cards)
- About / Works / Posts / Contact
- Multi-language support (ZH / EN / JA)

### UI / UX
- Shared layout system (sidebar, navigation, footer)
- Responsive design (desktop & mobile)
- Image gallery with lightbox
- Post card layout system

### Developer Features
- Code block system (Prism.js)
  - Syntax highlighting
  - Line numbers
  - Copy button
  - Filename display

### Interactive Tools
- Tier Maker (custom ranking tool)
- Client-side PNG export

### Dynamic Content
- Tech Updates (real-time data from official sources)
  - OpenAI News
  - Apple Developer News
  - Android Developers Blog

### Backend / API
- Cloudflare Workers (serverless API layer)
- RSS parsing + data normalization
- API caching for stability

### Security
- Contact form with Turnstile verification
- Server-side validation via Workers
- Spam protection pipeline (Turnstile → Worker → Form handler)

---

## Architecture

### Frontend
- Static HTML / CSS / Vanilla JavaScript
- Path-based multi-language routing (`/`, `/en/`, `/ja/`)

### Shared Layout System
- Layout injected via `layout.js`
- Centralized control of:
  - Sidebar
  - Navigation
  - Language switcher
  - Footer

### Backend (Serverless)
- Cloudflare Workers as API layer
- Handles:
  - External API fetching
  - RSS parsing
  - Security validation
  - Response formatting

### Deployment
- Cloudflare Pages (CDN + edge deployment)
- GitHub integration (auto CI/CD)

---

## Tech Stack

- HTML5
- CSS3
- JavaScript (Vanilla)
- Prism.js
- GitHub
- Cloudflare Pages
- Cloudflare Workers

---

## Project Structure

```
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
├── js/
│   ├── main.js
│   └── layout.js
├── style.css
└── assets/
```

---

## Deployment Workflow

```bash
git add .
git commit -m "update"
git push
```

- Changes are pushed to GitHub
- Cloudflare Pages automatically rebuilds and deploys
- Live site updates within ~10–30 seconds

---

## Design Decisions

- Static-first architecture for performance and simplicity
- Serverless backend only where needed (API / security)
- Shared layout to reduce duplication and maintenance cost
- API caching to avoid instability from external sources
- Client-side rendering for interactive tools

---

## Current Scope

### Included
- Static pages
- API-driven content
- Interactive frontend tools
- Basic backend validation

### Not Included (by design)
- Database (no persistent storage)
- Full authentication system
- Heavy backend processing

---

## Notes

- Tech Updates relies on external sources and may occasionally fallback when APIs fail
- Turnstile is only applied where user input is accepted (e.g., contact form)
- Most pages remain static and do not require backend interaction

---

## Status

Actively maintained and evolving.

This project has transitioned from a simple static site into a structured frontend + serverless architecture.