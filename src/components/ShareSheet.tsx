"use client";

import { useRef, useState } from "react";
import { DIVISIONS, Conference, divisionsFor, teamName } from "@/lib/teams";
import { SeasonPicks, getSeeds, getSuperBowl, champion, projectedWins } from "@/lib/bracket";
import { APP_NAME } from "@/lib/config";
import { TeamLogo } from "@/components/TeamLogo";
import { TrophyIcon, ShareIcon, CloseIcon, CheckIcon, ImageIcon } from "@/components/icons";

const kicker: React.CSSProperties = {
  fontSize: 10.5,
  letterSpacing: ".06em",
  textTransform: "uppercase",
  opacity: 0.5,
};

// Plain-text overview for the native share sheet / clipboard — reads well in a
// group chat.
function buildText(picks: SeasonPicks, name: string, league: string, season: number): string {
  const champ = champion(picks);
  const sb = getSuperBowl(picks);
  const who = name ? `${name}’s` : "My";
  const lines: string[] = [];
  lines.push(`🏈 ${APP_NAME} — ${who} bracket`);
  lines.push(`${league} · ${season}`);
  lines.push("");
  if (champ) lines.push(`🏆 Champion: ${teamName(champ)}`);
  if (sb?.teamA && sb?.teamB) lines.push(`🏟️ Super Bowl: ${teamName(sb.teamA)} vs ${teamName(sb.teamB)}`);
  if (champ || sb) lines.push("");

  lines.push("Division winners");
  for (const d of DIVISIONS) {
    const t = picks.divisionPicks[d.key];
    if (t) lines.push(`• ${d.key}: ${teamName(t)}`);
  }
  lines.push("");
  lines.push("Wildcards");
  if (picks.wildcards.AFC.length) lines.push(`• AFC: ${picks.wildcards.AFC.map(teamName).join(", ")}`);
  if (picks.wildcards.NFC.length) lines.push(`• NFC: ${picks.wildcards.NFC.map(teamName).join(", ")}`);
  return lines.join("\n");
}

