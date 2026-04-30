# DraftMate — by Tin

An async-friendly online draft app. Users don't need to be online at the same time — they're notified by email and SMS when it's their turn and have a configurable time window to pick. A live draft board updates in real time for anyone who is watching.

## Features

- **Async drafting** — configurable pick timer (default 12 hours); auto-pick fires if the timer expires
- **Real-time board** — Socket.io pushes live updates to anyone watching the draft room
- **Custom item pools** — commissioners define any pool of items to draft from (players, teams, movies, etc.); add items one at a time or bulk-import from a newline-separated list
- **Bucket / category system** — items can be grouped into named buckets (e.g. UPPER, LOWER, GIRL, REC); displayed as columns in both the league setup and the draft room
- **Enforce bucket picking** — optional commissioner setting that prevents drafters from picking more than one item per bucket; a live status bar in the draft room shows which buckets are used up
- **Drag-and-drop bucket assignment** — commissioners can drag items between bucket columns in league setup to reassign them; dropping on the "No bucket" column clears the assignment
- **Snake & linear formats** — with the strategy pattern in place for adding more formats later
- **Email + SMS notifications** — via SendGrid and Twilio
- **Item notes** — commissioners write public notes on any item; each drafter keeps private personal notes per item visible only to them; commissioner notes are inline-editable without leaving the page
- **Invite flow** — commissioners invite members by email; invitees create an account on accept
- **Dashboard navigation** — dashboard shows live draft status per league; non-commissioners see a "Go to Draft" or "Pick Now" link when it's their turn
- **Secure auth** — JWT access tokens (15 min, auto-refreshed silently) + HttpOnly refresh tokens (30-day rotation)

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
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/invite/accept/:token` |
| Leagues | `POST /leagues`, `GET /leagues`, `GET /leagues/:id`, `PATCH /leagues/:id`, `PUT /leagues/:id/settings` |
| Members | `GET /leagues/:id/members`, `POST /leagues/:id/members/invite`, `POST /leagues/:id/members/randomize-order`, `DELETE /leagues/:id/members/:memberId` |
| Items | `GET /leagues/:id/items`, `POST /leagues/:id/items`, `POST /leagues/:id/items/bulk`, `PATCH /leagues/:id/items/:itemId`, `DELETE /leagues/:id/items/:itemId` |
| Item Notes | `GET /leagues/:id/items/:itemId/notes`, `PUT /leagues/:id/items/:itemId/notes/mine` |
| Draft | `POST /leagues/:id/draft/start`, `POST /leagues/:id/draft/pause`, `POST /leagues/:id/draft/resume`, `GET /leagues/:id/draft`, `GET /leagues/:id/draft/board`, `POST /leagues/:id/draft/picks` |

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
