"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { TEAMS, teamName } from "@/lib/teams";
import { TeamLogo } from "@/components/TeamLogo";
import { CheckIcon, LockIcon } from "@/components/icons";

interface GameVM {
  id: string;
  week: number;
  date: string;
  state: "pre" | "in" | "post";
  statusDetail: string;
  home: { abbr: string; score: number | null };
  away: { abbr: string; score: number | null };
  winner: string | null;
  locked: boolean;
  picked: string | null;
}

type Mode = "team" | "week";

const TEAM_IDS = Object.keys(TEAMS);

export default function WeeklyScreen() {
  const [mode, setMode] = useState<Mode>("team");
  const [team, setTeam] = useState<string>("BUF");
  const [week, setWeek] = useState(1);

  // Deep link from the seeding step (/weekly?team=KC) preselects that team.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("team");
    if (t && TEAMS[t.toUpperCase()]) {
      setMode("team");
      setTeam(t.toUpperCase());
    }
  }, []);
  const [games, setGames] = useState<GameVM[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback((m: Mode, t: string, w: number) => {
    setLoading(true);
    const qs = m === "team" ? `team=${t}` : `week=${w}`;
    fetch(`/api/weekly?${qs}`)
      .then((r) => r.json())
      .then((d) => setGames(d.games || []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load(mode, team, week);
  }, [mode, team, week, load]);

  // Optimistically apply a pick, persist it, and reconcile with the server.
  async function savePick(gameId: string, pickedTeam: string, weekOfGame: number) {
    setGames((gs) => gs.map((g) => (g.id === gameId ? { ...g, picked: pickedTeam } : g)));
    setSaving(true);
    await fetch("/api/weekly", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ week: mode === "week" ? week : undefined, picks: { [gameId]: pickedTeam } }),
    }).catch(() => {});
    setSaving(false);
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
        <h4 style={{ margin: 0 }}>Matchups</h4>
        <ModeToggle mode={mode} onChange={setMode} />
      </div>
      <p style={{ opacity: 0.6, fontSize: 13, margin: "0 0 10px" }}>
        {mode === "team"
          ? "Call every game on a team’s schedule. A completed slate sets that team’s record and seeds them in your bracket automatically."
          : "Pick each game’s winner. Games lock at kickoff."}
      </p>

      {/* Escape hatch for anyone who doesn't want to call every game. */}
      <div className="card elev-sm" style={{ padding: "9px 12px", marginBottom: 14, fontSize: 12.5, opacity: 0.85 }}>
        Don’t want to pick every game?{" "}
        <Link href="/picks" style={{ color: "var(--color-accent)", textDecoration: "none" }}>
          Head to the Bracket tab
        </Link>{" "}
        and set win totals by hand.
      </div>

      {mode === "team" ? (
        <TeamMode
          team={team}
          onTeam={setTeam}
          games={games}
          loading={loading}
          onPick={savePick}
        />
      ) : (
        <WeekMode
          week={week}
          onWeek={setWeek}
          games={games}
          loading={loading}
          onPick={(id, t) => savePick(id, t, week)}
        />
      )}

      <div style={{ height: 18, marginTop: 6, textAlign: "center" }}>
        {saving && <span style={{ fontSize: 11, opacity: 0.5 }}>Saving…</span>}
      </div>
    </div>
  );
}

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div style={{ display: "inline-flex", gap: 2, padding: 2, borderRadius: "var(--radius-sm)", background: "var(--color-bg)", border: "1px solid var(--color-divider)" }}>
      {(["team", "week"] as Mode[]).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className="btn"
          style={{
            padding: "3px 10px",
            fontSize: 12,
            borderRadius: "calc(var(--radius-sm) - 2px)",
            background: mode === m ? "var(--color-accent)" : "transparent",
            color: mode === m ? "#fff" : "var(--color-text)",
            border: "none",
          }}
        >
          {m === "team" ? "By team" : "By week"}
        </button>
      ))}
    </div>
  );
}

// ── Team mode: pick W/L across a whole team's schedule ───────────────────────
function TeamMode({
  team,
  onTeam,
  games,
  loading,
  onPick,
}: {
  team: string;
  onTeam: (t: string) => void;
  games: GameVM[];
  loading: boolean;
  onPick: (gameId: string, pickedTeam: string, week: number) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const nudge = (dir: number) => scrollerRef.current?.scrollBy({ left: dir * 220, behavior: "smooth" });

  const decided = games.filter((g) => g.picked);
  const wins = decided.filter((g) => g.picked === team).length;
  const losses = decided.length - wins;
  const complete = games.length > 0 && decided.length === games.length;

  return (
    <div>
      {/* Team selector — scroll the strip with the arrows or by swiping */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 12 }}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => nudge(-1)}
          aria-label="Scroll teams left"
          style={{ flex: "none", padding: "6px 8px" }}
        >
          ‹
        </button>
        <div ref={scrollerRef} className="team-scroller" style={{ display: "flex", gap: 6, overflowX: "auto", flex: 1, paddingBottom: 6, scrollSnapType: "x proximity" }}>
          {TEAM_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onTeam(id)}
              aria-label={teamName(id)}
              className="btn"
              style={{
                flex: "none",
                scrollSnapAlign: "start",
                padding: 5,
                borderRadius: "var(--radius-sm)",
                border: `1px solid ${id === team ? "var(--color-accent)" : "var(--color-divider)"}`,
                background: id === team ? "var(--color-accent-100, rgba(0,0,0,0.04))" : "var(--color-bg)",
                opacity: id === team ? 1 : 0.6,
              }}
            >
              <TeamLogo id={id} size={26} />
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => nudge(1)}
          aria-label="Scroll teams right"
          style={{ flex: "none", padding: "6px 8px" }}
        >
          ›
        </button>
      </div>

      {/* Selected team header + running record */}
      <div className="card elev-sm" style={{ padding: "10px 12px", marginBottom: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <TeamLogo id={team} size={28} />
        <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{teamName(team)}</span>
        <span style={{ fontSize: 13, opacity: 0.8 }}>
          {wins}–{losses}
        </span>
        <span
          style={{
            fontSize: 11,
            padding: "2px 8px",
            borderRadius: 999,
            background: complete ? "var(--color-accent)" : "var(--color-divider)",
            color: complete ? "#fff" : "var(--color-text)",
          }}
        >
          {complete ? "Slate set" : `${decided.length}/${games.length || "—"}`}
        </span>
      </div>

      {loading ? (
        <Spinner />
      ) : games.length === 0 ? (
        <EmptyState label={`No schedule available for ${teamName(team)} yet.`} />
      ) : (
        <div className="games-grid">
          {games.map((g) => (
            <TeamGameCard key={g.id} g={g} team={team} onPick={onPick} />
          ))}
        </div>
      )}
    </div>
  );
}

