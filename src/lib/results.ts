// Loads and caches "actual" NFL results used for scoring. Pages read from the
// DB cache; ESPN is only hit when the cache is missing or stale, and a failed
// fetch never throws — it just leaves the previous cache (or empties) in place.

import { prisma } from "./db";
import { SEASON } from "./config";
import {
  getStandings,
  getPlayoffResults,
  getScoreboard,
  getDivisionStandingsFull,
  isRegularSeasonComplete,
  ActualStandings,
  PlayoffResults,
  DivisionStanding,
} from "./espn";
import { Actuals } from "./scoring";

const STALE_MS = 15 * 60 * 1000; // 15 minutes

async function readCache(season: number, kind: string): Promise<{ data: any; fetchedAt: Date } | null> {
  const row = await prisma.resultCache.findUnique({ where: { season_kind: { season, kind } } });
  if (!row) return null;
  try {
    return { data: JSON.parse(row.data), fetchedAt: row.fetchedAt };
  } catch {
    return null;
  }
}

async function writeCache(season: number, kind: string, data: any) {
  const payload = JSON.stringify(data);
  await prisma.resultCache.upsert({
    where: { season_kind: { season, kind } },
    create: { season, kind, data: payload },
    update: { data: payload, fetchedAt: new Date() },
  });
}

// Whether the regular season has finished. Division-winner and wildcard
// predictions are FINAL-standings bets, so they must not score before this is
// true (preseason standings are all 0–0 and would hand out phantom points).
// Latches to true once observed, so a transient ESPN hiccup can't un-finish it.
async function regularSeasonComplete(season: number): Promise<boolean> {
  const cached = await readCache(season, "seasonComplete");
  if (cached?.data === true) return true;
  const complete = await isRegularSeasonComplete(season);
  if (complete) await writeCache(season, "seasonComplete", true);
  return complete;
}

export async function getActuals(season = SEASON, forceRefresh = false): Promise<Actuals> {
  let standings: ActualStandings | null = null;
  let playoffs: PlayoffResults | null = null;

  const sCache = await readCache(season, "standings");
  const pCache = await readCache(season, "playoffs");
  const fresh = (c: { fetchedAt: Date } | null) =>
    c && Date.now() - c.fetchedAt.getTime() < STALE_MS;

  if (!forceRefresh && fresh(pCache)) playoffs = pCache!.data;

  // Standings only count once the regular season is over. Until then, division
  // winners and wildcards are undecided, so they score 0 (standings stays null).
  if (await regularSeasonComplete(season)) {
    if (!forceRefresh && fresh(sCache)) standings = sCache!.data;
    if (standings === null) {
      const fetched = await getStandings(season);
      if (fetched) {
        standings = fetched;
        await writeCache(season, "standings", fetched);
      } else if (sCache) {
        standings = sCache.data; // fall back to stale cache
      }
    }
  }
  if (playoffs === null) {
    const fetched = await getPlayoffResults(season);
    // Only cache if there is at least one result to avoid caching all-empty.
    const hasAny =
      fetched.wildCardWinners.length ||
      fetched.divisionalWinners.length ||
      fetched.conferenceWinners.length ||
      fetched.superBowlChampion;
    if (hasAny) {
      playoffs = fetched;
      await writeCache(season, "playoffs", fetched);
    } else if (pCache) {
      playoffs = pCache.data;
    }
  }

  return { standings, playoffs };
}

// Full division standings with the live playoff picture, cached like the other
// results so a transient ESPN hiccup falls back to the last good copy rather
// than blanking the page. Unlike getActuals this is never gated on the season
// being over — it's a running snapshot of every team's record.
export async function getDivisionRecords(
  season = SEASON,
  forceRefresh = false,
): Promise<DivisionStanding[] | null> {
  const cache = await readCache(season, "divStandings");
  const fresh = cache && Date.now() - cache.fetchedAt.getTime() < STALE_MS;
  if (!forceRefresh && fresh) return cache!.data;

  const fetched = await getDivisionStandingsFull(season);
  if (fetched && fetched.length) {
    await writeCache(season, "divStandings", fetched);
    return fetched;
  }
  return cache ? cache.data : null; // fall back to stale cache on failure
}

export interface DivisionsView {
  divisions: DivisionStanding[] | null; // ESPN standings, or null if unreachable
  season: number; // the season the standings actually describe
  isFallback: boolean; // true when we fell back to a prior completed season
  live: boolean; // true once the shown season has games (seeds are meaningful)
}

const hasGames = (d: DivisionStanding[] | null) =>
  !!d && d.some((x) => x.teams.some((t) => t.wins + t.losses + t.ties > 0));

// Standings to show on the Divisions page. Prefers the configured season, but
// during the long preseason window (or if that season isn't published yet)
// falls back to the previous season's final standings so there's always real
// data — including who actually made the playoffs — rather than 32 zeros.
export async function getDivisionsView(forceRefresh = false): Promise<DivisionsView> {
  const primary = await getDivisionRecords(SEASON, forceRefresh);
  if (hasGames(primary)) return { divisions: primary, season: SEASON, isFallback: false, live: true };

  const prev = await getDivisionRecords(SEASON - 1, forceRefresh);
  if (hasGames(prev)) return { divisions: prev, season: SEASON - 1, isFallback: true, live: true };

  // Nothing anywhere — hand back whatever we have (possibly null) so the page
  // can still render the division structure with empty records.
  return { divisions: primary, season: SEASON, isFallback: false, live: false };
}

// Map of gameId -> winning abbr for a completed (or in-progress) week.
export async function getWeekFinals(season: number, week: number): Promise<Map<string, string>> {
  const games = await getScoreboard(season, week, 2);
  const m = new Map<string, string>();
  for (const g of games) if (g.winner) m.set(g.id, g.winner);
  return m;
}
