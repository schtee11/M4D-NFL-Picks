import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getEntry, parseEntry } from "@/lib/picks";
import { buildLeaderboard } from "@/lib/leaderboard";
import {
  picksMade,
  canLock,
  bracketMadeCount,
  TOTAL_SEASON_PICKS,
  TOTAL_BRACKET_GAMES,
} from "@/lib/bracket";
import { LEAGUE_NAME, SEASON, deadlinePassed, deadlineLabel } from "@/lib/config";
import { LockIcon, ChevronRight } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const user = await getCurrentUser();
  const entry = user ? await getEntry(user.id) : null;
  const picks = parseEntry(entry);
  const locked = !!entry?.locked;
  const passed = deadlinePassed();

  const made = picksMade(picks);
  const picksPct = Math.round((made / TOTAL_SEASON_PICKS) * 100);
  const lockable = canLock(picks);
  const bMade = bracketMadeCount(picks);
  const bracketPct = locked && lockable ? Math.round((bMade / TOTAL_BRACKET_GAMES) * 100) : 0;
  const bracketStatus = !locked
    ? "Finish your picks first"
    : !lockable
      ? "Incomplete"
      : bMade === 0
        ? "Not started"
        : bMade === TOTAL_BRACKET_GAMES
          ? "Complete"
          : "In progress";

  const rows = await buildLeaderboard();
  const topThree = rows.slice(0, 3);

  return (
    <div>
      <h4 style={{ margin: "0 0 2px" }}>Hey {user?.displayName}</h4>
      <p style={{ opacity: 0.6, fontSize: 13, margin: "0 0 16px" }}>
        {LEAGUE_NAME} · {SEASON} Season
      </p>

      {/* Deadline card */}
      <div
        className="card elev-sm"
        style={{ padding: 14, marginBottom: 16, flexDirection: "row", gap: 10, alignItems: "flex-start" }}
      >
        <span style={{ color: "var(--color-accent)", flex: "none", marginTop: 1 }}>
          <LockIcon size={16} />
        </span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>
            {passed ? "Picks are closed" : "Picks lock before kickoff"}
          </div>
          <div style={{ fontSize: 12, opacity: 0.6 }}>
            {passed
              ? "Division and wildcard picks are final."
              : `Division & wildcard picks lock ${deadlineLabel()}.`}
          </div>
        </div>
      </div>

      {/* Division & wildcards progress */}
      <Link href="/picks" style={{ textDecoration: "none", color: "inherit" }}>
        <div className="card elev-sm" style={{ padding: 16, marginBottom: 12 }}>
          <div className="card-kicker">Division winners &amp; wildcards</div>
          <div className="card-title" style={{ fontSize: 18 }}>
            {made} / {TOTAL_SEASON_PICKS} picked
          </div>
          <Progress pct={picksPct} />
        </div>
      </Link>

      {/* Bracket progress */}
      <Link href="/bracket" style={{ textDecoration: "none", color: "inherit" }}>
        <div className="card elev-sm" style={{ padding: 16, marginBottom: 12 }}>
          <div className="card-kicker">Playoff bracket</div>
          <div className="card-title" style={{ fontSize: 18 }}>
            {bracketStatus}
          </div>
          <Progress pct={bracketPct} />
        </div>
      </Link>

      {/* Weekly picks link */}
      <Link href="/weekly" style={{ textDecoration: "none", color: "inherit" }}>
        <div className="card elev-sm" style={{ padding: 16, marginBottom: 12 }}>
          <div className="card-kicker">Weekly picks</div>
          <div className="card-title" style={{ fontSize: 18 }}>
            Pick this week&apos;s winners
          </div>
        </div>
      </Link>

      {/* Leaderboard preview */}
      <Link href="/league" style={{ textDecoration: "none", color: "inherit" }}>
        <div className="card elev-sm" style={{ padding: 16 }}>
          <div className="card-kicker">{LEAGUE_NAME}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {topThree.length === 0 && (
              <div style={{ fontSize: 13, opacity: 0.5 }}>No standings yet.</div>
            )}
            {topThree.map((m) => (
              <div key={m.userId} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <span style={{ width: 16, opacity: 0.5 }}>{m.rank}</span>
                <span style={{ flex: 1 }}>{m.name}</span>
                <span style={{ opacity: 0.7 }}>{m.points} pts</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 10, color: "var(--color-accent)", fontSize: 12 }}>
            View standings
            <ChevronRight size={12} />
          </div>
        </div>
      </Link>
    </div>
  );
}

function Progress({ pct }: { pct: number }) {
  return (
    <div
      style={{
        height: 6,
        background: "var(--color-neutral-800)",
        borderRadius: 4,
        overflow: "hidden",
        marginTop: 10,
      }}
    >
      <div style={{ height: "100%", background: "var(--color-accent)", width: `${pct}%` }} />
    </div>
  );
}
