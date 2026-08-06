// Keeps the season predictions "intertwined" with the weekly straight-up picks.
//
// Two behaviors live here:
//
//  1. Weekly picks override the manual W/L. Once a user has picked a winner for
//     every one of a team's regular-season games, that team's projected win
//     total is derived from those picks — overriding whatever number was set by
//     hand in the seeding step. Teams with an incomplete slate keep their
//     manual projection.
//
//  2. Records drive the playoff field — but only all-or-nothing. Once EVERY
//     team's matchup slate is picked, the records are the sole source of truth:
//     each division's winner is its best team by wins and each conference's
//     wildcards are the best three remaining, derived automatically. Until the
//     matchups are fully done, the field is left exactly as the user picked it
//     by hand — partial records never reshape it. (The UI disables the manual
//     division/wildcard controls once the field is record-driven, so the two
//     inputs can't contradict each other.)
//
// Everything is gated to editable (non-frozen) entries and persists the result,
// so scoring, the leaderboard, and the bracket all read the reconciled picks.

import { prisma } from "./db";
import { SEASON } from "./config";
import { getSeasonSchedule, Game } from "./espn";
import { getEntry, parseEntry } from "./picks";
import { SeasonPicks } from "./bracket";
import { Conference, CONFERENCES, DIVISIONS } from "./teams";
import type { SeasonEntry } from "@prisma/client";

const SCHEDULE_CACHE_MS = 6 * 60 * 60 * 1000; // 6 hours — the schedule rarely moves.

// Season schedule with a DB cache in front of the (18-request) ESPN fetch.
export async function getCachedSchedule(season = SEASON): Promise<Game[]> {
  const row = await prisma.resultCache.findUnique({
    where: { season_kind: { season, kind: "schedule" } },
  });
  if (row) {
    try {
      const cached = JSON.parse(row.data) as Game[];
      if (cached.length && Date.now() - row.fetchedAt.getTime() < SCHEDULE_CACHE_MS) return cached;
    } catch {
      /* fall through to refetch */
    }
  }
  const fresh = await getSeasonSchedule(season);
  if (fresh.length) {
    const payload = JSON.stringify(fresh);
    await prisma.resultCache.upsert({
      where: { season_kind: { season, kind: "schedule" } },
      create: { season, kind: "schedule", data: payload },
      update: { data: payload, fetchedAt: new Date() },
    });
    return fresh;
  }
  // Fetch produced nothing (e.g. schedule not posted yet) — use stale cache if any.
  if (row) {
    try {
      return JSON.parse(row.data) as Game[];
    } catch {
      /* ignore */
    }
  }
  return [];
}

export interface WeeklyDerived {
  wins: Record<string, number>; // team -> games the user picked them to win
  complete: Set<string>; // teams whose entire schedule the user has picked
  allComplete: boolean; // every scheduled team's slate is picked — matchups fully done
}

// Build each team's picked-win total from the user's weekly picks and mark the
// teams whose full slate is picked (so their total can safely override manual).
export async function getWeeklyDerived(userId: string, season = SEASON): Promise<WeeklyDerived> {
  const [schedule, picks] = await Promise.all([
    getCachedSchedule(season),
    prisma.weeklyPick.findMany({ where: { userId, season } }),
  ]);

  const totalByTeam: Record<string, number> = {};
  for (const g of schedule) {
    if (g.home.abbr) totalByTeam[g.home.abbr] = (totalByTeam[g.home.abbr] ?? 0) + 1;
    if (g.away.abbr) totalByTeam[g.away.abbr] = (totalByTeam[g.away.abbr] ?? 0) + 1;
  }

  const gameById = new Map(schedule.map((g) => [g.id, g]));
  const wins: Record<string, number> = {};
  const pickedByTeam: Record<string, number> = {};
  for (const p of picks) {
    const g = gameById.get(p.gameId);
    if (!g) continue; // pick for a game not on the known schedule
    wins[p.pickedTeam] = (wins[p.pickedTeam] ?? 0) + 1;
    // A pick decides the game for BOTH participants (one win, one loss).
    if (g.home.abbr) pickedByTeam[g.home.abbr] = (pickedByTeam[g.home.abbr] ?? 0) + 1;
    if (g.away.abbr) pickedByTeam[g.away.abbr] = (pickedByTeam[g.away.abbr] ?? 0) + 1;
  }

  const complete = new Set<string>();
  for (const [team, total] of Object.entries(totalByTeam)) {
    if (total > 0 && pickedByTeam[team] === total) complete.add(team);
  }
  // Every team that has a schedule has its full slate picked → the matchups are
  // done and records become the sole driver of the playoff field.
  const scheduledTeams = Object.keys(totalByTeam);
  const allComplete = scheduledTeams.length > 0 && scheduledTeams.every((t) => complete.has(t));
  return { wins, complete, allComplete };
}

