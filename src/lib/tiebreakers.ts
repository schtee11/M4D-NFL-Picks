// NFL playoff tie-breaking, applied when the bracket field is DERIVED from a
// fully-called game slate (the "matchups" track). Because that slate fixes the
// outcome of every game, we can run the real cascade instead of ordering by raw
// win count:
//
//   Division tie:  head-to-head → division record → common games →
//                  conference record → strength of victory →
//                  strength of schedule → (fixed team order)
//   Wild-card tie: head-to-head → conference record → common games →
//                  strength of victory → strength of schedule →
//                  (fixed team order)
//
// What we deliberately DON'T implement — and where we fall back to a fixed,
// deterministic team order in place of the NFL's coin toss — are the point-based
// steps (points-for/against rankings, net points, net touchdowns). The slate is
// called as win/loss only, so no scores exist to compute them from. Real ties
// almost never reach that far, and the fallback keeps the result deterministic.
//
// Two-club ties (by far the common case) are resolved exactly. Ties among three
// or more clubs are resolved by a pairwise, lexicographic comparison rather than
// the NFL's strict eliminate-and-restart procedure; the two agree in ordinary
// cases and the team-order fallback guarantees a deterministic total order
// regardless. The wild-card "reduce multiple same-division clubs to the highest
// ranked first" rule is honored by comparing two same-division clubs with the
// division cascade even inside the wild-card pool.
//
// Note on win %: every team plays 17 games, so ordering by win count and by win
// percentage is identical; ties (equal win counts) are exactly where this
// cascade takes over. A called slate has no drawn games, so there are no
// fractional records to worry about.

import { DIVISIONS, conferenceOf } from "./teams";

export interface GameResult {
  winner: string;
  loser: string;
}

const divisionOf = new Map<string, string>(
  DIVISIONS.flatMap((d) => d.teams.map((t) => [t, d.key] as const)),
);

interface Played {
  opp: string;
  won: boolean;
}

export interface TieContext {
  played: Map<string, Played[]>; // team -> every game it played (opponent + result)
  winsOf: (t: string) => number; // total wins across the slate
  teamOrder: (t: string) => number; // deterministic final fallback (lower = better)
}

// Index the called slate into per-team game lists so every tiebreak metric is a
// simple filter over a team's games.
export function buildTieContext(
  results: GameResult[],
  winsOf: (t: string) => number,
  teamOrder: (t: string) => number,
): TieContext {
  const played = new Map<string, Played[]>();
  const push = (team: string, opp: string, won: boolean) => {
    const arr = played.get(team) ?? [];
    arr.push({ opp, won });
    played.set(team, arr);
  };
  for (const r of results) {
    if (!r.winner || !r.loser) continue;
    push(r.winner, r.loser, true);
    push(r.loser, r.winner, false);
  }
  return { played, winsOf, teamOrder };
}

const GAMES = 17; // games per team in a season; used as the win-% denominator

// win% over a team's games whose opponent passes `pick`. Returns null when the
// team played no such games, so the caller can skip an inapplicable step.
function pctVs(ctx: TieContext, team: string, pick: (opp: string) => boolean): number | null {
  const games = (ctx.played.get(team) ?? []).filter((g) => pick(g.opp));
  if (!games.length) return null;
  return games.filter((g) => g.won).length / games.length;
}

function headToHead(ctx: TieContext, team: string, group: string[]): number | null {
  const others = new Set(group.filter((t) => t !== team));
  return pctVs(ctx, team, (opp) => others.has(opp));
}

function divisionRecord(ctx: TieContext, team: string): number | null {
  const div = divisionOf.get(team);
  return pctVs(ctx, team, (opp) => divisionOf.get(opp) === div);
}

function conferenceRecord(ctx: TieContext, team: string): number | null {
  const conf = conferenceOf(team);
  return pctVs(ctx, team, (opp) => conferenceOf(opp) === conf);
}

