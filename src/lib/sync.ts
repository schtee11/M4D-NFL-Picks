// Builds a season entry's effective picks according to its track (pickMode).
//
// The bracket field can be built one of two mutually-exclusive ways — never a
// blend of both, which is where record-vs-manual contradictions used to breed:
//
//  • "manual"  — the user hand-picks division winners, wildcards, and seed win
//                totals. Weekly game picks never touch the bracket (they still
//                play in the always-on straight-up pool, scored separately).
//
//  • "matchups" — the user calls the whole game slate and the entire field is
//                DERIVED from the resulting records: each division's winner is
//                its best team by wins, each conference's wildcards the best
//                three remaining (see deriveField). This only happens once
//                EVERY game is picked; until then there is no valid field yet
//                and the bracket can't be locked. The manual field controls are
//                off in this track, so records and hand-picks can never disagree.
//
// Everything is gated to editable (non-frozen) entries and persists the result,
// so scoring, the leaderboard, and the bracket all read the effective picks.

import { prisma } from "./db";
import { SEASON } from "./config";
import { getSeasonSchedule, Game } from "./espn";
import { getEntry, parseEntry, parsePickMode, PickMode } from "./picks";
import { SeasonPicks, canLock } from "./bracket";
import { Conference, CONFERENCES, DIVISIONS } from "./teams";
import { GameResult, buildTieContext, pickDivisionWinner, rankWildcards } from "./tiebreakers";
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
  pickedGames: number; // scheduled games the user has called
  totalGames: number; // scheduled games in the season
  results: GameResult[]; // winner/loser of every called game — drives tiebreakers
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
  const results: GameResult[] = [];
  let pickedGames = 0;
  for (const p of picks) {
    const g = gameById.get(p.gameId);
    if (!g) continue; // pick for a game not on the known schedule
    // The picked team must actually be in this game, or the "win" is bogus.
    const loser =
      p.pickedTeam === g.home.abbr ? g.away.abbr : p.pickedTeam === g.away.abbr ? g.home.abbr : null;
    if (!loser) continue;
    pickedGames += 1;
    wins[p.pickedTeam] = (wins[p.pickedTeam] ?? 0) + 1;
    results.push({ winner: p.pickedTeam, loser });
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
  return { wins, complete, allComplete, pickedGames, totalGames: schedule.length, results };
}

// Manual projections with weekly-derived totals overlaid for any team whose
// entire schedule has been picked.
export function effectiveRecords(picks: SeasonPicks, derived: WeeklyDerived): Record<string, number> {
  const out: Record<string, number> = { ...picks.records };
  for (const team of derived.complete) out[team] = derived.wins[team] ?? 0;
  return out;
}

