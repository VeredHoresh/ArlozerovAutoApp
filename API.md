# Arlo Auto API and phone app

The Node service hosts an authenticated, per-member JSON API, a phone-installable progressive web app, and the always-on scheduling worker. The PWA calls `/api/` on its own HTTPS origin. Credentials and scheduled work remain on the server; the phone is only the interface.

## Authentication

Cloud startup requires a stable ENCRYPTION_KEY and COOKIE_SECURE=true behind HTTPS. POST /api/auth with JSON {phone,password} verifies the caller’s own Fizikal membership and creates a persistent phone session. There is no shared app password. The response sets a rolling 365-day HttpOnly, SameSite=Strict cookie; only the token hash is stored in SQLite. Sessions survive backend restarts and renew on authenticated requests. All private API reads and writes use the account resolved from that cookie, never an account ID supplied by a caller.

POST /api/logout revokes the current phone session and leaves background routines active. DELETE /api/account removes encrypted club credentials, pauses that person’s rules and revokes all their phones. POST /api/account can update credentials only for the already signed-in membership; switching people requires sign-out and a fresh sign-in. Every person has a separate SQLite database and worker. API responses are never cached by the service worker.

## Routes

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Public deployment health check |
| POST | `/api/auth` | Sign in using personal Fizikal phone/password |
| POST | `/api/logout` | Sign out this phone only |
| GET | `/api/state` | Account connection, weekly rules, queued attempts, sync status |
| GET | `/api/calendar?start=YYYY-MM-DD&days=1` | Lazy-loaded selected day; `refresh=1` requests an update |
| GET | `/api/bookings` | Member bookings and waitlist places for the next 60 days |
| POST | `/api/bookings/register` | One occurrence: `{key,date,waitlist}` |
| POST | `/api/bookings/schedule` | Schedule one future occurrence at its club opening time: `{key,date,waitlist}` |
| POST | `/api/bookings/unschedule` | Cancel a pending one-time request: `{key,date}`; does not cancel a club booking |
| POST | `/api/bookings/cancel` | Cancel and exclude one occurrence: `{key,date}` |
| POST | `/api/rules` | Create weekly rule: `{key,start,waitlist,pinInstructor}` |
| PATCH | `/api/rules/:id` | Change `enabled`, `waitlist`, or `pinInstructor` |
| DELETE | `/api/rules/:id` | Remove a recurring rule, preserving existing club bookings |

Responses are JSON. Errors have an `error` string and a non-2xx HTTP status. Mutations verify club status before reporting confirmation; they are not automatically replayed on network failure. Expired authenticated reads reconnect with the encrypted Fizikal credentials and retry once.

## Cloud deployment

Use the included Dockerfile and railway.json, one replica, an always-on instance, and a persistent volume mounted at `/data`. Set `HOST=0.0.0.0`, `DATA_DIR=/data`, `ENCRYPTION_KEY`, `COOKIE_SECURE=true`, and `BOOKING_ENABLED=true` when enabling weekly routines. Let the host set `PORT`. Keep the encryption key and volume across deployments. Connect the Fizikal account through the deployed HTTPS app; local development secrets are excluded from the image.

Do not enable service sleeping: phone activity is not the clock for booking jobs. The worker must run while the app is closed. Monitor `/health` and the in-app booking activity. Restart recovery reconciles in-flight jobs with the club before another mutation.

## Install on a phone

Use the deployed HTTPS URL, not the PC's localhost address. The app includes a manifest, 192/512px and maskable icons, an Apple touch icon, standalone display mode, install help, and an offline fallback. The service worker never caches private API responses or submits bookings offline.

- iPhone: open in Safari, Share → Add to Home Screen; enable Open as Web App if shown.
- Android: open in Chrome, then Install app / Add to Home screen, or use the app's install button when available.

Installation and deployed-phone testing require a live cloud URL. No app-store package is needed.

## One-time registration when booking opens

For a class whose status is not open yet, the app can save a one-time registration request in that member’s persistent jobs database. It uses the club’s `TimeBeforeRegistration` interval; if absent, the app clearly labels the fallback of 24 elapsed hours as estimated. These explicitly authorized one-time requests execute even when `BOOKING_ENABLED=false`; that flag continues to pause weekly automation. No weekly rule is created. Requests survive restarts and can be cancelled in My bookings before execution. Disconnecting the account cancels pending requests.

The worker checks current club state at opening without using the calendar cache, respects the chosen waitlist preference, and confirms the result with a fresh read. Uncertain responses are reconciled before another mutation. Late recovery beyond two minutes is recorded as missed. Server scheduling and network delays mean no exact arrival time or place is guaranteed.

## Phone push notifications

After signing in, the member can enable notifications from More. Permission is requested only after pressing Enable. Authenticated `/api/push/config` returns the VAPID public key and that phone's status; POST/DELETE `/api/push/subscription` adds/removes its subscription. Each subscription is encrypted and bound to the hashed phone session. Logout, account disconnection and session expiry stop delivery. VAPID keys persist at `DATA_DIR/push-vapid.json` (mode 0600); retain this file across deployments.

A separate worker checks final automatic outcomes every 10 seconds and sends Hebrew notifications for confirmed registrations, waitlists and failed/missed attempts. It does not notify on a save or on a retry, or replay results from before opting in. A persistent delivery ledger prevents normal restart duplicates, retries transient delivery failures up to five times, and removes expired subscriptions. Push delivery is best effort and depends on browser/OS settings. Notification taps open My bookings. Weekly automation remains governed by BOOKING_ENABLED; enabling notifications does not enable weekly booking.
