// Loads and caches "actual" NFL results used for scoring. Pages read from the
// DB cache; ESPN is only hit when the cache is missing or stale, and a failed
// fetch never throws — it just leaves the previous cache (or empties) in place.

import { prisma } from "./db";
import { SEASON } from "./config";
import {
  getStandings,
  getPlayoffResults,
  getScoreboard,
  isRegularSeasonComplete,
  ActualStandings,
  PlayoffResults,
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

// Map of gameId -> winning abbr for a completed (or in-progress) week.
//
// Backed by the DB cache (kind "week:<n>") so the leaderboard — which asks for
// finals once per week that has any picks, on every load — doesn't hit ESPN for
// every past week each time. A week whose games are all final never changes, so
// once complete it's served from cache regardless of age; an in-progress week
// re-fetches after the normal staleness window.
export async function getWeekFinals(season: number, week: number): Promise<Map<string, string>> {
  const kind = `week:${week}`;
  const toMap = (finals: Record<string, string> | undefined) =>
    new Map<string, string>(Object.entries(finals ?? {}));

  const cached = await readCache(season, kind);
  if (cached) {
    if (cached.data?.complete) return toMap(cached.data.finals); // final forever
    if (Date.now() - cached.fetchedAt.getTime() < STALE_MS) return toMap(cached.data.finals);
  }

  const games = await getScoreboard(season, week, 2);
  if (!games.length) {
    // Fetch produced nothing (ESPN hiccup / week not posted) — keep stale cache.
    return toMap(cached?.data?.finals);
  }

  const finals: Record<string, string> = {};
  for (const g of games) if (g.winner) finals[g.id] = g.winner;
  const complete = games.every((g) => g.state === "post");
  await writeCache(season, kind, { finals, complete });
  return toMap(finals);
}
