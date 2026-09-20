# KripaBot Website

Official public website and private content manager for KripaBot (Team 1578), Vishwakarma Vidyalaya English Medium School, Pune.

## Stack

- React, TypeScript, and Vite for the public site and admin UI
- Express for the API and authentication
- JSON file storage for the current lightweight CMS
- Local filesystem or optional Google Apps Script storage for media
- JWT admin sessions and optional bcrypt password hashes

## Local development

1. Install Node.js 18 or newer.
2. Copy `.env.example` to `.env` and set a long random `JWT_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`.
3. Install dependencies with `npm install`.
4. Start the Vite client and API with `npm run dev`.

The client runs on Vite's local port and proxies `/api` and `/uploads` to the Express API on port 3001. The API can also be started separately with `npm run server`.

## Environment variables

See `.env.example`. Secrets belong only in the local `.env` file or the deployment provider's secret settings. For production, prefer `ADMIN_PASSWORD_HASH` with a bcrypt hash and set `STORAGE_PROVIDER` to a durable external provider. Local JSON storage and `server/uploads` are not durable across many hosting platforms.

## CMS

Open `/admin` after starting the project. The CMS supports authenticated management of media, projects, achievements, team members, links, settings, and categories. Uploaded media stays unpublished until reviewed and published by an administrator.

The current JSON CMS is intentionally small and suitable for a student project. Writes use atomic file replacement to avoid partial JSON files, but the store is still a single-process read-modify-write system. If multiple administrators or high write volume become requirements, move the data layer to a managed database before scaling the application. Keep `DATA_DIR` and `UPLOAD_DIR` on persistent storage and back them up separately.

## Build and deployment

Run `npm run build` to create the Vite production bundle in `dist`. `npm run preview` serves that bundle locally.

Cloudflare Pages can host the static Vite frontend with:

- Build command: `npm run build`
- Output directory: `dist`

The `_redirects` file preserves SPA routes such as `/admin` on Pages. The Express API cannot run unchanged on Cloudflare Pages because it uses a long-running Node server, local filesystem storage, and Multer memory uploads. Deploy the API to a Node-compatible host, configure the frontend/API origin as needed, and use durable object storage for production media. A future Workers migration would require replacing Express, local files, and the JSON database with Workers-compatible services.

### Production deployment

Frontend: connect this GitHub repository to Cloudflare Pages with build command `npm run build` and output directory `dist`. Pages serves the Vite frontend only; it does not automatically host this Express API.

Backend: deploy the repository to a Node-compatible host with HTTPS, environment variables, enough memory for the configured upload limit, a suitable request timeout, and reliable process startup. The production start command is `npm run server`, which runs `node server/index.js`.

API: set `VITE_API_BASE_URL` in the Cloudflare Pages build environment to the public HTTPS API origin. Set `FRONTEND_ORIGIN` on the API to the exact frontend origin. `VITE_*` values are public and must never contain secrets.

CMS data: JSON storage is acceptable only when the backend host provides persistent disk and regular backups. Set `DATA_DIR` to that persistent location. It remains single-instance oriented and uses read-modify-write operations, so move to a managed database before adding multiple administrators or scaling horizontally.

Media: use durable object/file storage for production media. Local storage requires a persistent volume and backups. Apps Script remains an optional small-media bridge; its Base64 design is unsuitable for large production videos.

Required environment variable names are listed in `.env.example`; use the host's secret settings and do not commit `.env`.

## Project structure

- `src/main.tsx`: public website and CMS UI
- `src/styles.css`: shared visual system and responsive styles
- `server/index.js`: API, authentication, uploads, and SPA serving
- `server/storage.js`: JSON data store
- `server/providers/`: media storage providers
- `public/`: static assets, robots, sitemap, and deployment redirects

## Checks

```bash
npm install
npm run build
node --check server/index.js
```

There is currently no dedicated lint script in `package.json`; TypeScript compilation is part of the Vite build.

## Manual browser checklist

Browser automation is not configured in this repository. Before release, manually test in Chrome or Edge at desktop widths 1366x768 and 1920x1080, and mobile widths 375px and 390px:

- Home, navigation, hero, gallery, footer, and external links
- `/admin` direct navigation and refresh
- Login success, invalid login, logout, and protected API behavior
- CMS create, edit, delete confirmation, empty states, and network errors
- Image/video upload, validation error, progress state, preview, publish, and delete
- Keyboard navigation, visible focus, form labels, dialog close behavior, and readable contrast
