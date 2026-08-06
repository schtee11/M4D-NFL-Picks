# M4D NFL Picks 🏈

An NFL prediction app for a group of friends. The flow is **Matchups first**:
call the weekly games — the easy way is down a single team's whole schedule —
and a completed slate automatically sets that team's record and seeds it in your
playoff bracket. From there the **Bracket** page ties it together: pick your 8
division winners and 6 wild cards, confirm the seeding, build the bracket to a
Super Bowl champion, and lock. Everyone's picks are saved to a shared database,
and a leaderboard scores them against the real results as the season and
playoffs unfold.

The UI is a faithful build of the "Nocturne" design prototype — a mobile-first,
dark, blurple-accented layout with a bottom tab bar (Home · Matchups · Bracket ·
League).

## Features

- **Join with a name + PIN** — no email, no OAuth. Right-sized for a private
  league. Same name + PIN logs you back in.
- **Matchups** — call games two ways: **by team** (default — pick W/L down a
  single team's whole schedule) or **by week** (game by game). Games lock at
  kickoff, and correct picks score a point.
- **Two ways to build your bracket** — pick a track on the Bracket page:
  - **Build by hand** (default) — pick one winner per division and 3 wild cards
    per conference (14 picks; division winners are excluded from the wild-card
    pool automatically), set win totals to seed them, then advance teams through
    the Wild Card → Divisional → Conference Championship → Super Bowl.
  - **Call every game** — skip hand-picking; your division winners, wild cards,
    and seeds are *derived* from your game picks. You call the whole season in
    Matchups and the bracket falls out of the standings. It can't be locked until
    the full slate is called (a progress bar tracks how far you are).

  The two tracks are exclusive — records and hand-picks never blend, so they
  can't contradict each other. Switching tracks is a deliberate reset of the
  bracket; your weekly pool picks are always kept. Everything stays editable
  until you lock in or the deadline passes.
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

1. **New Project → Deploy from GitHub repo** → pick this repo and the `main`
   branch. Railway redeploys automatically on every push to it.
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

| Correct prediction             | Points |
| ------------------------------ | ------ |
| Division winner                | 10     |
| Wild-card team (made the field)| 8      |
| Wild Card round game           | 5      |
| Divisional round game          | 10     |
| Conference Championship / Super Bowl team | 15 |
| Super Bowl champion            | 30     |
| Weekly straight-up game        | 1      |

A team reaches the Super Bowl by winning its conference championship game, so
"Conference Championship" and "Super Bowl team" are the same prediction — they're
scored once, under a single award, not both (which would double-count the same
correct call).

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

## Seeding

Seeds are computed like the real NFL: division winners take seeds 1–4 (ordered
by wins), wild cards take 5–7 (ordered by wins) — a wild card never outseeds a
division winner, even with a better record. Those seeds drive every bracket
matchup (byes, reseeding, etc.).

**Tiebreakers.** How ties are broken depends on the track, because the two
tracks expose different information:

- **`manual`** — you only enter each team's win *total*, so head-to-head,
  division record, and the rest of the NFL cascade simply don't exist to
  compute. Equal win totals fall back to a fixed, deterministic order, so
  seeding is never random. This is a documented simplification of the real
  rules.
- **`matchups`** — you've called *every* game, which fixes the result of every
  matchup, so the field is chosen with the real NFL cascade in
  `src/lib/tiebreakers.ts`: head-to-head → division record → common games →
  conference record → strength of victory → strength of schedule. The one piece
  we can't reproduce is the point-based tail of the cascade (points for/against,
  net points, net TDs) — the slate is win/loss only, with no scores — so those
  final steps and the NFL's coin toss are replaced by a deterministic team
  order. Two-club ties resolve exactly; three-plus-club ties use a pairwise
  approximation of the eliminate-and-restart procedure. (Seed *order* among
  division winners tied on record also uses the deterministic fallback, since
  that ordering runs client-side without the game slate.)

**Two exclusive tracks (`pickMode` on the season entry).** How the bracket
*field* is built is a per-entry choice, and the two never blend — which is what
kept manual picks and derived records from contradicting each other:

- **`manual`** (default) — you hand-pick the 14 teams and set each one's win
  total in the **Seeding** section. Weekly game picks never touch the bracket.
- **`matchups`** — the whole field is *derived*. Once **every** game is called,
  `deriveField` in `src/lib/sync.ts` computes each division's winner (its best
  team by wins) and each conference's wild cards (the best three remaining);
  seeds follow from the same records. Until the slate is complete there is no
  field yet, so the bracket can't be locked (the page shows a progress bar).
  Because every game is called, record ties are broken with the real NFL
  tiebreaker cascade (`src/lib/tiebreakers.ts`); see **Seeding** below.

All of this runs server-side in `syncEntry` (`src/lib/sync.ts`) and is persisted,
so scoring, the leaderboard, and the Divisions view all read the effective
picks. It only runs while your picks are still editable; once you lock in (or the
deadline passes) predictions are frozen. Switching tracks clears the bracket
field (a deliberate reset) but always keeps your weekly straight-up pool picks,
which are scored independently regardless of track.

## Next steps

- **Admin tools.** Results refresh is open to any member today; a lightweight
  admin role could gate it and allow manual result overrides.
- **Notifications.** Deadline / kickoff reminders could be added.