// Manual projections with weekly-derived totals overlaid for any team whose
// entire schedule has been picked.
export function effectiveRecords(picks: SeasonPicks, derived: WeeklyDerived): Record<string, number> {
  const out: Record<string, number> = { ...picks.records };
  for (const team of derived.complete) out[team] = derived.wins[team] ?? 0;
  return out;
}

// Derive the entire playoff field from records. Used only when every matchup is
// picked, so records are authoritative: each division's winner is its best team
// by wins, and each conference's wildcards are the best three non-winners.
// Record ties fall back to the user's prior manual pick, then to a fixed team
// order, so the result is deterministic and never churns on equal records.
export function deriveField(
  records: Record<string, number>,
  divisionPicks: Record<string, string>,
  wildcards: Record<Conference, string[]>,
): { divisionPicks: Record<string, string>; wildcards: Record<Conference, string[]> } {
  const winsOf = (t: string) => (typeof records[t] === "number" ? records[t] : 0);
  const orderIndex = new Map(DIVISIONS.flatMap((d) => d.teams).map((t, i) => [t, i] as const));
  const teamOrder = (t: string) => orderIndex.get(t) ?? Number.MAX_SAFE_INTEGER;

  const dp: Record<string, string> = {};
  for (const div of DIVISIONS) {
    let best = div.teams[0];
    for (const t of div.teams) if (winsOf(t) > winsOf(best)) best = t;
    // Tie: keep the user's prior winner if it shares the division's top record.
    const prev = divisionPicks[div.key];
    if (prev && div.teams.includes(prev) && winsOf(prev) === winsOf(best)) best = prev;
    dp[div.key] = best;
  }

  const wc: Record<Conference, string[]> = { AFC: [], NFC: [] };
  for (const conf of CONFERENCES) {
    const winners = new Set(DIVISIONS.filter((d) => d.conf === conf).map((d) => dp[d.key]));
    const prev = wildcards[conf] ?? [];
    const prevRank = (t: string) => {
      const i = prev.indexOf(t);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    wc[conf] = DIVISIONS.filter((d) => d.conf === conf)
      .flatMap((d) => d.teams)
      .filter((t) => !winners.has(t))
      .sort((a, b) => winsOf(b) - winsOf(a) || prevRank(a) - prevRank(b) || teamOrder(a) - teamOrder(b))
      .slice(0, 3);
  }
  return { divisionPicks: dp, wildcards: wc };
}

export interface SyncResult {
  picks: SeasonPicks; // effective picks: records overlaid, field derived when locked
  derivedTeams: string[]; // teams whose wins now come from a completed weekly slate
  fieldLocked: boolean; // matchups fully done → division/wildcard picks are record-driven
}

// Load an entry, apply the weekly record override, and — once the matchups are
// fully done — derive the playoff field from those records. Persists any change
// and returns the effective picks. A frozen (locked or past-deadline) entry is
// left untouched: predictions are final once locked in.
export async function syncEntry(
  userId: string,
  frozen: boolean,
  entry?: SeasonEntry | null,
  season = SEASON,
): Promise<SyncResult> {
  const row = entry ?? (await getEntry(userId, season));
  const base = parseEntry(row);
  if (!row || frozen) return { picks: base, derivedTeams: [], fieldLocked: false };

  const derived = await getWeeklyDerived(userId, season);
  const records = effectiveRecords(base, derived);

  // The field is record-driven ONLY when every matchup is picked. Until then the
  // user's hand-picked division winners and wildcards stand untouched.
  let divisionPicks = base.divisionPicks;
  let wildcards = base.wildcards;
  if (derived.allComplete) {
    const field = deriveField(records, base.divisionPicks, base.wildcards);
    divisionPicks = field.divisionPicks;
    wildcards = field.wildcards;
  }

  const changed =
    JSON.stringify(records) !== JSON.stringify(base.records) ||
    JSON.stringify(divisionPicks) !== JSON.stringify(base.divisionPicks) ||
    JSON.stringify(wildcards) !== JSON.stringify(base.wildcards);

  if (changed) {
    await prisma.seasonEntry.update({
      where: { userId_season: { userId, season } },
      data: {
        records: JSON.stringify(records),
        divisionPicks: JSON.stringify(divisionPicks),
        wildcards: JSON.stringify(wildcards),
      },
    });
  }

  return {
    picks: { divisionPicks, wildcards, bracketPicks: base.bracketPicks, records },
    derivedTeams: [...derived.complete],
    fieldLocked: derived.allComplete,
  };
}
