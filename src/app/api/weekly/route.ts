import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getScoreboard } from "@/lib/espn";
import { SEASON } from "@/lib/config";

function clampWeek(w: unknown): number {
  const n = Number(w);
  if (!Number.isFinite(n)) return 1;
  return Math.min(18, Math.max(1, Math.round(n)));
}

// GET /api/weekly?week=N → games + this user's picks + per-game lock state
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const week = clampWeek(new URL(req.url).searchParams.get("week"));

  const [games, picks] = await Promise.all([
    getScoreboard(SEASON, week, 2),
    prisma.weeklyPick.findMany({ where: { userId: user.id, season: SEASON, week } }),
  ]);

  const now = Date.now();
  const pickMap: Record<string, string> = {};
  picks.forEach((p) => (pickMap[p.gameId] = p.pickedTeam));

  const view = games.map((g) => ({
    ...g,
    locked: g.state !== "pre" || new Date(g.date).getTime() <= now,
    picked: pickMap[g.id] ?? null,
  }));

  return NextResponse.json({ week, season: SEASON, games: view });
}

// POST /api/weekly  { week, picks: { [gameId]: teamAbbr } }
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const week = clampWeek(body.week);
  const incoming = (body.picks || {}) as Record<string, string>;

  const games = await getScoreboard(SEASON, week, 2);
  const byId = new Map(games.map((g) => [g.id, g]));
  const now = Date.now();

  const ops = [];
  for (const [gameId, team] of Object.entries(incoming)) {
    const g = byId.get(gameId);
    if (!g) continue; // unknown game
    if (g.state !== "pre" || new Date(g.date).getTime() <= now) continue; // locked
    if (team !== g.home.abbr && team !== g.away.abbr) continue; // invalid team
    ops.push(
      prisma.weeklyPick.upsert({
        where: { userId_season_week_gameId: { userId: user.id, season: SEASON, week, gameId } },
        create: { userId: user.id, season: SEASON, week, gameId, pickedTeam: team },
        update: { pickedTeam: team },
      }),
    );
  }
  await Promise.all(ops);
  return NextResponse.json({ ok: true, saved: ops.length });
}
