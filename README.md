# lanskikh.art static portfolio

Pure static HTML/CSS/JS. No build step required.

Files:
- index.html — home
- work.html — projects index
- project-slava-bogu.html — sample project template
- text.html — text index
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
