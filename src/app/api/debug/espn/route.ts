import { NextResponse } from "next/server";
import { SEASON } from "@/lib/config";

// TEMPORARY diagnostics endpoint. Hits several ESPN scoreboard URL variants
// from the server and reports what each returns, so we can see why the weekly
// schedule is empty in production. Safe (read-only public data) — remove once
// the schedule is confirmed working.
export const dynamic = "force-dynamic";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function probe(label: string, url: string) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "user-agent": UA, accept: "application/json" },
    });
    const ms = Date.now() - started;
    let body: any = null;
    let parseError: string | null = null;
    try {
      body = await res.json();
    } catch (e) {
      parseError = (e as Error)?.message ?? "parse failed";
    }
    const events: any[] = body?.events ?? body?.content?.sbData?.events ?? [];
    const first = events[0];
    const firstSummary = first
      ? {
          date: first?.date,
          name: first?.name ?? first?.shortName,
          teams: first?.competitions?.[0]?.competitors?.map(
            (c: any) => c?.team?.abbreviation,
          ),
        }
      : null;
    return {
      label,
      url,
      status: res.status,
      ok: res.ok,
      ms,
      eventCount: events.length,
      first: firstSummary,
      parseError,
    };
  } catch (e) {
    return {
      label,
      url,
      error: (e as Error)?.message ?? "fetch threw",
      ms: Date.now() - started,
    };
  }
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const season = Number(sp.get("season") || SEASON);
  const week = Number(sp.get("week") || 1);
  const B = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";

  const results = await Promise.all([
    probe("site: dates+seasontype+week", `${B}/scoreboard?dates=${season}&seasontype=2&week=${week}`),
    probe("site: seasontype+week (no dates)", `${B}/scoreboard?seasontype=2&week=${week}`),
    probe("site: no params (current)", `${B}/scoreboard`),
    probe("cdn core", `https://cdn.espn.com/core/nfl/scoreboard?xhr=1&year=${season}&seasontype=2&week=${week}`),
  ]);

  return NextResponse.json({ season, week, results }, { status: 200 });
}
