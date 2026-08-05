// App-wide configuration, driven by environment variables with sensible
// defaults so the app runs with zero config in development.

export const APP_NAME = "M4D NFL Picks";
export const APP_BADGE = "M4D";

export const LEAGUE_NAME = process.env.LEAGUE_NAME || "The Pigskin Pickers";

export const SEASON = Number(process.env.NFL_SEASON || "2026");

// Optional hard deadline for locking season predictions. After this moment,
// division/wildcard picks can no longer be changed by anyone. ISO 8601.
// Example: "2026-09-10T20:20:00-04:00" (Thu Sep 10, 8:20 PM ET).
export const PICKS_DEADLINE: Date | null = process.env.PICKS_DEADLINE
  ? new Date(process.env.PICKS_DEADLINE)
  : null;

export function deadlinePassed(now: Date = new Date()): boolean {
  return PICKS_DEADLINE ? now.getTime() > PICKS_DEADLINE.getTime() : false;
}

// A short human string for the deadline, e.g. "Thu, Sep 10 · 8:20 PM ET".
export function deadlineLabel(): string {
  if (!PICKS_DEADLINE) return "before Week 1 kickoff";
  return PICKS_DEADLINE.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}
