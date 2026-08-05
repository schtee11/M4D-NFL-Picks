// Scoring engine. Compares a user's season predictions against actual NFL
// results and produces a point total + a per-category breakdown.
//
// Bracket rounds are scored by SET membership ("did the team you advanced
// actually advance this round?") so it stays fair even though a predicted
// bracket may seed teams differently than reality.

import { Conference, DIVISIONS } from "./teams";
import {
  SeasonPicks,
  getWcMatchups,
  getDivMatchups,
  getConfMatchup,
  getSuperBowl,
  canLock,
} from "./bracket";
import { ActualStandings, PlayoffResults } from "./espn";

export const SCORING = {
  divisionWinner: 10,
  wildcard: 8,
  wildCardGame: 5,
  divisionalGame: 10,
  conferenceGame: 15,
  superBowlTeam: 20,
  champion: 30,
  weeklyGame: 1,
};

export interface ScoreBreakdown {
  divisionWinners: number;
  wildcards: number;
  wildCardRound: number;
  divisionalRound: number;
  conferenceRound: number;
  superBowl: number;
  champion: number;
  weekly: number;
  total: number;
}

export function emptyBreakdown(): ScoreBreakdown {
  return {
    divisionWinners: 0,
    wildcards: 0,
    wildCardRound: 0,
    divisionalRound: 0,
    conferenceRound: 0,
    superBowl: 0,
    champion: 0,
    weekly: 0,
    total: 0,
  };
}

function countIntersection(a: string[], b: (string | null)[]): number {
  const set = new Set(b.filter(Boolean) as string[]);
  return a.filter((x) => set.has(x)).length;
}

export interface Actuals {
  standings: ActualStandings | null;
  playoffs: PlayoffResults | null;
}

// Score the season-prediction portion (everything except weekly picks).
export function scoreSeason(picks: SeasonPicks, actuals: Actuals): ScoreBreakdown {
  const b = emptyBreakdown();
  const { standings, playoffs } = actuals;

  if (standings) {
    for (const d of DIVISIONS) {
      if (picks.divisionPicks[d.key] && picks.divisionPicks[d.key] === standings.divisionWinners[d.key]) {
        b.divisionWinners += SCORING.divisionWinner;
      }
    }
    for (const conf of ["AFC", "NFC"] as Conference[]) {
      const mine = picks.wildcards[conf] ?? [];
      const actual = standings.wildcards[conf] ?? [];
      b.wildcards += countIntersection(mine, actual) * SCORING.wildcard;
    }
  }

  if (playoffs && canLock(picks)) {
    // User's advancers per round.
    const myWc: string[] = [];
    const myDiv: string[] = [];
    const myConf: string[] = [];
    for (const conf of ["AFC", "NFC"] as Conference[]) {
      getWcMatchups(conf, picks).forEach((m) => m.winner && myWc.push(m.winner));
      const dm = getDivMatchups(conf, picks);
      if (dm) dm.forEach((m) => m.winner && myDiv.push(m.winner));
      const cm = getConfMatchup(conf, picks);
      if (cm?.winner) myConf.push(cm.winner);
    }
    const sb = getSuperBowl(picks);

    b.wildCardRound = countIntersection(myWc, playoffs.wildCardWinners) * SCORING.wildCardGame;
    b.divisionalRound = countIntersection(myDiv, playoffs.divisionalWinners) * SCORING.divisionalGame;
    b.conferenceRound = countIntersection(myConf, playoffs.conferenceWinners) * SCORING.conferenceGame;
    // Super Bowl participants correct (the two conference winners you sent):
    if (sb) {
      b.superBowl = countIntersection([sb.teamA, sb.teamB], playoffs.conferenceWinners) * SCORING.superBowlTeam;
      if (sb.winner && sb.winner === playoffs.superBowlChampion) b.champion = SCORING.champion;
    }
  }

  b.total =
    b.divisionWinners +
    b.wildcards +
    b.wildCardRound +
    b.divisionalRound +
    b.conferenceRound +
    b.superBowl +
    b.champion +
    b.weekly;
  return b;
}

// Score weekly straight-up picks: 1 point per correct pick against final games.
export function scoreWeekly(
  picks: { week: number; gameId: string; pickedTeam: string }[],
  finals: Map<string, string>, // gameId -> winning abbr
): number {
  let correct = 0;
  for (const p of picks) {
    const w = finals.get(p.gameId);
    if (w && w === p.pickedTeam) correct += 1;
  }
  return correct * SCORING.weeklyGame;
}
