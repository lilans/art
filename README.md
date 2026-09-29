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
- Sequence: 23 frames with the five texts inside the sequence (after frames 04, 08, 14, 19, 23).
- Each frame sets its own size and side in HTML: `frame-large` (left, full), `frame-medium` (left, ~82%), `frame-small` (right, ~70%). Change the class to change the rhythm.
- To add an image, replace the placeholder div in a frame with the commented `<img>` line. Images are capped at 88vh, so vertical frames never exceed the screen.
- Text keys `text1`–`text5` live in assets/site.js (EN and RU).
