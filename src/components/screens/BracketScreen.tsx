"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Conference, teamName, teamColor } from "@/lib/teams";
import {
  SeasonPicks,
  emptyPicks,
  canLock,
  Matchup,
  getByeSeed,
  getWcMatchups,
  getDivMatchups,
  getConfMatchup,
  getSuperBowl,
  champion,
} from "@/lib/bracket";
import { MatchupSide } from "@/components/TeamPickButton";
import { TrophyIcon } from "@/components/icons";

const kicker: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: ".06em",
  textTransform: "uppercase",
  opacity: 0.5,
};

export default function BracketScreen() {
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

  const persist = useCallback(async (next: SeasonPicks) => {
    setSaving(true);
    await fetch("/api/predictions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "saveBracket", bracketPicks: next.bracketPicks }),
    }).catch(() => {});
    setSaving(false);
  }, []);

  const lockable = canLock(picks);
  const editable = locked && lockable && !deadlinePassed;

  function pickWinner(key: string, teamId: string) {
    if (!editable) return;
    setPicks((s) => {
      const next = { ...s, bracketPicks: { ...s.bracketPicks, [key]: teamId } };
      persist(next);
      return next;
    });
  }

  if (loading) return <Loading />;

  // States mirroring the prototype.
  const showFull = lockable && locked;
  const showLockedGate = !locked;
  const showIncomplete = locked && !lockable;

  return (
    <div>
      <h4 style={{ margin: "0 0 2px" }}>Playoff bracket</h4>
      <p style={{ opacity: 0.6, fontSize: 13, margin: "0 0 14px" }}>
        Tap a team to advance them.
      </p>

      {showFull && <FullBracket picks={picks} onPick={pickWinner} />}

      {showLockedGate && (
        <div className="card elev-sm" style={{ padding: 20, textAlign: "center" }}>
          <div style={{ fontSize: 14, marginBottom: 12 }}>
            Finish your division and wildcard picks to build your bracket.
          </div>
          <Link href="/picks" className="btn btn-secondary">
            Go to picks
          </Link>
        </div>
      )}

      {showIncomplete && (
        <div className="card elev-sm" style={{ padding: 20, textAlign: "center" }}>
          <div style={{ fontSize: 14 }}>
            Picks were incomplete when the deadline passed — no bracket this season.
          </div>
        </div>
      )}

      <div style={{ height: 18, marginTop: 6, textAlign: "center" }}>
        {saving && <span style={{ fontSize: 11, opacity: 0.5 }}>Saving…</span>}
      </div>
    </div>
  );
}

function FullBracket({
  picks,
  onPick,
}: {
  picks: SeasonPicks;
  onPick: (key: string, team: string) => void;
}) {
  const sb = getSuperBowl(picks);
  const champ = champion(picks);
  return (
    <div>
      {(["AFC", "NFC"] as Conference[]).map((conf, ci) => (
        <ConferenceColumn key={conf} conf={conf} picks={picks} onPick={onPick} topGap={ci === 1} />
      ))}

      {sb && (
        <>
          <div style={{ ...kicker, margin: "20px 0 8px", textAlign: "center" }}>Super Bowl</div>
          <div className="card elev-md" style={{ padding: 16, marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 10 }}>
              <SBSide label="AFC Champion" id={sb.teamA} selected={sb.winner === sb.teamA} onClick={() => onPick("SB", sb.teamA)} />
              <div style={{ alignSelf: "center", fontSize: 11, opacity: 0.4 }}>VS</div>
              <SBSide label="NFC Champion" id={sb.teamB} selected={sb.winner === sb.teamB} onClick={() => onPick("SB", sb.teamB)} />
            </div>
          </div>
        </>
      )}

      {champ && (
        <div
          className="card elev-md"
          style={{ padding: 20, marginTop: 12, textAlign: "center", borderColor: "var(--color-accent)" }}
        >
          <div style={{ color: "var(--color-accent)", marginBottom: 8, display: "flex", justifyContent: "center" }}>
            <TrophyIcon size={26} style={{ strokeWidth: 1.7 }} />
          </div>
          <div style={{ fontSize: 11, opacity: 0.6, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4 }}>
            Super Bowl Champion
          </div>
          <div style={{ fontSize: 20, fontWeight: 500 }}>{teamName(champ)}</div>
        </div>
      )}
    </div>
  );
}

function ConferenceColumn({
  conf,
  picks,
  onPick,
  topGap,
}: {
  conf: Conference;
  picks: SeasonPicks;
  onPick: (key: string, team: string) => void;
  topGap?: boolean;
}) {
  const bye = getByeSeed(conf, picks)!;
  const wc = getWcMatchups(conf, picks);
  const div = getDivMatchups(conf, picks);
  const cm = getConfMatchup(conf, picks);

  return (
    <div>
      <div style={{ ...kicker, margin: topGap ? "20px 0 8px" : "0 0 8px" }}>{conf} · Wild Card</div>
      <div className="card elev-sm" style={{ padding: 12, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <span className="dot" style={{ width: 9, height: 9, background: teamColor(bye.team) }} />
        <span style={{ flex: 1, fontSize: 13 }}>No. 1 {teamName(bye.team)}</span>
        <span className="tag tag-neutral" style={{ fontSize: 10 }}>Bye</span>
      </div>
      {wc.map((m) => (
        <MatchCard key={m.key} m={m} onPick={onPick} />
      ))}

      {div && (
        <>
          <div style={{ ...kicker, margin: "16px 0 8px" }}>{conf} · Divisional</div>
          {div.map((m) => (
            <MatchCard key={m.key} m={m} onPick={onPick} />
          ))}
        </>
      )}

      {cm && (
        <>
          <div style={{ ...kicker, margin: "16px 0 8px" }}>{conf} Championship</div>
          <MatchCard m={cm} onPick={onPick} />
        </>
      )}
    </div>
  );
}

function MatchCard({ m, onPick }: { m: Matchup; onPick: (key: string, team: string) => void }) {
  return (
    <div className="card elev-sm" style={{ padding: 10, marginBottom: 8, flexDirection: "row", gap: 8 }}>
      <MatchupSide id={m.teamA} seed={m.seedA} selected={m.winner === m.teamA} onClick={() => onPick(m.key, m.teamA)} />
      <MatchupSide id={m.teamB} seed={m.seedB} selected={m.winner === m.teamB} onClick={() => onPick(m.key, m.teamB)} />
    </div>
  );
}

function SBSide({
  label,
  id,
  selected,
  onClick,
}: {
  label: string;
  id: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <div style={{ flex: 1, textAlign: "center" }}>
      <div style={{ fontSize: 10, opacity: 0.5, marginBottom: 6, textTransform: "uppercase", letterSpacing: ".06em" }}>
        {label}
      </div>
      <button
        type="button"
        onClick={onClick}
        style={{
          position: "relative",
          overflow: "hidden",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
          padding: "12px 8px",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--color-divider)",
          background: "var(--color-bg)",
          cursor: "pointer",
          color: "var(--color-text)",
        }}
      >
        {selected && (
          <>
            <span className="pick-fill" />
            <span className="pick-ring" />
          </>
        )}
        <span className="dot" style={{ position: "relative", width: 14, height: 14, background: teamColor(id) }} />
        <span style={{ position: "relative", fontSize: 13 }}>{teamName(id)}</span>
      </button>
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
