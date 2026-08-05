"use client";

import { useState } from "react";
import { teamColor, teamLogo } from "@/lib/teams";

// Renders a team's logo from ESPN's CDN, falling back to a brand-color dot if
// the image can't load (offline, blocked, or unknown team).
export function TeamLogo({
  id,
  size = 22,
  style,
  proxied = false,
}: {
  id: string;
  size?: number;
  style?: React.CSSProperties;
  // Load via our same-origin /api/logo proxy — used by the share card so the
  // logo can be rasterized into a PNG without a cross-origin canvas taint.
  proxied?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  if (!id || failed) {
    const d = Math.round(size * 0.5);
    return (
      <span
        style={{
          position: "relative",
          width: d,
          height: d,
          borderRadius: "50%",
          background: teamColor(id),
          flex: "none",
          ...style,
        }}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={proxied ? `/api/logo?id=${encodeURIComponent(id)}` : teamLogo(id)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      style={{
        position: "relative",
        display: "block",
        width: size,
        height: size,
        objectFit: "contain",
        flex: "none",
        ...style,
      }}
    />
  );
}
