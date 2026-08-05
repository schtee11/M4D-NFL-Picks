// ESPN public NFL API helpers.
//
// These are unofficial, free, no-key endpoints. They run at request time from
// wherever the app is deployed. Every call is wrapped so a failure degrades
// gracefully (returns null / empty) rather than crashing a page.
//
// Regular season: seasontype=2, weeks 1..18
// Postseason:     seasontype=3, week 1=Wild Card, 2=Divisional, 3=Conference, 5=Super Bowl

import { normalizeAbbr, Conference, DIVISIONS } from "./teams";

// NOTE: the classic `site.api.espn.com` host 403-blocks datacenter IPs (e.g.
// Railway). The `site.web.api.espn.com` host serves the identical response
// shape and is reachable from servers, so we use it instead.
const BASE = "https://site.web.api.espn.com/apis/site/v2/sports/football/nfl";

export type GameState = "pre" | "in" | "post";

export interface Game {
  id: string;
  week: number;
  seasonType: number;
  date: string; // ISO kickoff
  state: GameState;
  statusDetail: string; // e.g. "Final", "Sun 1:00 PM"
  home: { abbr: string; score: number | null };
  away: { abbr: string; score: number | null };
  winner: string | null; // abbr of winner, once final
}

// A browser-like User-Agent — ESPN's edge returns 403 to some non-browser
// agents, which would silently empty out the schedule.
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function getJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, {
      // Revalidate reasonably often; scores change during games.
      next: { revalidate: 60 },
      headers: { "user-agent": UA, accept: "application/json" },
    });
    if (!res.ok) {
      console.warn(`[espn] ${res.status} ${res.statusText} for ${url}`);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.warn(`[espn] fetch failed for ${url}:`, (e as Error)?.message);
    return null;
  }
}

function parseState(s: string): GameState {
  if (s === "pre" || s === "in" || s === "post") return s;
  return "pre";
}

function parseGames(events: any[], week: number, seasonType: number): Game[] {
  const games: Game[] = [];
  for (const ev of events) {
    const comp = ev?.competitions?.[0];
    if (!comp) continue;
    const competitors: any[] = comp.competitors ?? [];
    const homeC = competitors.find((c) => c.homeAway === "home");
    const awayC = competitors.find((c) => c.homeAway === "away");
    if (!homeC || !awayC) continue;
    const state = parseState(ev?.status?.type?.state ?? comp?.status?.type?.state ?? "pre");
    const homeAbbr = normalizeAbbr(homeC.team?.abbreviation ?? "");
    const awayAbbr = normalizeAbbr(awayC.team?.abbreviation ?? "");
    const homeScore = homeC.score != null ? Number(homeC.score) : null;
    const awayScore = awayC.score != null ? Number(awayC.score) : null;
    let winner: string | null = null;
    if (state === "post") {
      if (homeC.winner === true) winner = homeAbbr;
      else if (awayC.winner === true) winner = awayAbbr;
      else if (homeScore != null && awayScore != null && homeScore !== awayScore)
        winner = homeScore > awayScore ? homeAbbr : awayAbbr;
    }
    games.push({
      id: String(ev.id),
      week,
      seasonType,
      date: ev.date,
      state,
      statusDetail: ev?.status?.type?.shortDetail ?? "",
      home: { abbr: homeAbbr, score: homeScore },
      away: { abbr: awayAbbr, score: awayScore },
      winner,
    });
  }
  // Sort by kickoff time for stable display.
  games.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return games;
}

export async function getScoreboard(
  season: number,
  week: number,
  seasonType = 2,
): Promise<Game[]> {
  // Primary: the site API scoreboard for a specific season/week.
  const primary = `${BASE}/scoreboard?dates=${season}&seasontype=${seasonType}&week=${week}`;
  const json = await getJson(primary);
  const events: any[] = json?.events ?? [];
  if (events.length) return parseGames(events, week, seasonType);

  // Fallback: the CDN "core" scoreboard, which uses a different shape and
  // sometimes succeeds when the site API returns nothing.
  const fallback = `https://cdn.espn.com/core/nfl/scoreboard?xhr=1&year=${season}&seasontype=${seasonType}&week=${week}`;
  const alt = await getJson(fallback);
  const altEvents: any[] = alt?.content?.sbData?.events ?? alt?.events ?? [];
  if (altEvents.length) return parseGames(altEvents, week, seasonType);

  return [];
}

