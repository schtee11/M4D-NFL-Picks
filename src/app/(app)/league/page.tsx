import { getCurrentUser } from "@/lib/auth";
import { buildLeaderboard } from "@/lib/leaderboard";
import { LEAGUE_NAME, SEASON } from "@/lib/config";
import { TrophyIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function LeaguePage() {
  const [user, rows] = await Promise.all([getCurrentUser(), buildLeaderboard()]);
  const meId = user?.id;
  const memberCount = rows.length;

  return (
    <div className="narrow">
      <h4 style={{ margin: "0 0 2px" }}>{LEAGUE_NAME}</h4>
      <p style={{ opacity: 0.6, fontSize: 13, margin: "0 0 14px" }}>
        {SEASON} season standings · {memberCount} member{memberCount === 1 ? "" : "s"}
      </p>

      {rows.length === 0 && (
        <div className="card elev-sm" style={{ padding: 18, textAlign: "center" }}>
          <div style={{ fontSize: 13, opacity: 0.7 }}>No members yet.</div>
        </div>
      )}

      {rows.map((m) => {
        const isYou = m.userId === meId;
        const isLeader = m.rank === 1 && m.points > 0;
        return (
          <div
            key={m.userId}
            className="card elev-sm"
            style={{
              padding: "12px 14px",
              marginBottom: 8,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              borderColor: isYou ? "var(--color-accent)" : undefined,
            }}
          >
            <span style={{ width: 18, fontSize: 13, opacity: 0.5, flex: "none" }}>{m.rank}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
                <span>{m.name}</span>
                {isYou && <span style={{ fontSize: 11, opacity: 0.5 }}>(you)</span>}
                {isLeader && (
                  <span style={{ color: "var(--color-accent)" }}>
                    <TrophyIcon size={13} />
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, opacity: 0.55 }}>{m.pickStatus}</div>
            </div>
            <span style={{ fontSize: 13, opacity: 0.8, flex: "none" }}>{m.points} pts</span>
          </div>
        );
      })}

      <p style={{ opacity: 0.4, fontSize: 11, textAlign: "center", marginTop: 12 }}>
        Points are awarded as results come in through the playoffs.
      </p>
    </div>
  );
}
