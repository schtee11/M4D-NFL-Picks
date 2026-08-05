"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { DIVISIONS, Conference, divisionsFor, teamName } from "@/lib/teams";
import {
  SeasonPicks,
  emptyPicks,
  canLock,
  picksMade,
  getSeeds,
  projectedWins,
  REGULAR_SEASON_GAMES,
  TOTAL_SEASON_PICKS,
} from "@/lib/bracket";
import { TeamOption } from "@/components/TeamPickButton";
import { TeamLogo } from "@/components/TeamLogo";

interface Swap {
  division: string;
  promoted: string;
  demoted: string;
}

export default function PicksScreen() {
  const router = useRouter();
  const [picks, setPicks] = useState<SeasonPicks>(emptyPicks());
  const [locked, setLocked] = useState(false);
  const [deadlinePassed, setDeadline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Teams whose projected record is now driven by a completed weekly slate,
  // and any wildcard↔division-winner swaps the server applied last save.
  const [derivedTeams, setDerivedTeams] = useState<string[]>([]);
  const [swaps, setSwaps] = useState<Swap[]>([]);

  useEffect(() => {
    fetch("/api/predictions")
      .then((r) => r.json())
      .then((d) => {
        if (d.picks) setPicks(d.picks);
        setLocked(!!d.locked);
        setDeadline(!!d.deadlinePassed);
        setDerivedTeams(d.derivedTeams || []);
        setSwaps(d.swaps || []);
      })
      .finally(() => setLoading(false));
  }, []);

  const frozen = locked || deadlinePassed;

  const persist = useCallback(async (next: SeasonPicks) => {
    setSaving(true);
    const res = await fetch("/api/predictions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        op: "savePicks",
        divisionPicks: next.divisionPicks,
        wildcards: next.wildcards,
        records: next.records,
      }),
    }).catch(() => null);
    // Adopt the server's reconciled picks (weekly override + auto-swap).
    if (res && res.ok) {
      const d = await res.json().catch(() => null);
      if (d?.picks) {
        setPicks(d.picks);
        setDerivedTeams(d.derivedTeams || []);
        setSwaps(d.swaps || []);
      }
    }
    setSaving(false);
  }, []);

  function setWins(teamId: string, wins: number) {
    if (frozen) return;
    const clamped = Math.min(REGULAR_SEASON_GAMES, Math.max(0, wins));
    setPicks((s) => {
      const next = { ...s, records: { ...s.records, [teamId]: clamped } };
      persist(next);
      return next;
    });
  }

  function pickDivisionWinner(divKey: string, teamId: string) {
    if (frozen) return;
    setPicks((s) => {
      const divisionPicks = { ...s.divisionPicks, [divKey]: teamId };
      const winners = new Set(Object.values(divisionPicks));
      const wildcards = {
        AFC: s.wildcards.AFC.filter((t) => !winners.has(t)),
        NFC: s.wildcards.NFC.filter((t) => !winners.has(t)),
      };
      const next = { ...s, divisionPicks, wildcards };
      persist(next);
      return next;
    });
  }

  function toggleWildcard(conf: Conference, teamId: string) {
    if (frozen) return;
    setPicks((s) => {
      const cur = s.wildcards[conf];
      let nextArr: string[];
      if (cur.includes(teamId)) nextArr = cur.filter((t) => t !== teamId);
      else if (cur.length < 3) nextArr = [...cur, teamId];
      else nextArr = cur;
      const next = { ...s, wildcards: { ...s.wildcards, [conf]: nextArr } };
      persist(next);
      return next;
    });
  }

  async function doLock() {
    const res = await fetch("/api/predictions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "lock" }),
    });
    if (res.ok) {
      setLocked(true);
      router.refresh();
    }
  }

  async function doUnlock() {
    const res = await fetch("/api/predictions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "unlock" }),
    });
    if (res.ok) {
      setLocked(false);
      router.refresh();
    }
  }

  if (loading) return <Loading />;

  const made = picksMade(picks);
  const lockable = canLock(picks);

  const wildcardView = (conf: Conference) => {
    const divs = divisionsFor(conf);
    const winners = new Set(divs.map((d) => picks.divisionPicks[d.key]).filter(Boolean));
    const remaining = divs.flatMap((d) => d.teams).filter((id) => !winners.has(id));
    return { remaining, count: picks.wildcards[conf].length };
  };

  return (
    <div>
      <h4 style={{ margin: "0 0 2px" }}>Division winners</h4>
      <p style={{ opacity: 0.6, fontSize: 13, margin: "0 0 14px" }}>
        Pick one winner in each division.
      </p>

      {DIVISIONS.map((d) => (
        <div key={d.key} style={{ marginBottom: 16 }}>
          <div
            style={{
              fontSize: 11,
              letterSpacing: ".06em",
              textTransform: "uppercase",
              opacity: 0.5,
              marginBottom: 8,
            }}
          >
            {d.key}
          </div>
          <div className="team-grid">
            {d.teams.map((id) => (
              <TeamOption
                key={id}
                id={id}
                selected={picks.divisionPicks[d.key] === id}
                disabled={frozen}
                onClick={() => pickDivisionWinner(d.key, id)}
              />
            ))}
          </div>
        </div>
      ))}

      <h4 style={{ margin: "20px 0 2px" }}>Wildcards</h4>
      <p style={{ opacity: 0.6, fontSize: 13, margin: "0 0 14px" }}>
        Pick 3 wildcard teams per conference.
      </p>

      {(["AFC", "NFC"] as Conference[]).map((conf) => {
        const wv = wildcardView(conf);
        return (
          <div key={conf} style={{ marginBottom: 16 }}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  letterSpacing: ".06em",
                  textTransform: "uppercase",
                  opacity: 0.5,
                }}
              >
                {conf} wildcards
              </span>
              <span
                style={{
                  fontSize: 12,
                  opacity: wv.count >= 3 ? 1 : 0.6,
                  color: wv.count >= 3 ? "var(--color-accent)" : undefined,
                }}
              >
                {wv.count} / 3
              </span>
            </div>
            <div className="team-grid">
              {wv.remaining.map((id) => {
                const sel = picks.wildcards[conf].includes(id);
                const full = wv.count >= 3;
                return (
                  <TeamOption
                    key={id}
                    id={id}
                    selected={sel}
                    disabled={frozen || (!sel && full)}
                    dimmed={!sel && full}
                    onClick={() => toggleWildcard(conf, id)}
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Auto-swap notice: a wildcard out-won the division winner and took over. */}
      {swaps.length > 0 && (
        <div className="card elev-sm" style={{ padding: "10px 12px", marginTop: 16, borderColor: "var(--color-accent)" }}>
          <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>
            {swaps.map((s) => (
              <div key={s.division}>
                <strong>{teamName(s.promoted)}</strong> out-won{" "}
                <strong>{teamName(s.demoted)}</strong> in the {s.division}, so they
                swapped — {teamName(s.promoted)} is now your division winner.
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Seeding by projected record — only once all 14 teams are chosen */}
      {lockable && (
        <>
          <h4 style={{ margin: "24px 0 2px" }}>Seeding</h4>
          <p style={{ opacity: 0.6, fontSize: 13, margin: "0 0 14px" }}>
            Set each team&apos;s projected record. Division winners seed 1–4 by
            wins, wildcards 5–7 — this drives your bracket. Teams whose full
            weekly slate you&apos;ve picked are set from those picks.
          </p>
          <div className="grid-2">
            {(["AFC", "NFC"] as Conference[]).map((conf) => (
              <div key={conf}>
                <div
                  style={{
                    fontSize: 11,
                    letterSpacing: ".06em",
                    textTransform: "uppercase",
                    opacity: 0.5,
                    marginBottom: 8,
                  }}
                >
                  {conf} seeds
                </div>
                {getSeeds(conf, picks).map((s) => (
                  <SeedRow
                    key={s.team}
                    seed={s.seed}
                    teamId={s.team}
                    wins={projectedWins(picks, s.team)}
                    disabled={frozen}
                    auto={derivedTeams.includes(s.team)}
                    onChange={(w) => setWins(s.team, w)}
                  />
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Lock / edit CTAs */}
      <div className="cta-narrow">
      {deadlinePassed && !locked ? (
        <div className="card elev-sm" style={{ padding: "12px 14px", marginTop: 8 }}>
          <span style={{ fontSize: 13, opacity: 0.7 }}>
            The deadline has passed — picks can no longer be changed.
          </span>
        </div>
      ) : locked ? (
        <div
          className="card elev-sm"
          style={{
            padding: "12px 14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 8,
          }}
        >
          <span style={{ fontSize: 13, color: "var(--color-accent-300)" }}>
            Picks are locked in.
          </span>
          <button type="button" className="btn btn-ghost" onClick={doUnlock}>
            Edit picks
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={!lockable}
          onClick={doLock}
          style={{ marginTop: 8 }}
        >
          Lock in picks · {made}/{TOTAL_SEASON_PICKS}
        </button>
      )}
      </div>

      <div style={{ height: 18, marginTop: 6, textAlign: "center" }}>
        {saving && <span style={{ fontSize: 11, opacity: 0.5 }}>Saving…</span>}
      </div>
    </div>
  );
}

function SeedRow({
  seed,
  teamId,
  wins,
  disabled,
  auto,
  onChange,
}: {
  seed: number;
  teamId: string;
  wins: number;
  disabled?: boolean;
  auto?: boolean;
  onChange: (wins: number) => void;
}) {
  const losses = REGULAR_SEASON_GAMES - wins;
  return (
    <div
      className="card elev-sm"
      style={{
        padding: "8px 10px",
        marginBottom: 8,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span
        style={{
          width: 26,
          fontSize: 12,
          fontWeight: 600,
          color: "var(--color-accent)",
          flex: "none",
        }}
      >
        #{seed}
      </span>
      <TeamLogo id={teamId} size={20} />
      <span style={{ flex: 1, fontSize: 13 }}>{teamName(teamId)}</span>
      <span style={{ fontSize: 12, opacity: 0.6, width: 42, textAlign: "right" }}>
        {wins}–{losses}
      </span>
      {auto ? (
        <span
          title="Set from your completed weekly picks"
          style={{
            flex: "none",
            fontSize: 10,
            padding: "2px 8px",
            borderRadius: 999,
            background: "var(--color-accent)",
            color: "#fff",
            whiteSpace: "nowrap",
          }}
        >
          Weekly
        </span>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 4, flex: "none" }}>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={disabled || wins <= 0}
            onClick={() => onChange(wins - 1)}
            style={{ padding: "2px 9px", minWidth: 30 }}
            aria-label={`Fewer wins for ${teamName(teamId)}`}
          >
            −
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={disabled || wins >= REGULAR_SEASON_GAMES}
            onClick={() => onChange(wins + 1)}
            style={{ padding: "2px 9px", minWidth: 30 }}
            aria-label={`More wins for ${teamName(teamId)}`}
          >
            +
          </button>
        </div>
      )}
    </div>
  );
}

function Loading() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
      <div className="spin" />
    </div>
  );
}
