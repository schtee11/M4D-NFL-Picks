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

// Betting line for a game, when a book has posted one. `details` is ESPN's
// human string (e.g. "BUF -3.5"); `overUnder` is the total.
export interface GameOdds {
  details?: string;
  overUnder?: number;
}

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
  odds: GameOdds | null; // betting line, when available
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
    // Betting line, when a provider has posted one for this game.
    const oddsRaw = comp?.odds?.[0];
    let odds: GameOdds | null = null;
    if (oddsRaw) {
      const details = typeof oddsRaw.details === "string" ? oddsRaw.details : undefined;
      const ou = oddsRaw.overUnder != null ? Number(oddsRaw.overUnder) : undefined;
      const overUnder = ou != null && Number.isFinite(ou) ? ou : undefined;
      if (details || overUnder != null) odds = { details, overUnder };
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
      odds,
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

// Days of rest each team has going into each game — the gap since that team's
// previous game. Returns a map of gameId → { home, away } days (null when there
// is no prior game, e.g. Week 1). Computed from the full schedule.
export function restDaysByGame(games: Game[]): Map<string, { home: number | null; away: number | null }> {
  const DAY = 86_400_000;
  const byTeam = new Map<string, { id: string; t: number }[]>();
  for (const g of games) {
    for (const abbr of [g.home.abbr, g.away.abbr]) {
      if (!abbr) continue;
      const arr = byTeam.get(abbr) ?? [];
      arr.push({ id: g.id, t: new Date(g.date).getTime() });
      byTeam.set(abbr, arr);
    }
  }
  // For each (team, game), remember the previous game's kickoff.
  const prev = new Map<string, number>(); // key `${team}:${gameId}`
  for (const [team, arr] of byTeam) {
    arr.sort((a, b) => a.t - b.t);
    for (let i = 1; i < arr.length; i++) prev.set(`${team}:${arr[i].id}`, arr[i - 1].t);
  }
  const restFor = (team: string, g: Game): number | null => {
    const p = prev.get(`${team}:${g.id}`);
    if (p == null) return null;
    return Math.round((new Date(g.date).getTime() - p) / DAY);
  };
  const out = new Map<string, { home: number | null; away: number | null }>();
  for (const g of games) out.set(g.id, { home: restFor(g.home.abbr, g), away: restFor(g.away.abbr, g) });
  return out;
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

// ── Full division standings (live playoff picture) ───────────────────────────

export interface DivisionTeamRecord {
  abbr: string;
  wins: number;
  losses: number;
  ties: number;
  pct: number; // win percentage, 0..1
  seed: number | null; // conference playoff seed (1-7) when in a playoff spot
  status: "division" | "wildcard" | "out";
  clinch: string | null; // ESPN clinch/elimination note, when present
}

export interface DivisionStanding {
  key: string; // "AFC East"
  conf: Conference;
  teams: DivisionTeamRecord[]; // ordered: playoff seeds first, then by record
}

function statValue(stats: any[], name: string): number | null {
  const s = stats.find((x) => x?.name === name);
  if (!s) return null;
  const v = Number(s.value);
  return Number.isFinite(v) ? v : null;
}

// Parse ESPN standings into per-division team records with the current playoff
// picture. Unlike getStandings (which gates scoring and only surfaces the
// winners/seeds once the season is over), this keeps every team's W-L-T and is
// safe to show any time — the seeds just reflect where things stand right now.
// Returns null if the shape can't be understood (e.g. season not started).
export async function getDivisionStandings(season: number): Promise<DivisionStanding[] | null> {
  const url = `https://cdn.espn.com/core/nfl/standings?xhr=1&season=${season}`;
  const json = await getJson(url);
  const groups: any[] = json?.content?.standings?.groups ?? [];
  if (!groups.length) return null;

  const byKey = new Map<string, DivisionTeamRecord[]>();

  try {
    for (const conf of groups) {
      const confAbbr: Conference = (conf?.abbreviation ?? conf?.name ?? "")
        .toUpperCase()
        .includes("AFC")
        ? "AFC"
        : "NFC";
      for (const div of conf?.groups ?? []) {
        const divName = matchDivisionName(confAbbr, div?.name ?? "");
        if (!divName) continue;
        const entries: any[] = div?.standings?.entries ?? [];
        const teams: DivisionTeamRecord[] = [];
        for (const e of entries) {
          const abbr = normalizeAbbr(e?.team?.abbreviation ?? "");
          if (!abbr) continue;
          const stats: any[] = e?.stats ?? [];
          const wins = statValue(stats, "wins") ?? 0;
          const losses = statValue(stats, "losses") ?? 0;
          const ties = statValue(stats, "ties") ?? 0;
          const played = wins + losses + ties;
          const pctRaw = statValue(stats, "winPercent");
          const pct = pctRaw != null ? pctRaw : played > 0 ? (wins + ties * 0.5) / played : 0;
          const rawSeed = statValue(stats, "playoffSeed");
          // ESPN assigns 1-7 to teams in playoff position; everyone else gets a
          // higher number we treat as "out".
          const seed = rawSeed != null && rawSeed >= 1 && rawSeed <= 7 ? rawSeed : null;
          const note = typeof e?.note?.description === "string" ? e.note.description : null;
          teams.push({
            abbr,
            wins,
            losses,
            ties,
            pct,
            seed,
            status: seed == null ? "out" : seed <= 4 ? "division" : "wildcard",
            clinch: note,
          });
        }
        byKey.set(divName, teams);
      }
    }
  } catch {
    return null;
  }

  const all = [...byKey.values()].flat();
  if (!all.length) return null;
  // Preseason guard: before any game is played ESPN's provisional seeds are
  // meaningless, so don't imply a playoff picture that doesn't exist yet.
  const anyGames = all.some((t) => t.wins + t.losses + t.ties > 0);

  const out: DivisionStanding[] = [];
  for (const d of DIVISIONS) {
    const teams = byKey.get(d.key);
    if (!teams || !teams.length) continue;
    if (!anyGames) for (const t of teams) ((t.seed = null), (t.status = "out"));
    teams.sort((a, b) => {
      const sa = a.seed ?? 99;
      const sb = b.seed ?? 99;
      if (sa !== sb) return sa - sb;
      if (b.pct !== a.pct) return b.pct - a.pct;
      if (b.wins !== a.wins) return b.wins - a.wins;
      return a.abbr.localeCompare(b.abbr);
    });
    out.push({ key: d.key, conf: d.conf, teams });
  }
  return out.length ? out : null;
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
