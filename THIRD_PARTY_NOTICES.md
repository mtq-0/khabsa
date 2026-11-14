# Third-party notices

- **Twemoji** graphics (used to render seeded picture-pair scenes) — Copyright Twitter, Inc. and other contributors. Graphics licensed under **CC-BY 4.0** (https://creativecommons.org/licenses/by/4.0/). Package `@twemoji/svg` (code MIT).
- **TMDB** (optional): movie/TV posters via the TMDB API. "This product uses the TMDB API but is not endorsed or certified by TMDB." The TMDB logo (`public/tmdb-logo.svg`, unmodified approved logo from themoviedb.org/about/logos-attribution) is shown with this notice in the footer and settings page whenever TMDB is enabled. Poster images are not stored: `src/server/db/seed/posters.json` keeps only TMDB metadata (id, type, poster path, title), refreshed by the "Refresh TMDB posters" GitHub workflow (repository secret `TMDB_TOKEN`). The server edition proxies the images with a small in-memory cache; the GitHub Pages edition loads them directly from TMDB's image CDN. The attribution is shown whenever posters are in use. Free for non-commercial use only.
- **Real photos** in مين برا الصورة؟ (`src/server/db/seed/photos/*.webp`) — from Wikimedia Commons under CC0, public domain, CC BY or CC BY-SA. Each photo was resized/cropped to 800×600 WebP. The author, licence and source of every file are listed in [`src/server/db/seed/photos/CREDITS.md`](src/server/db/seed/photos/CREDITS.md) and shown in the game whenever the pictures are revealed. No photos of identifiable people are used.
- **Background music** (`public/music/theme.mp3`) — a song supplied by the site owner (re-encoded to 128 kbps MP3; the file carries no author/licence tags). Keep the licence or proof of ownership with the project and check that it covers your use (website/games, public sharing).
- **Readex Pro** and **Lalezar** fonts via Fontsource — SIL Open Font License 1.1.
- **Lucide** icons — ISC License.
- **LiveKit** client and server SDKs — Apache License 2.0.
- Other npm dependencies are listed in `package.json` with their own licenses.

The CC-BY attribution "Picture artwork: Twemoji by Twitter/X and contributors, CC-BY 4.0" is shown in the site footer (desktop layout).
