# Gridiron Picks 🏈

An NFL **playoff-prediction** app for a group of friends. Before the season,
each member picks the 8 division winners and 6 wild cards, then builds the whole
playoff bracket all the way to a Super Bowl champion. Everyone's picks are saved
to a shared database, and a leaderboard scores them against the real results as
the season and playoffs unfold. There's also an optional **week-by-week**
straight-up picks pool.

The UI is a faithful build of the "Nocturne" design prototype — a mobile-first,
dark, blurple-accented layout with a bottom tab bar.

## Features

- **Join with a name + PIN** — no email, no OAuth. Right-sized for a private
  league. Same name + PIN logs you back in.
- **Division winners & wild cards** — pick one winner per division and 3 wild
  cards per conference (14 picks total). Division winners are excluded from the
  wild-card pool automatically.
- **Lock & bracket** — lock your picks, then the app seeds each conference and
  lets you advance teams through the Wild Card → Divisional → Conference
  Championship → Super Bowl.
- **Weekly straight-up picks** — pick each game's winner every week; games lock
  at kickoff, and correct picks score a point.
- **Leaderboard** — everyone ranked by points, updated as results come in.
- **Live NFL data** — schedule, scores, standings, and playoff results come from
  ESPN's public API.

## Tech stack

- **Next.js 14** (App Router) + **TypeScript**
- **Prisma** ORM — SQLite in dev, Postgres in production
- The **Nocturne** design system, ported to plain CSS (`src/app/globals.css`)
- ESPN public JSON API for NFL data

## Getting started (local)

The app uses **Postgres**. For local dev you can run a local Postgres, or just
borrow the Railway database once it's set up (see below):

```bash
npm install
cp .env.example .env         # set DATABASE_URL to your Postgres
npx prisma db push           # create the tables
npm run dev                  # http://localhost:3000

# …or, once deployed on Railway, run locally against the Railway DB:
railway run npm run dev
```

Open the app, enter a name and a 4–6 digit PIN, and you're in. Have your friends
do the same on the same deployment.

## Configuration

All via environment variables (see `.env.example`):

| Variable         | Purpose                                                                     |
| ---------------- | --------------------------------------------------------------------------- |
| `DATABASE_URL`   | Postgres connection string. On Railway this is injected automatically.      |
| `NFL_SEASON`     | Season year to score against, e.g. `2026` for the 2026–27 season.           |
| `SESSION_SECRET` | Long random string used to sign session cookies. **Set this in prod.**      |
| `LEAGUE_NAME`    | Display name for your league (default: "The Pigskin Pickers").              |
| `PICKS_DEADLINE` | Optional ISO datetime after which season picks can no longer change.        |

Generate a session secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Deploying on Railway

The repo is Railway-ready: `railway.json` builds with Nixpacks and, on every
deploy, syncs the database schema (`prisma db push`) before starting the app.

1. **New Project → Deploy from GitHub repo** → pick this repo and the
   `claude/nfl-pick-app-xgmkfy` branch (or merge it to `main` first).
2. **Add a database:** in the project, **New → Database → PostgreSQL**. Railway
   automatically exposes `DATABASE_URL` to your app service — no manual wiring.
   (If your app service doesn't pick it up, add a service variable
   `DATABASE_URL = ${{Postgres.DATABASE_URL}}`.)
3. **Set variables** on the app service:
   - `SESSION_SECRET` — a long random string (command above)
   - `NFL_SEASON` — e.g. `2026`
   - optionally `LEAGUE_NAME`, `PICKS_DEADLINE`
4. **Generate a domain:** service → **Settings → Networking → Generate Domain**.
   Railway sets `PORT`; the app binds to it automatically.
5. Deploy. Share the URL with your buds — everyone joins with a name + PIN.

Redeploys happen automatically on every push to the connected branch. `prisma db
push` runs on each boot, so schema changes roll out with your code.

> Node is pinned to 20 via `.nvmrc` / `engines`.

## Scoring

Season predictions and weekly picks both feed the leaderboard. Defaults live in
`src/lib/scoring.ts` and are easy to tune:

| Correct prediction            | Points |
| ----------------------------- | ------ |
| Division winner               | 10     |
| Wild-card team (made the field)| 8     |
| Wild Card round game          | 5      |
| Divisional round game         | 10     |
| Conference Championship       | 15     |
| Super Bowl team               | 20     |
| Super Bowl champion           | 30     |
| Weekly straight-up game       | 1      |

Bracket rounds are scored by **set membership** ("did the team you advanced
actually advance this round?"), so it stays fair even if your predicted seeding
differs from reality. Points naturally read as 0 until the relevant games are
played; a logged-in member can force a data refresh via `POST /api/results/refresh`.

## Project structure

```
src/
  app/
    (app)/            authenticated screens (dashboard, picks, bracket, weekly, league)
    api/              auth, predictions, weekly, results endpoints
    login/            join / sign-in
  components/         AppChrome (nav), icons, pick buttons, screen components
  lib/
    teams.ts          32 NFL teams + divisions (static)
    bracket.ts        seeding + matchup logic (shared client/server)
    espn.ts           ESPN API helpers
    scoring.ts        scoring engine
    results.ts        cached actual results
    leaderboard.ts    standings aggregation
    picks.ts / auth.ts / db.ts / config.ts
prisma/schema.prisma  data model
```

## Known simplification & next steps

- **Seeding.** Division winners are seeded 1–4 in division order and wild cards
  5–7 in the order picked (this mirrors the original prototype). Real NFL seeding
  is by record. A natural next step is a "rank your seeds" step after picks lock.
- **Admin tools.** Results refresh is open to any member today; a lightweight
  admin role could gate it and allow manual result overrides.
- **Notifications.** Deadline / kickoff reminders could be added.
