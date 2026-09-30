# lanskikh.art static portfolio

Pure static HTML/CSS/JS. No build step required.

Files:
- index.html — home
- work.html — projects index
- project-slava-bogu.html — integrated photography + text project template
- archive.html — exhibitions/publications/open calls
- info.html — biography/contact
- assets/styles.css — shared design
- assets/site.js — EN/RU switching + project view tabs

Language:
- EN/RU switch is persisted in localStorage.
- `?lang=en` and `?lang=ru` are supported.
- Internal links preserve the active language.

Deploy:
Commit all files to the repository root. Cloudflare can serve the repository as a static site with no build command.

Project page:
- Sequence is a paged viewer: 23 photos + 5 text slides (after frames 04, 08, 14, 19, 23), one per screen.
- Desktop: mouse wheel / trackpad over the viewer moves one slide per gesture and never scrolls the page; arrow keys, PgUp/PgDn, Home/End and Prev/Next buttons also work.
- Mobile (≤760px): plain column, normal page scroll.
- Scale to the right of the viewer: one tick per slide (short — photo, long — text); click to jump. Built by site.js from the slides, nothing to maintain by hand.
- Watch mode: the «Watch» button or the F key. Dark full screen, one slide at a time, wheel / arrows / click (left third — back), Esc or F to leave; the viewer stays on the last slide shown. UI fades out after ~2 s without movement.
- Click a photo to open it full screen (1600px file); ←/→ or the left/right edges to move, Esc or click to close.
- Images: assets/images/slava-bogu/NN-900.jpg and NN-1600.jpg (sRGB). All photos share one height and one centre axis.
- `alt` is empty for now — fill in per frame if needed.
- Text keys `text1`–`text5` live in assets/site.js (EN and RU).

Home cover:
- assets/images/home-cover-1000.jpg / -1600.jpg — desktop (full frame, srcset)
- assets/images/home-cover-mobile.jpg — tighter 4:5 crop for ≤760px, so the TV screen stays readable
- assets/images/og.jpg — 1200×630 link preview, used on all pages
- Caption text and alt live in site.js (`coverTitle`, `coverAlt`).

Favicon:
- assets/icons/favicon.svg — main icon (CRT screen with the dot of a switched-off tube); adapts to dark browser UI
- favicon.ico (16/32/48) at the root — fallback for older browsers and for requests to /favicon.ico
- assets/icons/apple-touch-icon.png (180) and icon-512.png — home screen / bookmarks
