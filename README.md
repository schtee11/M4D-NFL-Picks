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

```bash
npm install
cp .env.example .env        # defaults work out of the box (SQLite)
npx prisma db push          # create the local dev.db
npm run dev                 # http://localhost:3000
```

Open the app, enter a name and a 4–6 digit PIN, and you're in. Have your friends
do the same on the same deployment.

## Configuration

All via environment variables (see `.env.example`):

| Variable         | Purpose                                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| `DATABASE_URL`   | Prisma connection string. SQLite (`file:./dev.db`) or Postgres.         |
| `NFL_SEASON`     | Season year to score against, e.g. `2026` for the 2026–27 season.       |
| `SESSION_SECRET` | Long random string used to sign session cookies. **Set this in prod.**  |
| `LEAGUE_NAME`    | Display name for your league (default: "The Pigskin Pickers").          |
| `PICKS_DEADLINE` | Optional ISO datetime after which season picks can no longer change.    |

Generate a session secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Deploying (shared for your buds)

Because picks are shared, host it somewhere with a **persistent Postgres**
database (Railway, Render, Fly.io, Supabase, Neon, etc.).

1. Switch the datasource in `prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
2. Set `DATABASE_URL` (Postgres), `SESSION_SECRET`, `NFL_SEASON`, and optionally
   `LEAGUE_NAME` / `PICKS_DEADLINE` in your host's env settings.
3. Run migrations on deploy: `npx prisma db push` (or set up
   `prisma migrate`), then `npm run build && npm start`.

> Note: on serverless hosts (e.g. Vercel), SQLite files don't persist between
> requests — use Postgres there.

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
