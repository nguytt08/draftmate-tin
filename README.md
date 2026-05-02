# DraftMate — by Tin

An async-friendly online draft app. Users don't need to be online at the same time — they're notified by email and SMS when it's their turn and have a configurable time window to pick. A live draft board updates in real time for anyone who is watching.

## Features

- **Async drafting** — configurable pick timer (default 2 hours); when the timer expires the configured auto-pick behavior fires: random item, skip (falls back to random), or **Commissioner Pick** — timer expires and the commissioner is alerted via an amber banner in the draft room and a "⏱ Pick needed" indicator on the dashboard; they use the Override button to make the call manually
- **Real-time board** — Socket.io pushes full board snapshots to all connected clients after every pick, auto-pick, pause, and resume — no page refresh needed; draft room header shows the league name, current round/pick, and a live countdown timer
- **Custom item pools** — commissioners define any pool of items to draft from (players, teams, movies, etc.); add items one at a time or bulk-import from a newline-separated list
- **Bucket / category system** — items can be grouped into named buckets (e.g. UPPER, LOWER, GIRL, REC); displayed as columns in both the league setup and the draft room
- **Enforce bucket picking** — optional commissioner setting that prevents drafters from picking more than one item per bucket; a live status bar in the draft room shows which buckets are used up
- **Drag-and-drop bucket assignment** — commissioners can drag items between bucket columns in league setup to reassign them; dropping on the "No bucket" column clears the assignment; on mobile a per-item dropdown replaces drag since touch screens don't support HTML5 drag events
- **Snake & linear formats** — with the strategy pattern in place for adding more formats later
- **Email + SMS notifications** — via SendGrid and Twilio
- **Inline item notes** — commissioner notes always visible below each item in the draft room; each drafter keeps private personal notes that appear inline and expand to edit on click; a "Hide Notes / Show Notes" toggle lives next to the Available count and persists across page loads
- **Member display names** — commissioners enter a display name when inviting members; names appear throughout the draft board and pick history; email addresses are not exposed to other members
- **Magic link invites** — per-member: commissioner invites with name + optional email; invitee gets a 12-char link that authenticates them instantly, no password required; link is persistent and works as a re-login key
- **Draft join link** — one shareable link per league; anyone with it sees the list of unclaimed member slots and self-selects their identity; after claiming, the page shows the user their personal recovery link to bookmark; commissioner can regenerate the code to revoke old links
- **Self-reclaim on join page** — optional commissioner toggle ("Allow self-reclaim on join page" in draft settings); when enabled, all claimed slots appear at the bottom of the join page in a grayed-out section; clicking a guest/stub slot re-issues a fresh access link (reclaim flow); clicking a real registered-account slot prompts the user to sign in with their email instead — real accounts cannot be hijacked via the join page
- **Session recovery** — after joining via the draft link, users are shown their personal magic link to save; commissioner can retrieve any member's magic link from the member list meatball menu (⋯ → Copy Magic Link); invite token stored in `localStorage` as a silent re-auth fallback for browsers that block cross-domain cookies (Safari ITP, Chrome on iOS); email/password users also receive a recovery token on login if they have a league membership, enabling the same silent re-auth without being booted on refresh
- **Commissioner override pick** — commissioner can pick on behalf of whoever's current turn it is directly from the draft room; a muted "Override" button appears on each available item when it's not the commissioner's own turn; respects bucket enforcement (Override button disabled + bucket dimmed if current member already picked from that bucket); requires confirmation before submitting; picks made this way show a 👑 crown indicator on the draft board and "(commissioner pick)" in the pick history
- **Commissioner self-join** — "Join as drafter" button in league setup adds the commissioner as a member linked to their existing account (no invite flow needed); commissioner's real email is stored on the member slot so their row shows their email rather than "No email"; "(You)" tag marks their slot in the member list
- **Member management** — commissioner can delete any member slot (✕), revoke a claimed member's access (resets to claimable), or copy their personal magic link; all from the member list in league setup
- **Commissioner opt-in** — commissioners are not automatically added as a league member; they add themselves via the invite form if they want to participate as a drafter
- **Auto-save settings** — draft settings (rounds, timer, format, etc.) save automatically 800ms after any change; the Save button shows "Saving…" / "Saved ✓" feedback
- **Dashboard navigation** — shows live draft status per league; active/paused drafts link to the draft room; completed drafts show a "View Results" button so the board stays accessible after the draft ends
- **Delete league** — commissioner can permanently delete a league from the dashboard (✕ button on the card); confirmation dialog required; all members, items, picks, and draft data are removed
- **Draft reset** — commissioner can wipe all picks and restart from pick 1 without leaving the draft room; soft-deleted items are excluded from the availability reset so they remain removed
- **Force-delete already-picked items** — attempting to delete an item that has already been picked shows a "cannot delete" notice; commissioner can force-delete it (soft-delete: `isDeleted` flag set, Pick row kept); the draft board shows `(removed)` with strikethrough in that slot so draft history is preserved; auto-pick and the available-items pool both exclude soft-deleted items; league deletion still cascades and removes the row entirely
- **Secure auth** — JWT access tokens (15 min, auto-refreshed silently) + HttpOnly refresh tokens (30-day rotation)
- **Admin impersonation panel** — site admin (identified by `ADMIN_EMAILS` env var, no schema changes) can view `/admin` to see all registered users with league/membership counts; "View as" button issues a 24h access token for any user so the admin sees exactly what they see — their leagues, draft state, settings — for debugging; a fixed purple banner shows who is being impersonated and an "Exit" button restores the admin's own session via cookie refresh; guest stub accounts (`@draftmate.internal`) are hidden from the list
- **Draft order management** — new members are automatically assigned sequential draft positions as they are added (no manual ordering required); commissioner can drag-and-drop member rows to reorder on desktop (ghost drop zone at the bottom for last-position drops) or tap ▲ / ▼ buttons on mobile; Randomize button still available for a one-click shuffle; a warning badge appears on the Start Draft button if any member still has no position assigned
- **Draft Order schedule** — collapsible pick schedule table above the Recent Picks panel in the draft room showing the full sequential order (member, round, pick number); auto-scrolls to the current pick row on every state update
- **Mobile draft board view modes** — "By Round" (default) and "By Team" toggle in the draft board header on mobile; By Round renders cards in correct snake pick order; By Team shows a compact member × round table for a full overview
- **"Your next pick" countdown** — the yellow waiting banner in the draft room shows how many picks until it's your turn ("Your next pick is in X picks" or "Your pick is next!")
- **Mobile-responsive UI** — all pages adapt below 768px via a `useIsMobile` hook (no extra libraries); Draft Room collapses from three horizontal columns to a vertical stack with the item pool first; the draft board replaces the wide member-column table with a round-by-round 2-column card grid readable without horizontal scrolling; panels stretch full-width; LeagueSetup bucket grid wraps to auto-fill columns; commissioner notes editor stacks vertically on mobile; bucket reassignment uses a dropdown instead of drag-and-drop on touch screens

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL via Prisma ORM |
| Real-time | Socket.io |
| Job Queue | BullMQ + Redis |
| Email | Nodemailer + SendGrid |
| SMS | Twilio |
| Frontend | React + Vite, Zustand, React Query |

