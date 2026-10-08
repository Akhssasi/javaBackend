# JavaPath

An offline, single-page learning platform built from four complete Java/PostgreSQL courses.
No build step, no server, no dependencies — open `index.html` and start reading.

Live site: **https://akhssasi.github.io/javaBackend/**

## Contents

| Course | Sections | Focus |
|---|---|---|
| Java Backend Development | 32 | Core Java → Spring Boot → PostgreSQL → capstone → job prep |
| Java Backend Development (Expanded Edition) | 11 | Deeper modules A–H, portfolio project |
| Spring + PostgreSQL Troubleshooting Guide | 59 | Systematic debugging reference (18 parts, decision tables) |
| PostgreSQL & Database Engineering | 18 | SQL, CTEs, window functions, JOINs, JSONB, full-text search |

**~120 sections · ~968,000 words · ~81 hours of reading.**

## Features

- **Markdown renderer** with headings, GFM tables, nested lists, task lists,
  blockquote callouts, `<details>` solutions/quizzes and raw HTML passthrough.
- **Syntax highlighting** for Java, SQL, Bash, PowerShell, JSON, YAML, XML,
  properties, Dockerfile, diff, Markdown, HTTP, JavaScript, Makefile and nginx —
  each code block gets a language badge and a one-click **Copy** button.
- **Global search** across every lesson. Open it with the 🔍 button,
  the `/` key, or `Ctrl`/`Cmd` + `K`. Results show a highlighted preview.
- **Progress tracking** (per section) saved in `localStorage` — no account.
- **Bookmarks** — star any section; they appear in the sidebar and on the dashboard.
- **Per-section notes** saved locally in your browser.
- **Print / Save as PDF** button with a dedicated print stylesheet
  (opens all solutions and quizzes first).
- **Dark and light themes**, responsive layout with a mobile drawer.
- **Fully offline** — all course content is embedded in `assets/course-data.js`.

## Run it locally

Because everything is static, just open the file:

```
# Windows
start index.html

# macOS
open index.html

# or serve it (optional)
python -m http.server 8000
```

## Project structure

```
JavaPath/
├── index.html              # dashboard: stats, search, courses, bookmarks
├── course.html             # one course: modules + section cards
├── lesson.html             # lesson reader: sidebar, article, notes, pager
├── build-course-data.ps1   # regenerates assets/course-data.js from the .md sources
├── assets/
│   ├── app.js              # renderer, search, progress, bookmarks, notes, theme
│   ├── style.css           # dark default + light theme + print styles
│   └── course-data.js      # generated course content (window.COURSES)
└── .github/workflows/pages.yml
```

## Rebuilding the content

`assets/course-data.js` is generated from the source markdown files by
`build-course-data.ps1` (PowerShell 5.1+):

```powershell
# put the .md sources in the script's parent folder, then:
powershell -ExecutionPolicy Bypass -File .\build-course-data.ps1
```

It splits each markdown file into sections (the first `#` heading is the course
title, later `#` headings become part groups, `##` headings become sections),
tracks code fences, and writes `window.COURSES`.

## Deployment

The included GitHub Actions workflow publishes the site to GitHub Pages on every
push to `main`. One-time setup:

1. Repo **Settings → Pages**.
2. **Build and deployment → Source**: choose **GitHub Actions**.
3. Push to `main` (or run the workflow manually) — the site goes live at
   `https://<user>.github.io/<repo>/`.

## License

Course content is provided for personal learning use.
