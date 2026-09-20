# KripaBot Google Apps Script bridge

This is the only Google Drive integration required by the Apps Script architecture. It uses your signed-in Google account's Drive access through `DriveApp`; no service account, Google Cloud billing, or credit card is required.

1. Create a Google Apps Script project at script.google.com.
2. Paste `Code.gs` into the project.
3. Create or select a private Drive folder for KripaBot media and copy its folder ID.
4. In Project Settings > Script properties, add:
   - `KRIPABOT_SECRET`: a long random shared secret
   - `KRIPABOT_MEDIA_FOLDER_ID`: folder ID (or use `KRIPABOT_DRIVE_FOLDER_ID`)
   - `KRIPABOT_SHEET_ID`: optional Google Sheet ID for a media index
5. Deploy > New deployment > Web app. Execute as Me. Set access according to your team's needs; the bridge validates the shared secret on every request.
6. Copy the `/exec` URL into the server's `GOOGLE_APPS_SCRIPT_URL`. Add the same secret as `GOOGLE_APPS_SCRIPT_SECRET`.

The bridge supports `upload`, `get`, `delete`, and `list`. It keeps Drive files private; the KripaBot server requests content only for published CMS media.

## Media limits

Apps Script receives and returns complete Base64 payloads. It cannot stream media or satisfy video range requests. The bridge defaults to a conservative 4 MB media cap and a stricter 2 MB video cap; both upload and get enforce the limit. These are project safety limits, not official Apps Script maximums.

Small images work normally. Very small video clips can work, but they are delivered as complete files and are not suitable for reliable seeking or ordinary video hosting. Keep `STORAGE_PROVIDER=local` for videos up to `MAX_UPLOAD_MB`, or use dedicated object storage before publishing larger videos. The optional Script Properties `KRIPABOT_MAX_BRIDGE_BYTES` and `KRIPABOT_MAX_VIDEO_BYTES` can lower the Apps Script limits; match any change in the backend environment.

The optional Media sheet is an index, not the CMS source of truth. Do not add passwords, API keys, or secret values to this source file.