export default function ShareSheet({
  picks,
  name,
  league,
  season,
  onClose,
}: {
  picks: SeasonPicks;
  name: string;
  league: string;
  season: number;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [imgMsg, setImgMsg] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const champ = champion(picks);
  const sb = getSuperBowl(picks);
  const text = buildText(picks, name, league, season);

  // Render the card to a PNG and put the image on the clipboard (so it can be
  // pasted straight into a note/chat). Falls back to downloading the PNG on
  // browsers without image clipboard support.
  async function copyImage() {
    const node = cardRef.current;
    if (!node) return;
    setBusy(true);
    setImgMsg(null);
    try {
      const { toBlob } = await import("html-to-image");
      const blob = await toBlob(node, {
        pixelRatio: 2,
        cacheBust: true,
        skipFonts: true,
        backgroundColor: "#161826",
        filter: (el) => !(el instanceof HTMLElement && el.dataset.noexport === "true"),
      });
      if (!blob) throw new Error("render failed");

      const CI = (window as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
      if (CI && navigator.clipboard && "write" in navigator.clipboard) {
        try {
          await navigator.clipboard.write([new CI({ "image/png": blob })]);
          flash("Copied");
          return;
        } catch {
          /* fall through to download */
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(name || "my").toLowerCase().replace(/\s+/g, "-")}-bracket.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      flash("Saved");
    } catch {
      flash("Failed");
    } finally {
      setBusy(false);
    }
  }

  function flash(msg: string) {
    setImgMsg(msg);
    setTimeout(() => setImgMsg(null), 1800);
  }

  async function share() {
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title: `${name ? name + "’s" : "My"} ${APP_NAME} bracket`, text });
        return;
      } catch {
        /* user cancelled or share failed — fall through to copy */
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card elev-md"
        style={{ width: "100%", maxWidth: 420, maxHeight: "88dvh", overflowY: "auto", padding: 0 }}
      >
        {/* Capture target: everything above the action bar becomes the PNG. */}
        <div ref={cardRef} style={{ background: "var(--color-bg)" }}>
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 16px",
              background: "var(--color-surface)",
              borderBottom: "1px solid var(--color-divider)",
            }}
          >
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{name ? `${name}’s bracket` : "My bracket"}</div>
              <div style={{ fontSize: 11.5, opacity: 0.55 }}>
                {league} · {season}
              </div>
            </div>
            <button type="button" data-noexport="true" onClick={onClose} className="btn btn-ghost" aria-label="Close" style={{ padding: 6 }}>
              <CloseIcon size={18} />
            </button>
          </div>

          <div style={{ padding: 16 }}>
          {/* Champion */}
          {champ && (
            <div
              className="card elev-sm"
              style={{ padding: 16, marginBottom: 12, textAlign: "center", borderColor: "var(--color-accent)" }}
            >
              <div style={{ color: "var(--color-accent)", display: "flex", justifyContent: "center", marginBottom: 6 }}>
                <TrophyIcon size={24} style={{ strokeWidth: 1.7 }} />
              </div>
              <div style={{ ...kicker, marginBottom: 8 }}>Predicted champion</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <TeamLogo id={champ} size={30} proxied />
                <span style={{ fontSize: 19, fontWeight: 600 }}>{teamName(champ)}</span>
              </div>
            </div>
          )}

          {/* Super Bowl matchup */}
          {sb?.teamA && sb?.teamB && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ ...kicker, marginBottom: 8 }}>Super Bowl</div>
              <div className="card elev-sm" style={{ padding: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <SbTeam id={sb.teamA} tag="AFC" />
                <span style={{ fontSize: 11, opacity: 0.4 }}>VS</span>
                <SbTeam id={sb.teamB} tag="NFC" alignRight />
              </div>
            </div>
          )}

          {/* Division winners */}
          <div style={{ ...kicker, marginBottom: 8 }}>Division winners</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
            {DIVISIONS.map((d) => {
              const t = picks.divisionPicks[d.key];
              return (
                <div key={d.key} className="card elev-sm" style={{ padding: "8px 10px", flexDirection: "row", alignItems: "center", gap: 8 }}>
                  {t ? <TeamLogo id={t} size={18} proxied /> : <span style={{ width: 18 }} />}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 9.5, opacity: 0.5 }}>{d.key}</div>
                    <div style={{ fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {t ? teamName(t) : "—"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Seeds per conference */}
          {(["AFC", "NFC"] as Conference[]).map((conf) => {
            const seeds = getSeeds(conf, picks);
            if (!seeds.length) return null;
            const winners = new Set(divisionsFor(conf).map((d) => picks.divisionPicks[d.key]));
            return (
              <div key={conf} style={{ marginBottom: 12 }}>
                <div style={{ ...kicker, marginBottom: 8 }}>{conf} seeds</div>
                {seeds.map((s) => (
                  <div
                    key={s.team}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 2px", borderBottom: "1px solid var(--color-divider)" }}
                  >
                    <span style={{ width: 20, fontSize: 11, fontWeight: 600, color: "var(--color-accent)" }}>#{s.seed}</span>
                    <TeamLogo id={s.team} size={18} proxied />
                    <span style={{ flex: 1, fontSize: 12.5 }}>{teamName(s.team)}</span>
                    <span style={{ fontSize: 11, opacity: 0.5 }}>
                      {winners.has(s.team) ? "Div" : "WC"} · {projectedWins(picks, s.team)}–{17 - projectedWins(picks, s.team)}
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
          </div>
        </div>

        {/* Actions */}
        <div
          style={{
            position: "sticky",
            bottom: 0,
            display: "flex",
            gap: 8,
            padding: 12,
            background: "var(--color-surface)",
            borderTop: "1px solid var(--color-divider)",
          }}
        >
          <button type="button" className="btn btn-secondary" onClick={copy} style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
            {copied ? <CheckIcon size={14} /> : null}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={copyImage}
            disabled={busy}
            style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}
          >
            {imgMsg ? <CheckIcon size={14} /> : <ImageIcon size={15} />}
            {busy ? "Rendering…" : imgMsg ?? "Copy image"}
          </button>
          <button type="button" className="btn btn-primary" onClick={share} aria-label="Share" style={{ flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <ShareIcon size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function SbTeam({ id, tag, alignRight }: { id: string; tag: string; alignRight?: boolean }) {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, justifyContent: alignRight ? "flex-end" : "flex-start" }}>
      {!alignRight && <TeamLogo id={id} size={24} proxied />}
      <div style={{ textAlign: alignRight ? "right" : "left" }}>
        <div style={{ fontSize: 9.5, opacity: 0.5 }}>{tag}</div>
        <div style={{ fontSize: 13 }}>{teamName(id)}</div>
      </div>
      {alignRight && <TeamLogo id={id} size={24} proxied />}
    </div>
  );
}
