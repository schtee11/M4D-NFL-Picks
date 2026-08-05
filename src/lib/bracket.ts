// Playoff bracket construction, ported directly from the design prototype so
// behavior matches. Pure functions over a picks object — shared by the
// interactive bracket UI (client) and the scoring engine (server).
//
// Seeding note (matches the prototype): division winners take seeds 1–4 in the
// order divisions are listed for the conference, and wildcards take seeds 5–7
// in the order they were picked. This is a deliberate simplification — real
// NFL seeding is by record. See README for the planned "rank your seeds"
// enhancement.

import { Conference, DIVISIONS, divisionsFor } from "./teams";

export interface SeasonPicks {
  divisionPicks: Record<string, string>; // { "AFC East": "BUF", ... }
  wildcards: Record<Conference, string[]>; // { AFC: [...3], NFC: [...3] }
  bracketPicks: Record<string, string>; // { "AFC_wc0": "BUF", ..., "SB": "KC" }
  records: Record<string, number>; // projected regular-season wins per team
}

export const REGULAR_SEASON_GAMES = 17;

export function projectedWins(picks: SeasonPicks, teamId: string): number {
  const w = picks.records?.[teamId];
  return typeof w === "number" && w >= 0 ? w : 0;
}

export interface Seed {
  seed: number;
  team: string;
}

export interface Matchup {
  key: string;
  seedA: number;
  teamA: string;
  seedB: number;
  teamB: string;
  winner: string | null;
}

export function emptyPicks(): SeasonPicks {
  return { divisionPicks: {}, wildcards: { AFC: [], NFC: [] }, bracketPicks: {}, records: {} };
}

export function divisionsComplete(picks: SeasonPicks): number {
  return DIVISIONS.filter((d) => picks.divisionPicks[d.key]).length;
}

export function wildcardsComplete(picks: SeasonPicks): number {
  return (picks.wildcards.AFC?.length ?? 0) + (picks.wildcards.NFC?.length ?? 0);
}

export function picksMade(picks: SeasonPicks): number {
  return divisionsComplete(picks) + wildcardsComplete(picks);
}

export function canLock(picks: SeasonPicks): boolean {
  return (
    DIVISIONS.every((d) => picks.divisionPicks[d.key]) &&
    (picks.wildcards.AFC?.length ?? 0) === 3 &&
    (picks.wildcards.NFC?.length ?? 0) === 3
  );
}

// Seeds a conference: division winners take seeds 1-4 ordered by projected
// wins, then wildcards take 5-7 ordered by projected wins. Ties keep the
// team's original (pick) order, so seeding is deterministic — never random.
export function getSeeds(conf: Conference, picks: SeasonPicks): Seed[] {
  const divWinners = divisionsFor(conf)
    .map((d) => picks.divisionPicks[d.key])
    .filter(Boolean) as string[];
  const wildcards = (picks.wildcards[conf] ?? []).filter(Boolean) as string[];

  const byWins = (list: string[]) =>
    list
      .map((team, i) => ({ team, i }))
      .sort((a, b) => projectedWins(picks, b.team) - projectedWins(picks, a.team) || a.i - b.i)
      .map((x) => x.team);

  const seeds: Seed[] = [];
  byWins(divWinners).forEach((team, i) => seeds.push({ seed: i + 1, team }));
  byWins(wildcards).forEach((team, i) => seeds.push({ seed: 5 + i, team }));
  return seeds;
}

export function getByeSeed(conf: Conference, picks: SeasonPicks): Seed | undefined {
  return getSeeds(conf, picks).find((s) => s.seed === 1);
}

export function getWcMatchups(conf: Conference, picks: SeasonPicks): Matchup[] {
  const seeds = getSeeds(conf, picks);
  const by = (n: number) => seeds.find((s) => s.seed === n)!;
  const pairs: [number, number][] = [
    [2, 7],
    [3, 6],
    [4, 5],
  ];
  return pairs.map(([a, b], i) => {
    const A = by(a);
    const B = by(b);
    const key = conf + "_wc" + i;
    let winner: string | null = picks.bracketPicks[key] ?? null;
    if (winner && winner !== A.team && winner !== B.team) winner = null;
    return { key, seedA: A.seed, teamA: A.team, seedB: B.seed, teamB: B.team, winner };
  });
}

