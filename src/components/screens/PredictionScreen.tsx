"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
  Matchup,
  getByeSeed,
  getWcMatchups,
  getDivMatchups,
  getConfMatchup,
  getSuperBowl,
  champion,
} from "@/lib/bracket";
import { TeamOption, MatchupSide } from "@/components/TeamPickButton";
import { TeamLogo } from "@/components/TeamLogo";
import { TrophyIcon, ShareIcon } from "@/components/icons";
import ShareSheet from "@/components/ShareSheet";

const kicker: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: ".06em",
  textTransform: "uppercase",
  opacity: 0.5,
};

export default function PredictionScreen() {
  const router = useRouter();
  const [picks, setPicks] = useState<SeasonPicks>(emptyPicks());
  const [locked, setLocked] = useState(false);
  const [deadlinePassed, setDeadline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [derivedTeams, setDerivedTeams] = useState<string[]>([]);
  const [fieldLocked, setFieldLocked] = useState(false);
  const [pickMode, setPickMode] = useState<"manual" | "matchups">("manual");
  const [slate, setSlate] = useState({ picked: 0, total: 0 });
  const [meta, setMeta] = useState({ name: "", league: "", season: 0 });
  const [shareOpen, setShareOpen] = useState(false);

  const applyState = useCallback((d: any) => {
    if (d.picks) setPicks(d.picks);
    setDerivedTeams(d.derivedTeams || []);
    setFieldLocked(!!d.fieldLocked);
    if (d.pickMode) setPickMode(d.pickMode === "matchups" ? "matchups" : "manual");
    if (d.slate) setSlate({ picked: d.slate.picked ?? 0, total: d.slate.total ?? 0 });
  }, []);

  useEffect(() => {
    fetch("/api/predictions")
      .then((r) => r.json())
      .then((d) => {
        setLocked(!!d.locked);
        setDeadline(!!d.deadlinePassed);
        applyState(d);
        setMeta({ name: d.displayName || "", league: d.league || "", season: d.season || 0 });
      })
      .finally(() => setLoading(false));
  }, [applyState]);

  const editable = !locked && !deadlinePassed;
  // The field is hand-editable only on the manual track. On the matchups track
  // it's derived from the game slate, so the Step 1–2 controls are always off.
  const fieldEditable = editable && pickMode === "manual";
  // Matchups track but the slate isn't fully called yet: no valid field exists.
  const slateIncomplete = pickMode === "matchups" && !fieldLocked;

  const persistPicks = useCallback(async (next: SeasonPicks) => {
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
    if (res && res.ok) {
      const d = await res.json().catch(() => null);
      if (d?.picks) applyState(d);
    }
    setSaving(false);
  }, [applyState]);

  const persistBracket = useCallback(async (next: SeasonPicks) => {
    setSaving(true);
    await fetch("/api/predictions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "saveBracket", bracketPicks: next.bracketPicks }),
    }).catch(() => {});
    setSaving(false);
  }, []);

  const changeMode = useCallback(
    async (mode: "manual" | "matchups") => {
      const confirmMsg =
        mode === "matchups"
          ? "Switch to “Call every game”? Your hand-picked division winners, wild cards, and seeds will be cleared and rebuilt from your game picks — you’ll need to call your whole slate in Matchups to complete the bracket. Your weekly pool picks are kept."
          : "Switch to “Build by hand”? You’ll pick your division winners, wild cards, and seeds yourself. Your game picks stay in the Matchups pool but won’t drive your bracket.";
      if (!window.confirm(confirmMsg)) return;
      setSaving(true);
      const res = await fetch("/api/predictions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op: "setMode", mode }),
      }).catch(() => null);
      if (res && res.ok) {
        const d = await res.json().catch(() => null);
        if (d) applyState(d);
      }
      setSaving(false);
    },
    [applyState],
  );

  function setWins(teamId: string, wins: number) {
    if (!editable) return;
    const clamped = Math.min(REGULAR_SEASON_GAMES, Math.max(0, wins));
    setPicks((s) => {
      const next = { ...s, records: { ...s.records, [teamId]: clamped } };
      persistPicks(next);
      return next;
    });
  }

  function pickDivisionWinner(divKey: string, teamId: string) {
    if (!fieldEditable) return;
    setPicks((s) => {
      const divisionPicks = { ...s.divisionPicks, [divKey]: teamId };
      const winners = new Set(Object.values(divisionPicks));
      const wildcards = {
        AFC: s.wildcards.AFC.filter((t) => !winners.has(t)),
        NFC: s.wildcards.NFC.filter((t) => !winners.has(t)),
      };
      const next = { ...s, divisionPicks, wildcards };
      persistPicks(next);
      return next;
    });
  }

  function toggleWildcard(conf: Conference, teamId: string) {
    if (!fieldEditable) return;
    setPicks((s) => {
      const cur = s.wildcards[conf];
      let nextArr: string[];
      if (cur.includes(teamId)) nextArr = cur.filter((t) => t !== teamId);
      else if (cur.length < 3) nextArr = [...cur, teamId];
      else nextArr = cur;
      const next = { ...s, wildcards: { ...s.wildcards, [conf]: nextArr } };
      persistPicks(next);
      return next;
    });
  }

  function pickBracketWinner(key: string, teamId: string) {
    if (!editable) return;
    setPicks((s) => {
      const next = { ...s, bracketPicks: { ...s.bracketPicks, [key]: teamId } };
      persistBracket(next);
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
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, margin: "0 0 2px" }}>
        <h4 style={{ margin: 0 }}>Your bracket</h4>
        {made > 0 && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShareOpen(true)}
            style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", fontSize: 12.5 }}
          >
            <ShareIcon size={15} /> Share
          </button>
        )}
      </div>
      <p style={{ opacity: 0.6, fontSize: 13, margin: "0 0 14px" }}>
        Pick your playoff field, seed it, and build the bracket — all in one place.
      </p>

      {shareOpen && (
        <ShareSheet picks={picks} name={meta.name} league={meta.league} season={meta.season} onClose={() => setShareOpen(false)} />
      )}

      {/* Track chooser — build the bracket by hand, or derive it from the slate. */}
      <TrackToggle mode={pickMode} onChange={changeMode} disabled={!editable} />

      {pickMode === "matchups" && fieldLocked && (
        <div className="card elev-sm" style={{ padding: "10px 12px", marginBottom: 16, borderColor: "var(--color-accent)" }}>
          <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>
            Your whole slate is called, so your division winners, wild cards, and seeds are set by those
            records automatically. To reshape your field, change a game in{" "}
            <Link href="/weekly" style={{ color: "var(--color-accent)" }}>
              Matchups
            </Link>
            .
          </div>
        </div>
      )}

      {slateIncomplete ? (
        <SlateProgress picked={slate.picked} total={slate.total} />
      ) : (
        <>
      {/* ── Step 1 · Division winners ─────────────────────────────────── */}
      <SectionLabel
        n={1}
        title="Division winners"
        hint={pickMode === "matchups" ? "Set from your called slate." : "Pick one winner in each division."}
      />
      {DIVISIONS.map((d) => (
        <div key={d.key} style={{ marginBottom: 16 }}>
          <div style={{ ...kicker, marginBottom: 8 }}>{d.key}</div>
          <div className="team-grid">
            {d.teams.map((id) => (
              <TeamOption
                key={id}
                id={id}
                selected={picks.divisionPicks[d.key] === id}
                disabled={!fieldEditable}
                onClick={() => pickDivisionWinner(d.key, id)}
              />
            ))}
          </div>
        </div>
      ))}

      {/* ── Step 2 · Wildcards ────────────────────────────────────────── */}
      <SectionLabel
        n={2}
        title="Wildcards"
        hint={pickMode === "matchups" ? "Set from your called slate." : "Pick 3 wildcard teams per conference."}
        top={20}
      />
      {(["AFC", "NFC"] as Conference[]).map((conf) => {
        const wv = wildcardView(conf);
        return (
          <div key={conf} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={kicker}>{conf} wildcards</span>
              <span style={{ fontSize: 12, opacity: wv.count >= 3 ? 1 : 0.6, color: wv.count >= 3 ? "var(--color-accent)" : undefined }}>
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
                    disabled={!fieldEditable || (!sel && full)}
                    dimmed={!sel && full}
                    onClick={() => toggleWildcard(conf, id)}
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      {/* ── Step 3 · Seeding (slate-primary) ──────────────────────────── */}
      {lockable && (
        <>
          <SectionLabel
            n={3}
            title="Seeding"
            hint={
              pickMode === "matchups"
                ? "Seeded from your called slate — division winners 1–4 by wins, wild cards 5–7."
                : "Set each team’s win total to seed your bracket — division winners 1–4 by wins, wild cards 5–7."
            }
            top={24}
          />
          {(["AFC", "NFC"] as Conference[]).map((conf) => (
            <div key={conf} style={{ marginBottom: 16 }}>
              <div style={{ ...kicker, marginBottom: 8 }}>{conf} seeds</div>
              {getSeeds(conf, picks).map((s) => (
                <SeedRow
                  key={s.team}
                  seed={s.seed}
                  teamId={s.team}
                  wins={projectedWins(picks, s.team)}
                  editable={editable}
                  auto={derivedTeams.includes(s.team)}
                  onChange={(w) => setWins(s.team, w)}
                />
              ))}
            </div>
          ))}
        </>
      )}

      {/* ── Step 4 · Playoff bracket (inline) ─────────────────────────── */}
      {lockable && (
        <>
          <SectionLabel n={4} title="Playoff bracket" hint="Tap a team to advance them." top={24} />
          <FullBracket picks={picks} editable={editable} onPick={pickBracketWinner} />
        </>
      )}

      {!lockable && (
        <div className="card elev-sm" style={{ padding: 18, textAlign: "center", marginTop: 20 }}>
          <div style={{ fontSize: 13, opacity: 0.7 }}>
            Finish your 8 division winners and 6 wildcards to seed and build your bracket.
          </div>
        </div>
      )}
        </>
      )}

      {/* Lock / edit CTAs */}
      <div className="cta-narrow">
        {deadlinePassed && !locked ? (
          <div className="card elev-sm" style={{ padding: "12px 14px", marginTop: 8 }}>
            <span style={{ fontSize: 13, opacity: 0.7 }}>The deadline has passed — picks can no longer be changed.</span>
          </div>
        ) : locked ? (
          <div
            className="card elev-sm"
            style={{ padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}
          >
            <span style={{ fontSize: 13, color: "var(--color-accent-300)" }}>Picks are locked in.</span>
            <button type="button" className="btn btn-ghost" onClick={doUnlock}>
              Edit picks
            </button>
          </div>
        ) : slateIncomplete ? (
          <button type="button" className="btn btn-primary btn-block" disabled style={{ marginTop: 8 }}>
            Call every game to lock · {slate.picked}/{slate.total}
          </button>
        ) : (
          <button type="button" className="btn btn-primary btn-block" disabled={!lockable} onClick={doLock} style={{ marginTop: 8 }}>
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

function SectionLabel({ n, title, hint, top = 0 }: { n: number; title: string; hint: string; top?: number }) {
  return (
    <div style={{ marginTop: top }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 2px" }}>
        <span
          style={{
            width: 20,
            height: 20,
            borderRadius: 999,
            background: "var(--color-accent)",
            color: "var(--color-bg)",
            fontSize: 11,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flex: "none",
          }}
        >
          {n}
        </span>
        <h4 style={{ margin: 0 }}>{title}</h4>
      </div>
      <p style={{ opacity: 0.6, fontSize: 13, margin: "0 0 14px", paddingLeft: 28 }}>{hint}</p>
    </div>
  );
}

// Segmented control choosing how the bracket field is built. Two exclusive
// tracks; switching is confirmed by the parent (weekly pool picks are kept).
function TrackToggle({
  mode,
  onChange,
  disabled,
}: {
  mode: "manual" | "matchups";
  onChange: (mode: "manual" | "matchups") => void;
  disabled?: boolean;
}) {
  const opts: { id: "manual" | "matchups"; label: string; sub: string }[] = [
    { id: "manual", label: "Build by hand", sub: "Pick teams & seeds" },
    { id: "matchups", label: "Call every game", sub: "Derive from your slate" },
  ];
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", gap: 8 }}>
        {opts.map((o) => {
          const active = mode === o.id;
          return (
            <button
              key={o.id}
              type="button"
              disabled={disabled || active}
              onClick={() => onChange(o.id)}
              style={{
                flex: 1,
                textAlign: "left",
                padding: "10px 12px",
                borderRadius: "var(--radius-md)",
                border: active ? "1.5px solid var(--color-accent)" : "1px solid var(--color-divider)",
                background: active ? "color-mix(in srgb, var(--color-accent) 12%, transparent)" : "var(--color-bg)",
                color: "var(--color-text)",
                cursor: disabled || active ? "default" : "pointer",
                opacity: disabled && !active ? 0.5 : 1,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                {active && <span style={{ color: "var(--color-accent)" }}>✓</span>}
                {o.label}
              </div>
              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>{o.sub}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Matchups track, slate not yet fully called: there's no valid field to show,
// so nudge the user to finish calling games.
function SlateProgress({ picked, total }: { picked: number; total: number }) {
  const pct = total > 0 ? Math.round((picked / total) * 100) : 0;
  return (
    <div className="card elev-sm" style={{ padding: 18, marginTop: 4 }}>
      <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Call every game to build your bracket</div>
      <p style={{ fontSize: 12.5, opacity: 0.7, lineHeight: 1.5, margin: "0 0 12px" }}>
        On this track your division winners, wild cards, and seeds are derived from your game picks — so your
        whole slate has to be called before the bracket exists. Pick the rest in{" "}
        <Link href="/weekly" style={{ color: "var(--color-accent)" }}>
          Matchups
        </Link>
        .
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, height: 8, borderRadius: 999, background: "var(--color-divider)", overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: "var(--color-accent)" }} />
        </div>
        <span style={{ fontSize: 12, fontVariantNumeric: "tabular-nums", opacity: 0.8, flex: "none" }}>
          {picked}/{total}
        </span>
      </div>
    </div>
  );
}

function SeedRow({
  seed,
  teamId,
  wins,
  editable,
  auto,
  onChange,
}: {
  seed: number;
  teamId: string;
  wins: number;
  editable?: boolean;
  auto?: boolean;
  onChange: (wins: number) => void;
}) {
  const losses = REGULAR_SEASON_GAMES - wins;
  return (
    <div className="card elev-sm" style={{ padding: "8px 10px", marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 26, fontSize: 12, fontWeight: 600, color: "var(--color-accent)", flex: "none" }}>#{seed}</span>
        <TeamLogo id={teamId} size={20} />
        <span style={{ flex: 1, fontSize: 13 }}>{teamName(teamId)}</span>
        <span style={{ fontSize: 12, opacity: 0.6, width: 42, textAlign: "right" }}>
          {wins}–{losses}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
        {auto ? (
          <span
            title="Set from your completed weekly slate"
            style={{ fontSize: 10.5, padding: "2px 8px", borderRadius: 999, background: "var(--color-accent)", color: "#fff" }}
          >
            ✓ Slate set from Matchups
          </span>
        ) : (
          <>
            <span style={{ fontSize: 11, opacity: 0.5 }}>Win total</span>
            <div style={{ display: "flex", alignItems: "center", gap: 4, flex: "none" }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!editable || wins <= 0}
                onClick={() => onChange(wins - 1)}
                style={{ padding: "2px 9px", minWidth: 30 }}
                aria-label={`Fewer wins for ${teamName(teamId)}`}
              >
                −
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!editable || wins >= REGULAR_SEASON_GAMES}
                onClick={() => onChange(wins + 1)}
                style={{ padding: "2px 9px", minWidth: 30 }}
                aria-label={`More wins for ${teamName(teamId)}`}
              >
                +
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Playoff bracket rendering (ported from the standalone bracket screen) ─────
function FullBracket({
  picks,
  editable,
  onPick,
}: {
  picks: SeasonPicks;
  editable: boolean;
  onPick: (key: string, team: string) => void;
}) {
  const sb = getSuperBowl(picks);
  const champ = champion(picks);
  return (
    <div>
      <div className="bracket-cols">
        {(["AFC", "NFC"] as Conference[]).map((conf) => (
          <ConferenceColumn key={conf} conf={conf} picks={picks} editable={editable} onPick={onPick} />
        ))}
      </div>

      <div className="sb-wrap">
        {sb && (
          <>
            <div style={{ ...kicker, margin: "20px 0 8px", textAlign: "center" }}>Super Bowl</div>
            <div className="card elev-md" style={{ padding: 16, marginBottom: 8 }}>
              <div style={{ display: "flex", gap: 10 }}>
                <SBSide label="AFC Champion" id={sb.teamA} selected={sb.winner === sb.teamA} onClick={() => editable && onPick("SB", sb.teamA)} />
                <div style={{ alignSelf: "center", fontSize: 11, opacity: 0.4 }}>VS</div>
                <SBSide label="NFC Champion" id={sb.teamB} selected={sb.winner === sb.teamB} onClick={() => editable && onPick("SB", sb.teamB)} />
              </div>
            </div>
          </>
        )}

        {champ && (
          <div className="card elev-md" style={{ padding: 20, marginTop: 12, textAlign: "center", borderColor: "var(--color-accent)" }}>
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
    </div>
  );
}

function ConferenceColumn({
  conf,
  picks,
  editable,
  onPick,
}: {
  conf: Conference;
  picks: SeasonPicks;
  editable: boolean;
  onPick: (key: string, team: string) => void;
}) {
  const bye = getByeSeed(conf, picks)!;
  const wc = getWcMatchups(conf, picks);
  const div = getDivMatchups(conf, picks);
  const cm = getConfMatchup(conf, picks);

  return (
    <div>
      <div style={{ ...kicker, margin: "0 0 8px" }}>{conf} · Wild Card</div>
      <div className="card elev-sm" style={{ padding: 12, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <TeamLogo id={bye.team} size={22} />
        <span style={{ flex: 1, fontSize: 13 }}>No. 1 {teamName(bye.team)}</span>
        <span className="tag tag-neutral" style={{ fontSize: 10 }}>Bye</span>
      </div>
      {wc.map((m) => (
        <MatchCard key={m.key} m={m} editable={editable} onPick={onPick} />
      ))}

      {div && (
        <>
          <div style={{ ...kicker, margin: "16px 0 8px" }}>{conf} · Divisional</div>
          {div.map((m) => (
            <MatchCard key={m.key} m={m} editable={editable} onPick={onPick} />
          ))}
        </>
      )}

      {cm && (
        <>
          <div style={{ ...kicker, margin: "16px 0 8px" }}>{conf} Championship</div>
          <MatchCard m={cm} editable={editable} onPick={onPick} />
        </>
      )}
    </div>
  );
}

function MatchCard({ m, editable, onPick }: { m: Matchup; editable: boolean; onPick: (key: string, team: string) => void }) {
  return (
    <div className="card elev-sm" style={{ padding: 10, marginBottom: 8, flexDirection: "row", gap: 8 }}>
      <MatchupSide id={m.teamA} seed={m.seedA} selected={m.winner === m.teamA} onClick={() => editable && onPick(m.key, m.teamA)} />
      <MatchupSide id={m.teamB} seed={m.seedB} selected={m.winner === m.teamB} onClick={() => editable && onPick(m.key, m.teamB)} />
    </div>
  );
}

function SBSide({ label, id, selected, onClick }: { label: string; id: string; selected: boolean; onClick: () => void }) {
  return (
    <div style={{ flex: 1, textAlign: "center" }}>
      <div style={{ fontSize: 10, opacity: 0.5, marginBottom: 6, textTransform: "uppercase", letterSpacing: ".06em" }}>{label}</div>
      <button
        type="button"
        onClick={onClick}
        className={"sel-btn" + (selected ? " is-selected" : "")}
        style={{
          position: "relative",
          overflow: "hidden",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          padding: "14px 8px",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--color-divider)",
          background: "var(--color-bg)",
          cursor: "pointer",
          color: "var(--color-text)",
        }}
      >
        <span className="pick-fill" />
        <span className="pick-ring" />
        <TeamLogo id={id} size={40} />
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
