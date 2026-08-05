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
  odds: { details?: string; overUnder?: number } | null;
  restHome: number | null;
  restAway: number | null;
  locked: boolean;
  picked: string | null;
}

type Mode = "team" | "week";

const TEAM_IDS = Object.keys(TEAMS);

// "Sun, Sep 14 · 1:05 PM" in the viewer's local time.
function fmtKick(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const day = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day} · ${time}`;
}

// "BUF -3.5 · O/U 48.5" when a line exists, else null.
function fmtLine(odds: GameVM["odds"]): string | null {
  if (!odds) return null;
  const parts: string[] = [];
  if (odds.details) parts.push(odds.details);
  if (odds.overUnder != null) parts.push(`O/U ${odds.overUnder}`);
  return parts.length ? parts.join(" · ") : null;
}

// Kickoff before the game; live/final status once it's underway. Shown in the
// top-right of every game card (both views), so the card body stays compact.
function fmtStatus(g: GameVM): string {
  if (g.state !== "pre" && g.statusDetail) return g.statusDetail;
  return fmtKick(g.date) || g.statusDetail || "Scheduled";
}

// "Rest BUF 7d · CIN 10d" — days of rest for both teams, or null when unknown.
function fmtRest(g: GameVM): string | null {
  if (g.restAway == null && g.restHome == null) return null;
  const a = g.restAway != null ? `${g.restAway}d` : "—";
  const h = g.restHome != null ? `${g.restHome}d` : "—";
  return `Rest ${g.away.abbr} ${a} · ${g.home.abbr} ${h}`;
}

// Supporting data for a game card, in display-precedence order:
// kickoff/status, then betting line, then rest. Cards drop these into the four
// corners (upper-left → upper-right → lower-left → lower-right) after any
// primary label. Missing values are omitted so corners fill without gaps.
function supportData(g: GameVM): string[] {
  return [fmtStatus(g), fmtLine(g.odds), fmtRest(g)].filter((x): x is string => Boolean(x));
}

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

  const winState: SegState = settled ? (actualWin ? "correct" : pickedWin ? "wrong" : "") : pickedWin ? "on" : "";
  const lossState: SegState = settled ? (!actualWin ? "correct" : pickedLoss ? "wrong" : "") : pickedLoss ? "on" : "";

  return (
    <GameShell
      primary={
        <>
          <span style={{ opacity: 0.5 }}>Wk {g.week}</span>{" "}
          <span style={{ opacity: 0.9 }}>
            {isHome ? "vs" : "@"} {teamName(opp)}
          </span>
        </>
      }
      data={supportData(g)}
      locked={g.locked}
    >
      <div className="wl-toggle" role="group" aria-label={`Pick win or loss for ${teamName(team)}`}>
        <Seg state={winState} disabled={g.locked} pressed={pickedWin} onClick={() => onPick(g.id, team, g.week)}>
          Win {check(winState)}
        </Seg>
        <Seg state={lossState} disabled={g.locked} pressed={pickedLoss} onClick={() => onPick(g.id, opp, g.week)}>
          Loss {check(lossState)}
        </Seg>
      </div>
    </GameShell>
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
    <GameShell data={supportData(g)} locked={g.locked}>
      <div className="wl-toggle" role="group" aria-label="Pick the winner">
        <TeamSeg g={g} team={g.away.abbr} score={g.away.score} onPick={onPick} away />
        <TeamSeg g={g} team={g.home.abbr} score={g.home.score} onPick={onPick} />
      </div>
    </GameShell>
  );
}

// One side of the week-view winner picker — a segment carrying the team's
// logo, name and (live/final) score. Grading mirrors the team view.
function TeamSeg({
  g,
  team,
  score,
  onPick,
  away,
}: {
  g: GameVM;
  team: string;
  score: number | null;
  onPick: (id: string, team: string) => void;
  away?: boolean;
}) {
  const selected = g.picked === team;
  const settled = g.state === "post" && g.winner != null;
  const state: SegState = settled ? (g.winner === team ? "correct" : selected ? "wrong" : "") : selected ? "on" : "";

  return (
    <Seg state={state} disabled={g.locked} pressed={selected} onClick={() => onPick(g.id, team)} ariaLabel={teamName(team)}>
      <TeamLogo id={team} size={18} />
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {away ? "@ " : ""}
        {teamName(team)}
      </span>
      {g.state !== "pre" && score != null && <span style={{ fontWeight: 600 }}>{score}</span>}
      {check(state)}
    </Seg>
  );
}

// ── Shared compact game-card primitives (used by both views) ─────────────────
type SegState = "" | "on" | "correct" | "wrong";

// Card frame with a fixed data precedence: a bright primary label (when given)
// takes the upper-left, then the supporting values fill the remaining corners
// in order — upper-left → upper-right → lower-left → lower-right. The picker
// sits between the header and footer rows.
function GameShell({
  primary,
  data,
  locked,
  children,
}: {
  primary?: React.ReactNode;
  data: string[];
  locked?: boolean;
  children: React.ReactNode;
}) {
  const slots: React.ReactNode[] = primary != null ? [primary, ...data] : [...data];
  const [ul, ur, ll, lr] = slots;
  const dim: React.CSSProperties = { fontSize: 11, opacity: 0.55 };
  const ellipsis: React.CSSProperties = { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };

  return (
    <div className="card elev-sm" style={{ padding: "9px 11px", gap: 7, marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 15 }}>
        <span style={{ flex: 1, ...ellipsis, ...(primary != null ? { fontSize: 12, fontWeight: 500 } : dim) }}>{ul}</span>
        {(ur != null || locked) && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, flex: "none", whiteSpace: "nowrap", ...dim }}>
            {ur != null && <span>{ur}</span>}
            {locked && <LockIcon size={12} />}
          </span>
        )}
      </div>
      {children}
      {(ll != null || lr != null) && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, ...dim }}>
          <span style={{ flex: 1, ...ellipsis }}>{ll}</span>
          {lr != null && <span style={{ flex: "none", whiteSpace: "nowrap" }}>{lr}</span>}
        </div>
      )}
    </div>
  );
}

// A single segment of a two-way picker pill.
function Seg({
  state,
  disabled,
  pressed,
  onClick,
  ariaLabel,
  children,
}: {
  state: SegState;
  disabled?: boolean;
  pressed?: boolean;
  onClick: () => void;
  ariaLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={pressed}
      aria-label={ariaLabel}
      className={"wl-seg" + (state ? " is-" + state : "")}
    >
      {children}
    </button>
  );
}

// The check that marks the active pick (pre-game) or the correct side (final).
function check(state: SegState) {
  return state === "on" || state === "correct" ? <CheckIcon size={12} /> : null;
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
