"use client";

import { teamColor, teamName } from "@/lib/teams";
import { CheckIcon } from "@/components/icons";

// Grid option used on the Divisions & Wildcards screen.
export function TeamOption({
  id,
  selected,
  disabled,
  onClick,
}: {
  id: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="pick-btn">
      {selected && (
        <>
          <span className="pick-fill" />
          <span className="pick-ring" />
        </>
      )}
      <span className="dot" style={{ position: "relative", background: teamColor(id) }} />
      <span style={{ position: "relative", flex: 1 }}>{teamName(id)}</span>
      {selected && (
        <span style={{ position: "relative", color: "var(--color-accent)", flex: "none" }}>
          <CheckIcon />
        </span>
      )}
    </button>
  );
}

// One side of a bracket matchup (seed · dot · name).
export function MatchupSide({
  id,
  seed,
  selected,
  disabled,
  onClick,
  radius = "var(--radius-sm)",
}: {
  id: string;
  seed?: number;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  radius?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        position: "relative",
        overflow: "hidden",
        flex: 1,
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: 8,
        borderRadius: radius,
        border: "1px solid var(--color-divider)",
        background: "var(--color-bg)",
        cursor: disabled ? "default" : "pointer",
        textAlign: "left",
        color: "var(--color-text)",
      }}
    >
      {selected && (
        <>
          <span className="pick-fill" style={{ borderRadius: radius }} />
          <span className="pick-ring" style={{ borderRadius: radius }} />
        </>
      )}
      {seed != null && (
        <span style={{ position: "relative", fontSize: 10, opacity: 0.5 }}>#{seed}</span>
      )}
      <span
        className="dot"
        style={{ position: "relative", width: 8, height: 8, background: teamColor(id) }}
      />
      <span style={{ position: "relative", fontSize: 12.5, flex: 1 }}>{teamName(id)}</span>
    </button>
  );
}