export function getDivMatchups(conf: Conference, picks: SeasonPicks): Matchup[] | null {
  const wc = getWcMatchups(conf, picks);
  if (wc.some((m) => !m.winner)) return null;
  const bye = getByeSeed(conf, picks)!;
  const pool: Seed[] = [
    bye,
    ...wc.map((m) => ({ seed: m.winner === m.teamA ? m.seedA : m.seedB, team: m.winner as string })),
  ];
  const rest = pool.filter((p) => p.seed !== 1).sort((a, b) => a.seed - b.seed);
  const matchA: Matchup = {
    key: conf + "_div0",
    seedA: 1,
    teamA: bye.team,
    seedB: rest[0].seed,
    teamB: rest[0].team,
    winner: null,
  };
  const matchB: Matchup = {
    key: conf + "_div1",
    seedA: rest[1].seed,
    teamA: rest[1].team,
    seedB: rest[2].seed,
    teamB: rest[2].team,
    winner: null,
  };
  [matchA, matchB].forEach((m) => {
    let w: string | null = picks.bracketPicks[m.key] ?? null;
    if (w && w !== m.teamA && w !== m.teamB) w = null;
    m.winner = w;
  });
  return [matchA, matchB];
}

export function getConfMatchup(conf: Conference, picks: SeasonPicks): Matchup | null {
  const dm = getDivMatchups(conf, picks);
  if (!dm || dm.some((m) => !m.winner)) return null;
  const seedOf = (team: string) =>
    dm[0].winner === team
      ? dm[0].teamA === team
        ? dm[0].seedA
        : dm[0].seedB
      : dm[1].teamA === team
        ? dm[1].seedA
        : dm[1].seedB;
  const key = conf + "_conf";
  const teamA = dm[0].winner as string;
  const teamB = dm[1].winner as string;
  let w: string | null = picks.bracketPicks[key] ?? null;
  if (w && w !== teamA && w !== teamB) w = null;
  return { key, seedA: seedOf(teamA), teamA, seedB: seedOf(teamB), teamB, winner: w };
}

export function getSuperBowl(picks: SeasonPicks): Matchup | null {
  const afc = getConfMatchup("AFC", picks);
  const nfc = getConfMatchup("NFC", picks);
  if (!afc || !afc.winner || !nfc || !nfc.winner) return null;
  const teamA = afc.winner;
  const teamB = nfc.winner;
  let w: string | null = picks.bracketPicks["SB"] ?? null;
  if (w && w !== teamA && w !== teamB) w = null;
  return {
    key: "SB",
    seedA: afc.winner === afc.teamA ? afc.seedA : afc.seedB,
    teamA,
    seedB: nfc.winner === nfc.teamA ? nfc.seedA : nfc.seedB,
    teamB,
    winner: w,
  };
}

// Total number of bracket games decided across both conferences + SB (13).
export function bracketMadeCount(picks: SeasonPicks): number {
  if (!canLock(picks)) return 0;
  let count = 0;
  for (const conf of ["AFC", "NFC"] as Conference[]) {
    count += getWcMatchups(conf, picks).filter((m) => m.winner).length;
    const dm = getDivMatchups(conf, picks);
    if (dm) count += dm.filter((m) => m.winner).length;
    const cm = getConfMatchup(conf, picks);
    if (cm && cm.winner) count += 1;
  }
  const sb = getSuperBowl(picks);
  if (sb && sb.winner) count += 1;
  return count;
}

export const TOTAL_BRACKET_GAMES = 13;
export const TOTAL_SEASON_PICKS = 14;

export function champion(picks: SeasonPicks): string | null {
  const sb = getSuperBowl(picks);
  return sb?.winner ?? null;
}