// Full regular-season schedule (weeks 1..18) as a flat list of games. Used to
// derive projected records from a user's weekly picks and to tell when a team's
// entire slate has been picked. Weeks are fetched in parallel; any week that
// fails simply contributes nothing, so a partial outage degrades gracefully.
export async function getSeasonSchedule(season: number): Promise<Game[]> {
  const weeks = Array.from({ length: 18 }, (_, i) => i + 1);
  const perWeek = await Promise.all(weeks.map((w) => getScoreboard(season, w, 2)));
  return perWeek.flat();
}

// True once every Week 18 regular-season game is final — i.e. division winners
// and the 1–7 conference seeds are settled. Used to gate standings-based
// scoring so nothing is awarded on provisional (or preseason) standings.
export async function isRegularSeasonComplete(season: number): Promise<boolean> {
  const games = await getScoreboard(season, 18, 2);
  return games.length > 0 && games.every((g) => g.state === "post");
}

// ── Actual results used for scoring season predictions ───────────────────────

export interface ActualStandings {
  divisionWinners: Record<string, string>; // { "AFC West": "KC", ... }
  wildcards: Record<Conference, string[]>; // seeds 5-7 per conf, in seed order
  seeds: Record<Conference, string[]>; // seeds 1-7 per conf (index 0 = seed 1)
}

// Best-effort parse of ESPN standings into division winners + conference seeds.
// Returns null if the shape can't be understood (e.g. season not started).
export async function getStandings(season: number): Promise<ActualStandings | null> {
  // The core standings endpoint groups by conference → division.
  const url = `https://cdn.espn.com/core/nfl/standings?xhr=1&season=${season}`;
  const json = await getJson(url);
  const groups: any[] = json?.content?.standings?.groups ?? [];
  if (!groups.length) return null;

  const divisionWinners: Record<string, string> = {};
  const seeds: Record<Conference, string[]> = { AFC: [], NFC: [] };

  try {
    for (const conf of groups) {
      const confAbbr = (conf?.abbreviation ?? conf?.name ?? "").toUpperCase().includes("AFC")
        ? "AFC"
        : "NFC";
      const confSeeds: { abbr: string; seed: number }[] = [];
      for (const div of conf?.groups ?? []) {
        const entries: any[] = div?.standings?.entries ?? [];
        // Rank within division by playoff seed if available, else by win%.
        const ranked = entries
          .map((e) => {
            const abbr = normalizeAbbr(e?.team?.abbreviation ?? "");
            const stats: any[] = e?.stats ?? [];
            const seedStat = stats.find((s) => s.name === "playoffSeed");
            const seed = seedStat ? Number(seedStat.value) : 999;
            return { abbr, seed };
          })
          .filter((x) => x.abbr);
        ranked.sort((a, b) => a.seed - b.seed);
        const divName = matchDivisionName(confAbbr, div?.name ?? "");
        if (divName && ranked[0]) divisionWinners[divName] = ranked[0].abbr;
        confSeeds.push(...ranked);
      }
      confSeeds.sort((a, b) => a.seed - b.seed);
      seeds[confAbbr as Conference] = confSeeds.slice(0, 7).map((s) => s.abbr);
    }
  } catch {
    return null;
  }

  if (Object.keys(divisionWinners).length < 8) return null;
  const wildcards: Record<Conference, string[]> = {
    AFC: seeds.AFC.slice(4, 7),
    NFC: seeds.NFC.slice(4, 7),
  };
  return { divisionWinners, wildcards, seeds };
}

function matchDivisionName(conf: string, name: string): string | null {
  const n = name.toLowerCase();
  const dir = ["east", "north", "south", "west"].find((d) => n.includes(d));
  if (!dir) return null;
  const key = `${conf} ${dir.charAt(0).toUpperCase() + dir.slice(1)}`;
  return DIVISIONS.some((d) => d.key === key) ? key : null;
}

export interface PlayoffResults {
  // Teams that WON in each round (i.e. advanced), by abbreviation.
  wildCardWinners: string[]; // advanced to Divisional
  divisionalWinners: string[]; // advanced to Conference
  conferenceWinners: string[]; // advanced to Super Bowl
  superBowlChampion: string | null;
}

// Derive playoff round winners from the postseason scoreboards.
export async function getPlayoffResults(season: number): Promise<PlayoffResults> {
  const [wc, div, conf, sb] = await Promise.all([
    getScoreboard(season, 1, 3),
    getScoreboard(season, 2, 3),
    getScoreboard(season, 3, 3),
    getScoreboard(season, 5, 3),
  ]);
  const winners = (games: Game[]) => games.filter((g) => g.winner).map((g) => g.winner as string);
  const sbGames = sb.filter((g) => g.winner);
  return {
    wildCardWinners: winners(wc),
    divisionalWinners: winners(div),
    conferenceWinners: winners(conf),
    superBowlChampion: sbGames[0]?.winner ?? null,
  };
}