// win% over games against opponents faced by EVERY team in the group.
function commonGames(ctx: TieContext, team: string, group: string[]): number | null {
  const oppSets = group.map((t) => new Set((ctx.played.get(t) ?? []).map((g) => g.opp)));
  if (!oppSets.length) return null;
  const common = new Set<string>();
  for (const opp of oppSets[0]) if (oppSets.every((s) => s.has(opp))) common.add(opp);
  if (!common.size) return null;
  return pctVs(ctx, team, (opp) => common.has(opp));
}

// Strength of victory: average win% of the teams this club beat.
function strengthOfVictory(ctx: TieContext, team: string): number | null {
  const beat = (ctx.played.get(team) ?? []).filter((g) => g.won).map((g) => g.opp);
  if (!beat.length) return null;
  return beat.reduce((s, o) => s + ctx.winsOf(o) / GAMES, 0) / beat.length;
}

// Strength of schedule: average win% of all opponents.
function strengthOfSchedule(ctx: TieContext, team: string): number | null {
  const opps = (ctx.played.get(team) ?? []).map((g) => g.opp);
  if (!opps.length) return null;
  return opps.reduce((s, o) => s + ctx.winsOf(o) / GAMES, 0) / opps.length;
}

type Step = (t: string) => number | null;

function divisionSteps(ctx: TieContext, group: string[]): Step[] {
  return [
    (t) => headToHead(ctx, t, group),
    (t) => divisionRecord(ctx, t),
    (t) => commonGames(ctx, t, group),
    (t) => conferenceRecord(ctx, t),
    (t) => strengthOfVictory(ctx, t),
    (t) => strengthOfSchedule(ctx, t),
  ];
}

function wildcardSteps(ctx: TieContext, group: string[]): Step[] {
  return [
    (t) => headToHead(ctx, t, group),
    (t) => conferenceRecord(ctx, t),
    (t) => commonGames(ctx, t, group),
    (t) => strengthOfVictory(ctx, t),
    (t) => strengthOfSchedule(ctx, t),
  ];
}

// Compare two clubs on a sequence of "higher is better" metrics. A step that is
// inapplicable to either side (null) is skipped. Falls back to deterministic
// team order so the comparison is always a strict, stable ordering.
function compareWith(a: string, b: string, ctx: TieContext, steps: Step[]): number {
  for (const step of steps) {
    const va = step(a);
    const vb = step(b);
    if (va == null || vb == null) continue;
    if (va !== vb) return vb - va; // higher metric sorts first
  }
  return ctx.teamOrder(a) - ctx.teamOrder(b);
}

// The division winner: the team with the most wins, ties broken by the division
// cascade.
export function pickDivisionWinner(ctx: TieContext, teams: string[]): string {
  const maxWins = Math.max(...teams.map((t) => ctx.winsOf(t)));
  const tied = teams.filter((t) => ctx.winsOf(t) === maxWins);
  if (tied.length === 1) return tied[0];
  const steps = divisionSteps(ctx, tied);
  return [...tied].sort((a, b) => compareWith(a, b, ctx, steps))[0];
}

// Rank a conference's non-winners best-first for the wild-card slots. Clubs are
// grouped by win count (win% is equivalent at 17 games); each tied group is
// ordered by the wild-card cascade, except that two clubs from the same division
// are compared with the division cascade (the NFL's "highest-ranked in the
// division advances first" rule).
export function rankWildcards(ctx: TieContext, candidates: string[]): string[] {
  const byWins = new Map<number, string[]>();
  for (const t of candidates) {
    const w = ctx.winsOf(t);
    const arr = byWins.get(w) ?? [];
    arr.push(t);
    byWins.set(w, arr);
  }
  const order: string[] = [];
  for (const w of [...byWins.keys()].sort((a, b) => b - a)) {
    const group = byWins.get(w)!;
    if (group.length === 1) {
      order.push(group[0]);
      continue;
    }
    const sorted = [...group].sort((a, b) => {
      const sameDivision = divisionOf.get(a) === divisionOf.get(b);
      const steps = sameDivision ? divisionSteps(ctx, group) : wildcardSteps(ctx, group);
      return compareWith(a, b, ctx, steps);
    });
    order.push(...sorted);
  }
  return order;
}
