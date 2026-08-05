import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getActuals } from "@/lib/results";
import { SEASON } from "@/lib/config";

// POST /api/results/refresh → force-refresh cached actual results from ESPN.
// Any logged-in member can trigger it; results are shared league-wide.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const actuals = await getActuals(SEASON, true);
  return NextResponse.json({
    ok: true,
    hasStandings: !!actuals.standings,
    hasPlayoffs: !!actuals.playoffs,
  });
}