## Prerequisites

- Node.js 18+
- Docker (for local Postgres + Redis)

## Getting Started

### 1. Clone and install

```bash
git clone <repo-url>
cd draftmate
npm install
```

### 2. Start local infrastructure

```bash
docker-compose up -d
```

This starts PostgreSQL on port 5432 and Redis on port 6379.

### 3. Configure environment

```bash
cp .env.example server/.env
```

Edit `server/.env` and fill in the required values:

```env
# Required
DATABASE_URL=postgresql://draft:draft@localhost:5432/draft_dev
REDIS_URL=redis://localhost:6379
JWT_SECRET=<at least 32 random characters>

# Optional — notifications work in log-only mode without these
ADMIN_EMAILS=
SENDGRID_API_KEY=SG.xxxxx
EMAIL_FROM=noreply@yourdomain.com
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_PHONE_NUMBER=+15551234567
```

### 4. Run database migrations

```bash
npm run db:migrate --workspace=server
```

### 5. Start the dev servers

```bash
npm run dev
```

- API server: `http://localhost:3001`
- React client: `http://localhost:5173`

## Project Structure

```
draftmate/
├── docker-compose.yml        # Local Postgres + Redis
├── .env.example
├── server/                   # Express API
│   ├── prisma/
│   │   └── schema.prisma     # Database schema
│   └── src/
│       ├── index.ts          # Server entry point
│       ├── modules/          # Auth, league, item, draft modules
│       ├── services/
│       │   ├── draft-engine/ # Draft strategy + core engine
│       │   ├── notification/ # Email + SMS
│       │   └── timer/        # BullMQ job scheduling
│       └── workers/          # BullMQ worker processes
└── client/                   # React + Vite frontend
    └── src/
        ├── pages/            # Login, Dashboard, LeagueSetup, DraftRoom
        ├── api/              # Axios client + React Query hooks
        ├── socket/           # Socket.io client
        └── store/            # Zustand auth state
```