function TeamGameCard({
  g,
  team,
  onPick,
}: {
  g: GameVM;
  team: string;
  onPick: (gameId: string, pickedTeam: string, week: number) => void;
}) {
  const isHome = g.home.abbr === team;
  const opp = isHome ? g.away.abbr : g.home.abbr;
  const pickedWin = g.picked === team;
  const pickedLoss = g.picked != null && g.picked === opp;
  const settled = g.state === "post" && g.winner != null;
  const actualWin = settled && g.winner === team;

  return (
    <div className="card elev-sm" style={{ padding: 12, marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 11, opacity: 0.55 }}>
          Week {g.week} · {isHome ? "vs" : "@"} {teamName(opp)}
        </span>
        {g.locked && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, opacity: 0.5 }}>
            <LockIcon size={12} /> Locked
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <WLButton
          label="Win"
          selected={pickedWin}
          disabled={g.locked}
          result={settled ? (actualWin ? "correct" : pickedWin ? "wrong" : null) : null}
          onClick={() => onPick(g.id, team, g.week)}
        />
        <WLButton
          label="Loss"
          selected={pickedLoss}
          disabled={g.locked}
          result={settled ? (!actualWin ? "correct" : pickedLoss ? "wrong" : null) : null}
          onClick={() => onPick(g.id, opp, g.week)}
        />
      </div>
    </div>
  );
}

function WLButton({
  label,
  selected,
  disabled,
  result,
  onClick,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  result: "correct" | "wrong" | null;
  onClick: () => void;
}) {
  const borderColor =
    result === "correct" ? "var(--color-accent)" : result === "wrong" ? "#ff8a8a" : "var(--color-divider)";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={"sel-btn" + (selected && !disabled ? " is-selected" : "")}
      style={{
        position: "relative",
        overflow: "hidden",
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        padding: 10,
        borderRadius: "var(--radius-sm)",
        border: `1px solid ${borderColor}`,
        background: "var(--color-bg)",
        cursor: disabled ? "default" : "pointer",
        color: "var(--color-text)",
        fontSize: 13,
        fontWeight: 500,
      }}
    >
      <span className="pick-fill" style={{ borderRadius: "var(--radius-sm)" }} />
      <span className="pick-ring" style={{ borderRadius: "var(--radius-sm)" }} />
      <span style={{ position: "relative" }}>{label}</span>
      {selected && (
        <span style={{ position: "relative", color: result === "correct" ? "var(--color-accent)" : "var(--color-neutral-400)" }}>
          <CheckIcon size={12} />
        </span>
      )}
    </button>
  );
}

// ── Week mode: the original game-by-game view ────────────────────────────────
function WeekMode({
  week,
  onWeek,
  games,
  loading,
  onPick,
}: {
  week: number;
  onWeek: (updater: (w: number) => number) => void;
  games: GameVM[];
  loading: boolean;
  onPick: (gameId: string, team: string) => void;
}) {
  const made = games.filter((g) => g.picked).length;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <button type="button" className="btn btn-secondary" disabled={week <= 1} onClick={() => onWeek((w) => Math.max(1, w - 1))}>
          ‹
        </button>
        <div style={{ flex: 1, textAlign: "center", fontSize: 14, fontWeight: 500 }}>
          Week {week} · {made}/{games.length || "—"} picked
        </div>
        <button type="button" className="btn btn-secondary" disabled={week >= 18} onClick={() => onWeek((w) => Math.min(18, w + 1))}>
          ›
        </button>
      </div>

      {loading ? (
        <Spinner />
      ) : games.length === 0 ? (
        <EmptyState label={`No games available for Week ${week} yet. Check back when the schedule is posted.`} />
      ) : (
        <div className="games-grid">
          {games.map((g) => (
            <GameCard key={g.id} g={g} onPick={onPick} />
          ))}
        </div>
      )}
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

  const borderColor = correct ? "var(--color-accent)" : wrong ? "#ff8a8a" : "var(--color-divider)";

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
      {score != null && <span style={{ position: "relative", fontSize: 13, opacity: 0.8, fontWeight: 500 }}>{score}</span>}
      {selected && (
        <span style={{ position: "relative", color: correct ? "var(--color-accent)" : "var(--color-neutral-400)" }}>
          <CheckIcon size={12} />
        </span>
      )}
    </button>
  );
}

function Spinner() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
      <div className="spin" />
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="card elev-sm" style={{ padding: 18, textAlign: "center" }}>
      <div style={{ fontSize: 13, opacity: 0.7 }}>{label}</div>
    </div>
  );
}
