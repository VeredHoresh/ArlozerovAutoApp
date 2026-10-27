# Arlo Auto

A private, single-member app for Arlozorov 97. Displays Fizikal's live schedule and saves weekly rules that target registration exactly 24 elapsed hours before each class.

## Run locally

Requires Node.js 24 or newer. No external packages or installation are needed.

```powershell
cd arlo-auto
node --env-file-if-exists=.env server.mjs
```

Open http://127.0.0.1:3000. The default is **preview mode**: live schedule and persisted routines, with automatic weekly booking disabled. Explicit one-time registration and cancellation are available after connecting your account; their final buttons send real requests to Fizikal. Choose **Connect your account** and enter your existing Fizikal phone number/password. Credentials are encrypted locally, not stored in browser storage or source files.

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
| `ADMIN_PASSWORD` | A strong private app password, required outside loopback |
| `ENCRYPTION_KEY` | Stable 32-byte random hex key, required outside loopback |
| `COOKIE_SECURE` | `true`, behind HTTPS |
| `BOOKING_ENABLED` | `true` when ready for live registration |

Generate the key with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Keep it stable across deployments. Losing/changing the key prevents decryption of saved credentials. A local development key is created at `data/local.key` when no environment key is configured; the entire data directory is ignored by Git. Set up credentials again in the deployed app instead of copying development secrets.

Cloud authentication uses a separate app password and short-lived HttpOnly sessions. All writes enforce the same origin. `/health` is the unauthenticated health check. Do not expose the local loopback configuration through a tunnel.

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
