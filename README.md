# Arlo Auto

A personal, multi-account app for Arlozorov 97. Displays Fizikal's live schedule and saves weekly rules that target registration exactly 24 elapsed hours before each class.

## Run locally

Requires Node.js 24 or newer. Run `npm ci` to install the Web Push dependency before starting.

```powershell
cd arlo-auto
npm ci
node --env-file-if-exists=.env server.mjs
```

Open http://127.0.0.1:3000. The default is **preview mode**: live schedule and persisted routines, with automatic weekly booking disabled. Explicit one-time registration and cancellation are available after connecting your account; their final buttons send real requests to Fizikal. Sign in with your existing Fizikal phone number/password. Each person uses their own membership; no separate shared app password is needed. Credentials are encrypted locally, not stored in browser storage or source files.

To enable actual registration, copy `.env.example` to `.env`, change `BOOKING_ENABLED=true`, and restart. Review your routines first. This enables the explicitly selected weekly registrations. To run reliably while the PC is off, deploy the same service to an always-on host later.

## Behavior

- Rules match the stable lesson ID, weekday, and time. Instructor pinning and waitlisting are optional per rule.
- Every five minutes the worker refreshes the next 14 days, persists upcoming occurrences in SQLite, and targets each at its timestamp minus 86,400,000 milliseconds. Near an opening, background refresh yields to the timer.
- The class timestamp includes the club's UTC offset; displays use `Asia/Jerusalem`. At a daylight-saving change, exactly 24 elapsed hours can differ from the same clock time on the preceding day.
- The first attempt begins at the due time. Event-loop scheduling, network latency, host availability, and the club's response affect its actual arrival; this is not a real-time or guaranteed-place service.
- Temporary failures retry with backoff for at most two minutes. Each attempt reads current member status first, and success is reported only after readback. Unknown responses are reconciled before another write. A club API without an idempotency key cannot provide a mathematical exactly-once guarantee.
- New or resumed rules never book an occurrence whose target has already passed. Missed windows are recorded; they are not silently booked later.
- Pausing/removing a rule or disconnecting stops future attempts. Existing registrations remain at the club. Use Upcoming classes to cancel a single booking or waitlist place. The cancelled occurrence is excluded from automatic rebooking; future weeks remain active.
- A substitute instructor is allowed by default; pin the instructor to skip substitutions. An occurrence that changes weekday/time no longer matches.
- Paid classes, seat maps, court bookings, and extra reservation flows require manual booking. Multi-member login results stop for member selection rather than choosing a family member automatically.
- Some class types open earlier than 24 hours; the app shows that difference but preserves your 24-hour target.

## Future cloud deployment

The Dockerfile runs the app with no package install. Use **one always-on replica**, disable sleeping, and mount a persistent volume at `/data`. Configure:

| Variable | Value |
| --- | --- |
| `HOST` | `0.0.0.0` |
| `PORT` | Host's assigned port, default `3000` |
| `DATA_DIR` | `/data` |
| `ENCRYPTION_KEY` | Stable 32-byte random hex key, required outside loopback |
| `COOKIE_SECURE` | `true`, behind HTTPS |
| `BOOKING_ENABLED` | `true` when ready for live registration |

Generate the key with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Keep it stable across deployments. Losing/changing the key prevents decryption of saved credentials. A local development key is created at `data/local.key` when no environment key is configured; the entire data directory is ignored by Git. Set up credentials again in the deployed app instead of copying development secrets.

Each person authenticates with Fizikal. A persistent HttpOnly, SameSite=Strict phone cookie has a rolling 365-day expiration and is renewed on authenticated use. Only its SHA-256 hash is stored server-side; sessions survive restarts. All writes enforce the same origin. `/health` is the unauthenticated health check. Do not expose the local loopback configuration through a tunnel.

Fizikal integration uses the endpoints and request schema served by the original club website. These are not a documented public API and can change. Calendar reads have been verified against the live service; member login and the upcoming-bookings read have been verified with the connected account. Real registration/cancellation mutations have not been exercised without a chosen test class. No actual booking was sent during development.

## Checks

```powershell
node --test
node --check server.mjs
node --check fizikal.mjs
node --check scheduler.mjs
node --check public/app.js
```

Tests exercise timing across Israel's DST boundary, early/late booking, restarts, uncertain responses, preview isolation, full classes, paused rules, and encrypted storage. Integration tests use a fake club; they never register a real member.

## Booking views

Register opens a choice between Just this class (immediate, subject to club availability) and Repeat weekly (a saved 24-hour rule). Upcoming classes reads member registrations and waitlists for the next 60 days, including bookings made outside this app. Recurring classes manages weekly rules. Cancel class shows a confirmation and checks the resulting club status. Club cancellation deadlines apply. A cancelled occurrence stays excluded even if its routine remains enabled. Explicitly registering it again restores that occurrence. Automatic booking remains controlled by BOOKING_ENABLED.

## Schedule performance

The schedule loads only the selected day. Loaded days are retained in the browser, and successful snapshots persist on the server. Saved snapshots render immediately; snapshots older than 30 seconds refresh in the background and are labelled saved. Refresh explicitly requests an updated day, retaining the previous snapshot if the club times out. Background schedule scans use at most three daily requests concurrently. Calendar responses are shared and reused for 15 seconds in the club adapter; booking and cancellation invalidate that cache. Mutation confirmation reads the member bookings endpoint instead of refetching the full schedule.

## Personal accounts and persistent phones

All API routes require a personal Fizikal sign-in, including on localhost. Each verified club member gets a separate database under `data/accounts/<random-id>/`, their own encrypted credentials, schedule cache, bookings, weekly rules, and worker. The root database contains the account directory and hashed persistent-device sessions. Preserve the whole data volume and encryption key when deploying. There is no shared ADMIN_PASSWORD.

Sign out / Switch account revokes only this phone session; weekly routines continue. Disconnect all phones revokes every session for that account, removes its stored Fizikal credentials, and pauses its routines. Another member’s data is untouched. A year of inactivity, explicit logout, browser storage removal, or a new authentication requirement can require sign-in again. This is persistent sign-in, not a promise of permanent access.

Legacy single-account rules and attempts remain intact and migrate only after that same Fizikal membership signs in successfully. The prior development browser session cannot automatically select the owner’s account; sign in once in the updated app.

## Scrolling through days

The schedule starts at the selected day. As the next-day button approaches the viewport, the browser appends another day and requests only `/api/calendar?start=YYYY-MM-DD&days=1`. Earlier sections remain in place while that day loads. Each day has its own loading, saved-data, error and retry state; simultaneous requests for the same date are shared. Account changes discard pending results and clear the feed. Day tabs and week navigation restart the feed at the chosen date, while search filters the days already loaded. Automatic loading stops after 14 days; the next-day button remains available for deliberate continuation and keyboard access.

## Notifications on your phone

After signing in, open More (עוד), select Enable notifications on this phone (הפעלת התראות בטלפון הזה), and allow the browser permission. Notifications report final automatic registration confirmations, waitlists, or failed attempts even with the app closed. Tap an alert to open My bookings. You can disable alerts from the same menu; signing out also removes that phone’s subscription. Browser and phone settings control whether delivery is allowed. Weekly registration remains paused unless BOOKING_ENABLED is enabled separately.
