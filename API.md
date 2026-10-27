# Arlo Auto API and phone app

The Node service hosts a private JSON API, a phone-installable progressive web app, and the always-on scheduling worker. The PWA calls `/api/` on its own HTTPS origin. Credentials and scheduled work remain on the server; the phone is only the interface.

## Authentication

Cloud startup requires `ADMIN_PASSWORD` and a stable `ENCRYPTION_KEY`. Sign in with `POST /api/auth` and a JSON `{ "password": "…" }` body. The response sets a 12-hour HttpOnly, SameSite=Strict cookie; API clients should include cookies. Production requires HTTPS and `COOKIE_SECURE=true`. Browser writes require an Origin matching the app's host. This app is for one private member, not a public multi-user service.

Fizikal login is separate: `POST /api/account` with phone/password connects the club account and saves encrypted credentials server-side. `DELETE /api/account` disconnects and pauses weekly rules. Never put these credentials into app source, the PWA manifest, URLs, or service-worker caches.

## Routes

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Public deployment health check |
| POST | `/api/auth` | Authenticate to the private app |
| GET | `/api/state` | Account connection, weekly rules, queued attempts, sync status |
| GET | `/api/calendar?start=YYYY-MM-DD&days=1` | Lazy-loaded selected day; `refresh=1` requests an update |
| GET | `/api/bookings` | Member bookings and waitlist places for the next 60 days |
| POST | `/api/bookings/register` | One occurrence: `{key,date,waitlist}` |
| POST | `/api/bookings/cancel` | Cancel and exclude one occurrence: `{key,date}` |
| POST | `/api/rules` | Create weekly rule: `{key,start,waitlist,pinInstructor}` |
| PATCH | `/api/rules/:id` | Change `enabled`, `waitlist`, or `pinInstructor` |
| DELETE | `/api/rules/:id` | Remove a recurring rule, preserving existing club bookings |

Responses are JSON. Errors have an `error` string and a non-2xx HTTP status. Mutations verify club status before reporting confirmation; they are not automatically replayed on network failure. Expired authenticated reads reconnect with the encrypted Fizikal credentials and retry once.

## Cloud deployment

Use the included Dockerfile and railway.json, one replica, an always-on instance, and a persistent volume mounted at `/data`. Set `HOST=0.0.0.0`, `DATA_DIR=/data`, `ADMIN_PASSWORD`, `ENCRYPTION_KEY`, `COOKIE_SECURE=true`, and `BOOKING_ENABLED=true` when enabling weekly routines. Let the host set `PORT`. Keep the encryption key and volume across deployments. Connect the Fizikal account through the deployed HTTPS app; local development secrets are excluded from the image.

Do not enable service sleeping: phone activity is not the clock for booking jobs. The worker must run while the app is closed. Monitor `/health` and the in-app booking activity. Restart recovery reconciles in-flight jobs with the club before another mutation.

## Install on a phone

Use the deployed HTTPS URL, not the PC's localhost address. The app includes a manifest, 192/512px and maskable icons, an Apple touch icon, standalone display mode, install help, and an offline fallback. The service worker never caches private API responses or submits bookings offline.

- iPhone: open in Safari, Share → Add to Home Screen; enable Open as Web App if shown.
- Android: open in Chrome, then Install app / Add to Home screen, or use the app's install button when available.

Installation and deployed-phone testing require a live cloud URL. No app-store package is needed.
