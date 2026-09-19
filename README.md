# KripaBot Website and CMS

Official public website and private content manager for KripaBot (Team 1578), Vishwakarma Vidyalaya English Medium School, Pune.

## Architecture

```
Public Website (GitHub Pages or frontend host)
             |
       Existing Admin CMS
             |
       Existing Express API
          /             \
Google Apps Script       Gemini API
       |                 (server-side only)
Google Drive + optional Google Sheet
       |
CMS metadata (local JSON during development)
```

The public website continues to use `/api/public`; it never talks to Google Drive directly. The CMS record is the source of truth. A Google Sheet is only an optional media index.

## Project structure

```
src/                         Existing React public site and admin UI
server/index.js              Existing Express API, login, upload/review routes
server/storage.js            Existing local JSON CMS data store
server/ai.js                 Provider-neutral Gemini/AI analysis
server/providers/            Local and Apps Script media providers
apps-script/Code.gs          Deployable Google Apps Script Drive bridge
apps-script/README.md        Apps Script setup details
```

## Local development

1. Install Node.js 20 or later.
2. Run `npm install`.
3. Copy `.env.example` to `.env`.
4. Set `JWT_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`.
5. Keep `STORAGE_PROVIDER=local` and `AI_PROVIDER=none`.
6. Run `npm run dev`, then open the Vite URL (normally `http://localhost:5173`).

Build with `npm run build`. The API is served on port 3001 by `npm run dev`.

## Admin and approval workflow

Visit `/admin` and sign in using `ADMIN_EMAIL` and `ADMIN_PASSWORD`. Media always follows this flow:

```
upload -> store -> optional AI suggestions -> admin review/edit -> explicit publish -> public website
```

AI does not publish content. An AI failure also does not delete an uploaded file: the admin can enter metadata manually. Supported uploads remain JPG, PNG, WebP, GIF, MP4, WebM, and MOV; `MAX_UPLOAD_MB` remains the upload limit.

## Google Drive through Apps Script (no service account)

This project does **not** require a Google Cloud service account, Google Cloud billing, a credit card, service-account JSON, or Drive API credentials.

1. Create a private Drive folder for KripaBot media.
2. Create a Google Apps Script project at `script.google.com`.
3. Copy [apps-script/Code.gs](apps-script/Code.gs) into the project.
4. In **Project Settings -> Script properties**, add:
   - `KRIPABOT_SECRET`: a long random shared secret
   - `KRIPABOT_MEDIA_FOLDER_ID`: the Drive folder ID (or `KRIPABOT_DRIVE_FOLDER_ID`)
   - `KRIPABOT_SHEET_ID`: optional Sheet ID for a `Media` index
5. Deploy as **Web app**, execute as **Me**, then copy the `/exec` URL.
6. Add that URL and the same secret to the backend `.env`.
7. Set `STORAGE_PROVIDER=apps-script` and restart the backend.
8. Sign in to `/admin`, upload a small image, check it remains unpublished, then publish it and verify it appears in the public gallery.

Apps Script uses `DriveApp`, `SpreadsheetApp`, `Utilities`, `ContentService`, and `PropertiesService`. It validates a shared server-side secret for `upload`, `get`, `delete`, and `list`. Drive files may remain private: the Express API retrieves media only after a published CMS record is requested. Drive file IDs are not sent to the public frontend.

Apps Script transfers complete bytes as Base64 JSON and does not provide video streaming/range requests here. The bridge therefore defaults to 4 MB for media and 2 MB for video. Small images work normally; only very small clips can use Apps Script video storage, and they are not suitable for normal video hosting or reliable seeking. Local storage still follows `MAX_UPLOAD_MB`; do not silently raise it. Use a dedicated streaming/object-storage workflow before routinely accepting large videos. Apps Script and Gemini quotas/free-tier limits can change.

## Gemini setup

Gemini is optional and server-side only:

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=your-server-only-key
GEMINI_MODEL=gemini-2.0-flash
```

`server/ai.js` validates editable title, description, category, tags, alt text, confidence, and suggested section before saving. It handles unavailable Gemini, timeouts, rate limits, API errors, and malformed responses with safe fallback metadata. Never prefix these values with `VITE_` and never place them in frontend code.

## Environment variables

```env
PORT=3001
JWT_SECRET=long-random-secret
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=strong-unique-password
MAX_UPLOAD_MB=20

STORAGE_PROVIDER=local
# local for development, apps-script for Drive

AI_PROVIDER=none
# none or gemini
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.0-flash

GOOGLE_APPS_SCRIPT_URL=
GOOGLE_APPS_SCRIPT_SECRET=
APPS_SCRIPT_MAX_BRIDGE_MB=4
APPS_SCRIPT_MAX_VIDEO_MB=2
```

The former service-account configuration is deprecated and is not required or read by the active provider. Put real values only in local `.env` files and hosting-provider secret settings, never Git, GitHub Pages, source files, or browser JavaScript. The Apps Script secret is separate from the CMS password.

## Deployment and troubleshooting

GitHub Pages can host the built frontend, but it cannot run this Express API. Deploy `server/index.js` to a Node-capable host and configure the frontend to reach that API over HTTPS. For production, replace the local JSON file with a managed database and keep backups.

- **Apps Script URL/secret missing:** use `STORAGE_PROVIDER=local` until both backend values are set.
- **Drive folder unavailable:** confirm the Script Properties folder ID and that the deploying Google account owns/can edit the folder.
- **Apps Script error or timeout:** uploads return a clear error and do not create a CMS record; retry after fixing the web-app deployment.
- **Gemini error:** the stored media remains available for manual review.
- **Unauthorized admin:** verify the backend environment values, not Apps Script properties.

No achievements, competition results, scores, technical specifications, or other unverified claims are seeded. Add verified content through the CMS.
