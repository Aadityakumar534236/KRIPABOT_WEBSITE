# KripaBot Deployment Decision

## Architecture

- Frontend: GitHub repository deployed to Cloudflare Workers Builds as a static-assets Worker
- Backend: the same repository deployed to a Node-compatible HTTPS host with `npm run server`
- API configuration: `VITE_API_BASE_URL` is set only in the frontend build environment and contains a public API URL, never a secret
- CMS data: `DATA_DIR` on persistent disk while JSON storage remains in use
- Media: durable object/file storage for production; Apps Script only for small media

Cloudflare Workers serves the Vite frontend from `dist` using `wrangler.jsonc`. Its `assets.not_found_handling` setting serves `index.html` for SPA routes such as `/admin`. The current Express server, Multer upload path, and local filesystem CMS remain outside Workers.

## JSON storage

Advantages:

- Simple
- Existing implementation
- Easy backup
- No database migration

Limitations:

- Single-instance oriented
- Concurrent writes can overwrite each other because operations are read-modify-write
- Requires persistent disk
- Not ideal for scaling

Keep JSON storage for a small, single-instance deployment with persistent disk and backups. Atomic file replacement prevents partial JSON files but does not solve concurrent-write coordination.

## Managed database

Advantages:

- Durable
- Better concurrent access
- Easier future scaling

Limitations:

- Additional configuration
- Migration required

Do not migrate automatically. Revisit this option when the backend host has ephemeral storage, more than one active CMS administrator, or horizontal scaling requirements.

## Media storage

Local media storage is appropriate only with persistent disk and backups. Production media should use durable object/file storage. The Apps Script provider sends complete Base64 payloads and is limited to small files, so it should not store large production videos.

## Backend requirements

The API host must provide Node.js support, HTTPS, environment variables, persistent storage for `DATA_DIR` and any local `UPLOAD_DIR`, enough memory for the configured upload limit, a suitable request timeout, and a reliable process manager. Start it with the existing package script:

```bash
npm run server
```

## Release sequence

1. Push final code to GitHub.
2. Deploy the frontend through Cloudflare Workers Builds using `npm run build`, output directory `dist`, and `npx wrangler deploy`.
3. Deploy the API to a Node-compatible host using `npm run server`.
4. Configure production environment variables and secrets.
5. Configure durable media storage.
6. Set `VITE_API_BASE_URL` and rebuild the frontend.
7. Test the API, frontend, CMS, uploads, and mobile layouts.
8. Monitor API and storage errors.
