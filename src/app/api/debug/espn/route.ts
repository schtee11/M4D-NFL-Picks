import { NextResponse } from "next/server";
import { SEASON } from "@/lib/config";

// TEMPORARY diagnostics endpoint. Probes several NFL data sources from the
// server to find one Railway isn't IP-blocked from. Remove once the schedule
// is confirmed working.
export const dynamic = "force-dynamic";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function probe(label: string, url: string, extraHeaders: Record<string, string> = {}) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "user-agent": UA, accept: "application/json", ...extraHeaders },
    });
    const ms = Date.now() - started;
    const text = await res.text();
    let body: any = null;
    try {
      body = JSON.parse(text);
    } catch {
      /* non-JSON (e.g. 403 HTML) */
    }
    const events: any[] = Array.isArray(body)
      ? body
      : body?.events ?? body?.content?.sbData?.events ?? body?.items ?? [];
    return {
      label,
      url,
      status: res.status,
      ok: res.ok,
      ms,
      eventCount: events.length,
      bodyKind: body ? (Array.isArray(body) ? "array" : "json") : "non-json",
      snippet: text.slice(0, 160),
    };
  } catch (e) {
    return { label, url, error: (e as Error)?.message ?? "fetch threw", ms: Date.now() - started };
  }
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const season = Number(sp.get("season") || SEASON);
  const week = Number(sp.get("week") || 1);
  const espnHeaders = { referer: "https://www.espn.com/", origin: "https://www.espn.com" };

  const results = await Promise.all([
    probe(
      "site.api + espn Referer/Origin",
      `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}&seasontype=2&week=${week}`,
      espnHeaders,
    ),
    probe(
      "site.web.api host",
      `https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}&seasontype=2&week=${week}`,
    ),
    probe(
      "sports.core.api host",
      `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${season}/types/2/weeks/${week}/events?lang=en&region=us`,
    ),
    probe(
      "cdn core retry",
      `https://cdn.espn.com/core/nfl/scoreboard?xhr=1&year=${season}&seasontype=2&week=${week}`,
    ),
    probe(
      "TheSportsDB (non-ESPN)",
      `https://www.thesportsdb.com/api/v1/json/3/eventsround.php?id=4391&r=${week}&s=${season}`,
    ),
    // Sleeper — free, open, developer-friendly API (usually not IP-blocked).
    probe("Sleeper state/nfl", `https://api.sleeper.app/v1/state/nfl`),
    probe("Sleeper schedule .com", `https://api.sleeper.com/schedule/nfl/regular/${season}`),
    probe("Sleeper schedule .app", `https://api.sleeper.app/schedule/nfl/regular/${season}`),
  ]);

  return NextResponse.json({ season, week, results }, { status: 200 });
}
