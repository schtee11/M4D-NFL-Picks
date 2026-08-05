"use client";

import { useEffect, useState, useCallback } from "react";
import { teamName } from "@/lib/teams";
import { TeamLogo } from "@/components/TeamLogo";
import { CheckIcon, LockIcon } from "@/components/icons";

interface GameVM {
  id: string;
  date: string;
  state: "pre" | "in" | "post";
  statusDetail: string;
  home: { abbr: string; score: number | null };
  away: { abbr: string; score: number | null };
  winner: string | null;
  locked: boolean;
  picked: string | null;
}

export default function WeeklyScreen() {
  const [week, setWeek] = useState(1);
  const [games, setGames] = useState<GameVM[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback((w: number) => {
    setLoading(true);
    fetch(`/api/weekly?week=${w}`)
      .then((r) => r.json())
      .then((d) => setGames(d.games || []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load(week);
  }, [week, load]);

  async function pick(gameId: string, team: string) {
    setGames((gs) => gs.map((g) => (g.id === gameId ? { ...g, picked: team } : g)));
    setSaving(true);
    await fetch("/api/weekly", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ week, picks: { [gameId]: team } }),
    }).catch(() => {});
    setSaving(false);
  }

  const made = games.filter((g) => g.picked).length;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
        <h4 style={{ margin: 0 }}>Weekly picks</h4>
        <span style={{ fontSize: 12, opacity: 0.6 }}>
          {made}/{games.length || "—"} picked
        </span>
      </div>
      <p style={{ opacity: 0.6, fontSize: 13, margin: "0 0 14px" }}>
        Pick each game&apos;s winner. Games lock at kickoff.
      </p>

      {/* Week selector */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={week <= 1}
          onClick={() => setWeek((w) => Math.max(1, w - 1))}
        >
          ‹
        </button>
        <div style={{ flex: 1, textAlign: "center", fontSize: 14, fontWeight: 500 }}>Week {week}</div>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={week >= 18}
          onClick={() => setWeek((w) => Math.min(18, w + 1))}
        >
          ›
        </button>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
          <div className="spin" />
        </div>
      ) : games.length === 0 ? (
        <div className="card elev-sm" style={{ padding: 18, textAlign: "center" }}>
          <div style={{ fontSize: 13, opacity: 0.7 }}>
            No games available for Week {week} yet. Check back when the schedule is posted.
          </div>
        </div>
      ) : (
        games.map((g) => <GameCard key={g.id} g={g} onPick={pick} />)
      )}

      <div style={{ height: 18, marginTop: 6, textAlign: "center" }}>
        {saving && <span style={{ fontSize: 11, opacity: 0.5 }}>Saving…</span>}
      </div>
    </div>
  );
}

function GameCard({ g, onPick }: { g: GameVM; onPick: (id: string, team: string) => void }) {
  return (
    <div className="card elev-sm" style={{ padding: 12, marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 11, opacity: 0.55 }}>{g.statusDetail || "Scheduled"}</span>
        {g.locked && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, opacity: 0.5 }}>
            <LockIcon size={12} /> Locked
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <SideBtn game={g} team={g.away.abbr} score={g.away.score} onPick={onPick} />
        <SideBtn game={g} team={g.home.abbr} score={g.home.score} onPick={onPick} home />
      </div>
    </div>
  );
}

function SideBtn({
  game,
  team,
  score,
  onPick,
  home,
}: {
  game: GameVM;
  team: string;
  score: number | null;
  onPick: (id: string, team: string) => void;
  home?: boolean;
}) {
  const selected = game.picked === team;
  const isWinner = game.state === "post" && game.winner === team;
  const correct = game.state === "post" && game.picked === team && game.winner === team;
  const wrong = game.state === "post" && game.picked === team && game.winner !== team;

  const borderColor = correct
    ? "var(--color-accent)"
    : wrong
      ? "#ff8a8a"
      : "var(--color-divider)";

  return (
    <button
      type="button"
      disabled={game.locked}
      onClick={() => onPick(game.id, team)}
      className={"sel-btn" + (selected && !game.locked ? " is-selected" : "")}
      style={{
        position: "relative",
        overflow: "hidden",
        flex: 1,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: 10,
        borderRadius: "var(--radius-sm)",
        border: `1px solid ${borderColor}`,
        background: "var(--color-bg)",
        cursor: game.locked ? "default" : "pointer",
        textAlign: "left",
        color: "var(--color-text)",
        opacity: game.state === "post" && !isWinner ? 0.55 : 1,
      }}
    >
      <span className="pick-fill" style={{ borderRadius: "var(--radius-sm)" }} />
      <span className="pick-ring" style={{ borderRadius: "var(--radius-sm)" }} />
      <TeamLogo id={team} size={22} />
      <span style={{ position: "relative", flex: 1, fontSize: 12.5 }}>
        {home ? "" : "@ "}
        {teamName(team)}
      </span>
      {score != null && (
        <span style={{ position: "relative", fontSize: 13, opacity: 0.8, fontWeight: 500 }}>{score}</span>
      )}
      {selected && (
        <span style={{ position: "relative", color: correct ? "var(--color-accent)" : "var(--color-neutral-400)" }}>
          <CheckIcon size={12} />
        </span>
      )}
    </button>
  );
}
