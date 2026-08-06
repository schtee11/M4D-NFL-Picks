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
//  2. Wildcard ↔ division-winner auto-swap. A division winner should be the
//     best team in its division. If a wildcard sitting in the SAME division as
//     the chosen winner projects to more wins, it is promoted to division
//     winner and the former winner drops into that wildcard slot.
//
//  3. Wildcard field auto-correction. The wildcards should be the best
//     non-division-winners in the conference by projected wins. If a team the
//     user left out out-projects one of the picked wildcards, it takes that
//     wildcard's slot and the weakest wildcard drops out. This keeps the field
//     consistent with the records the user's own weekly picks imply.
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
  return { wins, complete };
}

// Manual projections with weekly-derived totals overlaid for any team whose
// entire schedule has been picked.
export function effectiveRecords(picks: SeasonPicks, derived: WeeklyDerived): Record<string, number> {
  const out: Record<string, number> = { ...picks.records };
  for (const team of derived.complete) out[team] = derived.wins[team] ?? 0;
  return out;
}

export interface Swap {
  kind: "division" | "wildcard";
  // For a division swap: the division the swap happened in. For a wildcard
  // swap: the division the promoted (formerly-out) team belongs to.
  division: string;
  promoted: string; // team moved up (into the division or into the wildcard field)
  demoted: string; // team moved down (into a wildcard slot, or out of the field)
}

const divisionOf = (t: string) => DIVISIONS.find((d) => d.teams.includes(t))?.key ?? "";

// Reconcile a user's picks with the records their weekly picks imply:
//   1. Promote a same-division wildcard over the chosen division winner when it
//      projects to strictly more wins (the former winner drops to a wildcard).
//   2. Ensure the wildcard field holds the best non-division-winners in the
//      conference — any left-out team that out-projects a picked wildcard takes
//      that slot, and the weakest wildcard drops out.
// Ties always keep the user's pick, so reconciliation never churns on equal
// records and is deterministic. Pure function.
export function reconcile(
  divisionPicks: Record<string, string>,
  wildcards: Record<Conference, string[]>,
  records: Record<string, number>,
): { divisionPicks: Record<string, string>; wildcards: Record<Conference, string[]>; swaps: Swap[] } {
  const dp = { ...divisionPicks };
  const wc: Record<Conference, string[]> = {
    AFC: [...(wildcards.AFC ?? [])],
    NFC: [...(wildcards.NFC ?? [])],
  };
  const swaps: Swap[] = [];
  const winsOf = (t: string) => (typeof records[t] === "number" ? records[t] : 0);

  // ── 1. Division winner ↔ same-division wildcard ────────────────────────────
  for (const div of DIVISIONS) {
    const winner = dp[div.key];
    if (!winner) continue;
    const conf = div.conf;
    // Wildcards this user picked that also belong to this division.
    const candidates = wc[conf].filter((t) => div.teams.includes(t));
    if (!candidates.length) continue;

    // Best team by wins; must strictly beat the winner to trigger a swap.
    let best = winner;
    for (const c of candidates) if (winsOf(c) > winsOf(best)) best = c;
    if (best === winner) continue;

    const idx = wc[conf].indexOf(best);
    wc[conf][idx] = winner; // former winner takes the wildcard slot
    dp[div.key] = best; // wildcard takes the division
    swaps.push({ kind: "division", division: div.key, promoted: best, demoted: winner });
  }

  // ── 2. Wildcard field ↔ left-out teams ─────────────────────────────────────
  // Runs after step 1 so it sees the reconciled division winners (and any
  // former winner that dropped into the wildcard field).
  for (const conf of CONFERENCES) {
    const confDivs = DIVISIONS.filter((d) => d.conf === conf);
    const winners = new Set(confDivs.map((d) => dp[d.key]).filter(Boolean));
    const confTeams = confDivs.flatMap((d) => d.teams);

    // Teams eligible to be a wildcard but currently left out, best record first.
    // We only ever swap an out team for a *picked* wildcard — never fill an
    // empty slot — so the user's field size is left untouched.
    const outPool = () =>
      confTeams
        .filter((t) => !winners.has(t) && !wc[conf].includes(t))
        .sort((a, b) => winsOf(b) - winsOf(a) || confTeams.indexOf(a) - confTeams.indexOf(b));

    // Greedily replace the weakest wildcard with the best out team while it
    // strictly out-projects it. Each swap strictly raises the total wildcard
    // wins, which is bounded, so the loop terminates.
    for (;;) {
      const pool = outPool();
      if (!pool.length) break;
      const bestOut = pool[0];
      // Weakest current wildcard; on a tie demote the later pick (keeps earlier
      // picks stickier, matching the tie-goes-to-the-user rule).
      let worstIdx = -1;
      for (let i = 0; i < wc[conf].length; i++) {
        if (worstIdx === -1 || winsOf(wc[conf][i]) <= winsOf(wc[conf][worstIdx])) worstIdx = i;
      }
      if (worstIdx === -1) break;
      const worstWc = wc[conf][worstIdx];
      if (winsOf(bestOut) <= winsOf(worstWc)) break; // no strict improvement
      wc[conf][worstIdx] = bestOut;
      swaps.push({ kind: "wildcard", division: divisionOf(bestOut), promoted: bestOut, demoted: worstWc });
    }
  }

  return { divisionPicks: dp, wildcards: wc, swaps };
}

export interface SyncResult {
  picks: SeasonPicks; // effective picks: records overlaid, div/wildcard reconciled
  derivedTeams: string[]; // teams whose wins now come from a completed weekly slate
  swaps: Swap[]; // auto-swaps applied on this pass
}

// Load an entry, apply the weekly override + auto-swap, persist any change, and
// return the effective picks. A frozen (locked or past-deadline) entry is left
// untouched — predictions are final once locked in.
export async function syncEntry(
  userId: string,
  frozen: boolean,
  entry?: SeasonEntry | null,
  season = SEASON,
): Promise<SyncResult> {
  const row = entry ?? (await getEntry(userId, season));
  const base = parseEntry(row);
  if (!row || frozen) return { picks: base, derivedTeams: [], swaps: [] };

  const derived = await getWeeklyDerived(userId, season);
  const records = effectiveRecords(base, derived);
  const { divisionPicks, wildcards, swaps } = reconcile(base.divisionPicks, base.wildcards, records);

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
    swaps,
  };
}