// Derive the entire playoff field from a fully-called slate. Records give the
// primary ordering (most wins), and `results` (winner/loser of every game) lets
// us break ties with the real NFL cascade — head-to-head, division/conference
// record, common games, strength of victory/schedule — via `./tiebreakers`.
// Everything is deterministic, so the field never churns on equal records.
//
// `results` is optional: when it's absent (or empty) we fall back to raw win
// count with a fixed team-order tiebreak, preserving the previous behavior for
// any caller that hasn't got the game-level slate on hand.
export function deriveField(
  records: Record<string, number>,
  divisionPicks: Record<string, string>,
  wildcards: Record<Conference, string[]>,
  results?: GameResult[],
): { divisionPicks: Record<string, string>; wildcards: Record<Conference, string[]> } {
  const winsOf = (t: string) => (typeof records[t] === "number" ? records[t] : 0);
  const orderIndex = new Map(DIVISIONS.flatMap((d) => d.teams).map((t, i) => [t, i] as const));
  const teamOrder = (t: string) => orderIndex.get(t) ?? Number.MAX_SAFE_INTEGER;
  const ctx = results && results.length ? buildTieContext(results, winsOf, teamOrder) : null;

  const dp: Record<string, string> = {};
  for (const div of DIVISIONS) {
    if (ctx) {
      dp[div.key] = pickDivisionWinner(ctx, div.teams);
      continue;
    }
    // No slate on hand: best by wins, ties held stable by prior pick then order.
    let best = div.teams[0];
    for (const t of div.teams) if (winsOf(t) > winsOf(best)) best = t;
    const prev = divisionPicks[div.key];
    if (prev && div.teams.includes(prev) && winsOf(prev) === winsOf(best)) best = prev;
    dp[div.key] = best;
  }

  const wc: Record<Conference, string[]> = { AFC: [], NFC: [] };
  for (const conf of CONFERENCES) {
    const winners = new Set(DIVISIONS.filter((d) => d.conf === conf).map((d) => dp[d.key]));
    const pool = DIVISIONS.filter((d) => d.conf === conf)
      .flatMap((d) => d.teams)
      .filter((t) => !winners.has(t));
    if (ctx) {
      wc[conf] = rankWildcards(ctx, pool).slice(0, 3);
      continue;
    }
    const prev = wildcards[conf] ?? [];
    const prevRank = (t: string) => {
      const i = prev.indexOf(t);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    wc[conf] = pool
      .sort((a, b) => winsOf(b) - winsOf(a) || prevRank(a) - prevRank(b) || teamOrder(a) - teamOrder(b))
      .slice(0, 3);
  }
  return { divisionPicks: dp, wildcards: wc };
}

export interface SyncResult {
  picks: SeasonPicks; // effective picks: field derived from records in matchups mode
  derivedTeams: string[]; // teams whose wins come from a completed slate (matchups mode)
  pickMode: PickMode; // which track this entry is on
  fieldLocked: boolean; // matchups mode + slate complete → field is record-driven & read-only
  slate: { picked: number; total: number }; // weekly-slate progress (drives the "finish" nudge)
}

// Load an entry and produce its effective picks for the current track:
//   • manual   — the hand-picked field and manual win totals stand untouched;
//                weekly picks never feed the bracket.
//   • matchups — records come from the weekly slate, and once EVERY game is
//                called the whole field is derived from them (read-only).
// Persists any change. A frozen (locked or past-deadline) entry is left as-is.
export async function syncEntry(
  userId: string,
  frozen: boolean,
  entry?: SeasonEntry | null,
  season = SEASON,
): Promise<SyncResult> {
  const row = entry ?? (await getEntry(userId, season));
  const base = parseEntry(row);
  const mode = parsePickMode(row);
  // A locked entry is frozen just like a past-deadline one: the field must not
  // keep re-deriving from later weekly-pick edits, or "locked" wouldn't hold.
  // A matchups field that's complete stays flagged read-only so the UI shows the
  // finished bracket rather than the "call your slate" progress state.
  if (!row || frozen || row.locked) {
    const fieldLocked = mode === "matchups" && canLock(base);
    return { picks: base, derivedTeams: [], pickMode: mode, fieldLocked, slate: { picked: 0, total: 0 } };
  }

  // Manual track: the bracket is entirely hand-built — no weekly derivation.
  if (mode === "manual") {
    return {
      picks: base,
      derivedTeams: [],
      pickMode: mode,
      fieldLocked: false,
      slate: { picked: 0, total: 0 },
    };
  }

  // Matchups track: records come from the slate; the field is derived only when
  // every game is called. Until then the field is EMPTY — so a hand-picked field
  // from a previous track (or a since-invalidated one) can never linger or be
  // locked in.
  const derived = await getWeeklyDerived(userId, season);
  const records = effectiveRecords(base, derived);

  let divisionPicks: Record<string, string> = {};
  let wildcards: Record<Conference, string[]> = { AFC: [], NFC: [] };
  if (derived.allComplete) {
    const field = deriveField(records, base.divisionPicks, base.wildcards, derived.results);
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
    pickMode: mode,
    fieldLocked: derived.allComplete,
    slate: { picked: derived.pickedGames, total: derived.totalGames },
  };
}
