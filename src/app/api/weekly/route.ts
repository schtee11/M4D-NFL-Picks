import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getScoreboard, Game } from "@/lib/espn";
import { getCachedSchedule } from "@/lib/sync";
import { TEAMS, normalizeAbbr } from "@/lib/teams";
import { SEASON } from "@/lib/config";

function clampWeek(w: unknown): number {
  const n = Number(w);
  if (!Number.isFinite(n)) return 1;
  return Math.min(18, Math.max(1, Math.round(n)));
}

function toView(g: Game, now: number, picked: string | null) {
  return {
    id: g.id,
    week: g.week,
    date: g.date,
    state: g.state,
    statusDetail: g.statusDetail,
    home: g.home,
    away: g.away,
    winner: g.winner,
    locked: g.state !== "pre" || new Date(g.date).getTime() <= now,
    picked,
  };
}

// GET /api/weekly?week=N        → games for a single week
// GET /api/weekly?team=ABBR     → a team's full-season slate (week by week)
// Both include this user's picks + per-game lock state.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const teamParam = url.searchParams.get("team");
  const now = Date.now();

  if (teamParam) {
    const team = normalizeAbbr(teamParam);
    if (!TEAMS[team]) return NextResponse.json({ error: "Unknown team" }, { status: 400 });

    const [schedule, picks] = await Promise.all([
      getCachedSchedule(SEASON),
      prisma.weeklyPick.findMany({ where: { userId: user.id, season: SEASON } }),
    ]);
    const pickMap = new Map(picks.map((p) => [p.gameId, p.pickedTeam]));
    const games = schedule
      .filter((g) => g.home.abbr === team || g.away.abbr === team)
      .sort((a, b) => a.week - b.week)
      .map((g) => toView(g, now, pickMap.get(g.id) ?? null));

    return NextResponse.json({ team, season: SEASON, games });
  }

  const week = clampWeek(url.searchParams.get("week"));
  const [games, picks] = await Promise.all([
    getScoreboard(SEASON, week, 2),
    prisma.weeklyPick.findMany({ where: { userId: user.id, season: SEASON, week } }),
  ]);
  const pickMap = new Map(picks.map((p) => [p.gameId, p.pickedTeam]));
  const view = games.map((g) => toView(g, now, pickMap.get(g.id) ?? null));

  return NextResponse.json({ week, season: SEASON, games: view });
}

// POST /api/weekly  { picks: { [gameId]: teamAbbr }, week? }
//
// `week` is an optional fast path for the week view (one scoreboard fetch).
// Without it (the team view, whose picks span weeks) games are resolved from
// the cached full-season schedule.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const incoming = (body.picks || {}) as Record<string, string>;

  let byId: Map<string, Game>;
  if (body.week != null) {
    const games = await getScoreboard(SEASON, clampWeek(body.week), 2);
    byId = new Map(games.map((g) => [g.id, g]));
  } else {
    const schedule = await getCachedSchedule(SEASON);
    byId = new Map(schedule.map((g) => [g.id, g]));
  }

  const now = Date.now();
  const ops = [];
  for (const [gameId, rawTeam] of Object.entries(incoming)) {
    const g = byId.get(gameId);
    if (!g) continue; // unknown game
    if (g.state !== "pre" || new Date(g.date).getTime() <= now) continue; // locked
    const team = normalizeAbbr(rawTeam);
    if (team !== g.home.abbr && team !== g.away.abbr) continue; // invalid team
    ops.push(
      prisma.weeklyPick.upsert({
        where: { userId_season_week_gameId: { userId: user.id, season: SEASON, week: g.week, gameId } },
        create: { userId: user.id, season: SEASON, week: g.week, gameId, pickedTeam: team },
        update: { pickedTeam: team },
      }),
    );
  }
  await Promise.all(ops);
  return NextResponse.json({ ok: true, saved: ops.length });
}
