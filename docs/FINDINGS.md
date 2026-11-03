# Findings: live test of https://delivery-bottleneck-analyzer-site.vercel.app

Tested 2026-10-06, the day it launched, against what PRODUCT.md and the direction contract promise: a hiring manager gets the finding in 30 seconds, every number opens its PRs, it works on a phone, and nothing on the page blames people.

How it was tested: `curl` for files, headers and weight; headless Chrome (Windows) for rendering, at 1440px in light and dark, at 2x zoom, and with JavaScript off; a scripted test page (served locally without the CSP, which otherwise blocks framing) for keyboard behavior, phone widths and scroll position. No paid calls were made.

## Findings

All five were fixed and redeployed the same day (commit 60d8bb4) and re-checked on the live site.

### 1. A shared link showed no preview card

Steps: fetch the page and look for Open Graph or Twitter tags.
Seen: none. On LinkedIn, the most likely place a hiring manager meets this link, the post would show a bare URL or a plain title.
Fix: Open Graph and Twitter tags, plus a 1200×630 share image (`site/share.png`) rendered from the page's own font and the real snapshot numbers. Every number on the image was checked against `metrics.json`; the merge bar is drawn at a 1% minimum width so it stays visible (its true width would be 0.14% of the scale), and its value is printed beside it.

### 2. Links to a section landed at the top of the page

Steps: open `…/#teams` (or `#queues`, `#method`).
Seen: the page opened at the top. The report sections are drawn by script after load, so the browser's jump to the anchor found nothing.
Fix: after the report renders, scroll to the anchor. Measured afterwards: the Teams section lands 72px from the top, just under the sticky masthead.

### 3. No favicon

Steps: request `/favicon.ico`.
Seen: 404, and a blank tab icon.
Fix: an SVG mark in the report blue (`site/favicon.svg`).

### 4. With JavaScript off, the page said "Loading the snapshot…" forever

Steps: read `index.html` (headless Chrome won't dump a page with scripts disabled, so this was confirmed from the source, not observed).
Seen: the static page holds only the masthead and the loading line.
Fix: a `<noscript>` message that says why the report can't draw and links to the repository; the loading line is hidden when scripting is off.

### 5. In-sentence numbers had no screen-reader context

Steps: read the key-findings markup.
Seen: the clickable numbers in the key findings ("4.1 days", "63%", "272") would be announced as just the number and "button". Figure rows and table numbers already had labels.
Fix: each now says what it opens, for example "272: show the open PRs with no human response".

## Not tested

- Firefox and Safari, and real phones. Only Chromium was available; phone widths were simulated at 390, 360 and 320px.
- A real screen reader (NVDA or VoiceOver). Labels and focus order were checked in the markup and by script, not by listening.
- The page on a slow connection. It weighs about 145 KB compressed and every file returned in under a quarter of a second from here.

## What held up

- **Only the page is public.** With Vercel's root set to `site/`, repository files (`package.json`, `PRD.md`, `.env`, `vercel.json`) all return 404.
- **Security headers are served as configured:** the strict CSP (`default-src 'none'`, scripts, styles and fonts from the site only, no framing), `nosniff`, a referrer policy and a permissions policy, plus HSTS added by Vercel.
- **Weight:** about 145 KB compressed for everything, 104 KB of it the snapshot data.
- **The page as built:** the headline, the plain-English opening, four report sections, 170 numbers that open their PRs and 75 direct PR links, and the reviewed brief, with the "Source" link pointing at the real repository. Every repository link on the page returns 200.
- **Zoom to 200%:** the layout reflows to one column with nothing clipped.
- **Evidence panels** (scripted locally before launch): open with focus on their heading, "Show all" expands, Escape closes and returns focus, a second click toggles closed, and every external link opens with `rel=noopener`.
- **No blame:** the page names teams and stages, never people, and says why.
