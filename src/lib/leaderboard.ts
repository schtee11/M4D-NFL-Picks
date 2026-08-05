// Builds the league leaderboard: every member's season-prediction score plus
// their weekly-pick score, ranked.

import { prisma } from "./db";
import { SEASON } from "./config";
import { parseEntry } from "./picks";
import { picksMade } from "./bracket";
import { scoreSeason, SCORING, ScoreBreakdown } from "./scoring";
import { getActuals, getWeekFinals } from "./results";

export interface LeaderRow {
  userId: string;
  name: string;
  points: number;
  breakdown: ScoreBreakdown;
  locked: boolean;
  pickStatus: string;
  rank: number;
}

export async function buildLeaderboard(season = SEASON): Promise<LeaderRow[]> {
  const [users, entries, weekly, actuals] = await Promise.all([
    prisma.user.findMany(),
    prisma.seasonEntry.findMany({ where: { season } }),
    prisma.weeklyPick.findMany({ where: { season } }),
    getActuals(season),
  ]);

  const entryByUser = new Map(entries.map((e) => [e.userId, e]));

  // Fetch finals once per distinct week that has any picks.
  const weeks = Array.from(new Set(weekly.map((w) => w.week)));
  const finalsByWeek = new Map<number, Map<string, string>>();
  await Promise.all(
    weeks.map(async (w) => finalsByWeek.set(w, await getWeekFinals(season, w))),
  );

  const rows: LeaderRow[] = users.map((u) => {
    const entry = entryByUser.get(u.id) ?? null;
    const picks = parseEntry(entry);
    const breakdown = scoreSeason(picks, actuals);

    // Weekly points for this user.
    let weeklyCorrect = 0;
    for (const p of weekly.filter((wp) => wp.userId === u.id)) {
      const finals = finalsByWeek.get(p.week);
      if (finals && finals.get(p.gameId) === p.pickedTeam) weeklyCorrect += 1;
    }
    breakdown.weekly = weeklyCorrect * SCORING.weeklyGame;
    breakdown.total += breakdown.weekly;

    const made = picksMade(picks);
    const pickStatus = entry?.locked
      ? "Locked in"
      : made > 0
        ? "In progress"
        : "Not started";

    return {
      userId: u.id,
      name: u.displayName,
      points: breakdown.total,
      breakdown,
      locked: !!entry?.locked,
      pickStatus,
      rank: 0,
    };
  });

  rows.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}
