"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { DIVISIONS, Conference, divisionsFor } from "@/lib/teams";
import {
  SeasonPicks,
  emptyPicks,
  canLock,
  picksMade,
  TOTAL_SEASON_PICKS,
} from "@/lib/bracket";
import { TeamOption } from "@/components/TeamPickButton";

export default function PicksScreen() {
  const router = useRouter();
  const [picks, setPicks] = useState<SeasonPicks>(emptyPicks());
  const [locked, setLocked] = useState(false);
  const [deadlinePassed, setDeadline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/predictions")
      .then((r) => r.json())
      .then((d) => {
        if (d.picks) setPicks(d.picks);
        setLocked(!!d.locked);
        setDeadline(!!d.deadlinePassed);
      })
      .finally(() => setLoading(false));
  }, []);

  const frozen = locked || deadlinePassed;

  const persist = useCallback(async (next: SeasonPicks) => {
    setSaving(true);
    await fetch("/api/predictions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        op: "savePicks",
        divisionPicks: next.divisionPicks,
        wildcards: next.wildcards,
      }),
    }).catch(() => {});
    setSaving(false);
  }, []);

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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
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

      {/* Lock / edit CTAs */}
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

      <div style={{ height: 18, marginTop: 6, textAlign: "center" }}>
        {saving && <span style={{ fontSize: 11, opacity: 0.5 }}>Saving…</span>}
      </div>
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