## API Overview

All routes are prefixed with `/api/v1`. Most require a `Bearer <accessToken>` header.

| Group | Key Endpoints |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/invite/magic/:token`, `POST /auth/invite/accept/:token` (password flow), `POST /auth/join/:code/claim` |
| Admin | `GET /auth/admin/users` (requireAdmin), `POST /auth/admin/impersonate/:userId` (requireAdmin) |
| Leagues | `POST /leagues`, `GET /leagues`, `GET /leagues/:id`, `PATCH /leagues/:id`, `DELETE /leagues/:id`, `PUT /leagues/:id/settings`, `GET /leagues/join/:code` (public) |
| Members | `GET /leagues/:id/members`, `POST /leagues/:id/members/invite`, `POST /leagues/:id/members/randomize-order`, `POST /leagues/:id/members/reorder` (commissioner), `PATCH /leagues/:id/members/:memberId`, `DELETE /leagues/:id/members/:memberId`, `POST /leagues/:id/members/:memberId/revoke`, `GET /leagues/:id/members/:memberId/magic-link` (commissioner), `POST /leagues/:id/join-code` |
| Items | `GET /leagues/:id/items`, `POST /leagues/:id/items`, `POST /leagues/:id/items/bulk`, `PATCH /leagues/:id/items/:itemId`, `DELETE /leagues/:id/items/:itemId` |
| Item Notes | `GET /leagues/:id/items/notes/mine` (bulk), `GET /leagues/:id/items/:itemId/notes`, `PUT /leagues/:id/items/:itemId/notes/mine` |
| Draft | `POST /leagues/:id/draft/start`, `POST /leagues/:id/draft/pause`, `POST /leagues/:id/draft/resume`, `GET /leagues/:id/draft`, `GET /leagues/:id/draft/board`, `POST /leagues/:id/draft/picks`, `POST /leagues/:id/draft/picks/override` (commissioner), `POST /leagues/:id/draft/reset` |
| Members (self) | `POST /leagues/:id/members/self` (commissioner — join as drafter), `GET /leagues/:id/members/:memberId/magic-link` (commissioner) |

## Running Tests

```bash
npm run test --workspace=server
```

Unit tests cover the snake draft strategy logic (25 tests).

## Deploying to Railway

Railway runs two services (API and frontend) from this monorepo. Each service has a `railway.toml` in its subdirectory that Railway reads automatically when you set the root directory.

### 1. Create the project and add plugins

In the Railway dashboard, create a new project and add:
- **PostgreSQL** plugin — auto-injects `DATABASE_URL`
- **Redis** plugin — auto-injects `REDIS_URL`

### 2. Add the API service

New Service → GitHub Repo → set **Root Directory** to `server/`.

Set these environment variables in the Railway service settings:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | 64-char random string |
| `APP_BASE_URL` | your frontend Railway URL (set after step 3) |
| `ADMIN_EMAILS` | comma-separated list of emails that get admin access (e.g. `you@example.com`) |
| `SENDGRID_API_KEY` | optional — email notifications |
| `EMAIL_FROM` | optional |
| `TWILIO_ACCOUNT_SID` | optional — SMS notifications |
| `TWILIO_AUTH_TOKEN` | optional |
| `TWILIO_PHONE_NUMBER` | optional |

The build command (`prisma generate && tsc`) and start command (`prisma migrate deploy && node dist/index.js`) are defined in `server/railway.toml`. Migrations run automatically on every deploy before the server starts.

### 3. Add the frontend service

New Service → GitHub Repo → set **Root Directory** to `client/`.

Set this environment variable:

| Variable | Value |
|---|---|
| `VITE_API_URL` | your API service Railway URL (from step 2) |

`VITE_API_URL` is baked into the Vite build at build time, so it must be set before the first deploy.

### 4. Wire the two URLs together

After both services deploy for the first time:
1. Copy the API service domain (e.g. `https://draftmate-api.up.railway.app`) → paste into the frontend's `VITE_API_URL`
2. Copy the frontend domain (e.g. `https://draftmate.up.railway.app`) → paste into the API's `APP_BASE_URL`
3. Redeploy both services

### Architecture note

The BullMQ pick-timer worker runs **in-process** alongside the API server (not as a separate service). This keeps costs low for a hobby deployment and ensures auto-picks can emit real-time Socket.io events to live viewers. If you scale up and need the worker on separate infrastructure, move it out and add a Redis adapter to Socket.io so cross-process emits work.

## License

MIT
