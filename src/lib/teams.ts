// Static NFL team + division reference data. Team names and brand colors are
// carried over verbatim from the design prototype so the UI matches exactly.
// Abbreviations match ESPN's team abbreviations used by the public API.

export type Conference = "AFC" | "NFC";

export interface Team {
  id: string; // abbreviation, e.g. "KC"
  name: string; // short name, e.g. "Chiefs"
  color: string; // brand color for the dot
  conference: Conference;
  division: string; // e.g. "AFC West"
}

export const TEAMS: Record<string, { name: string; color: string }> = {
  BUF: { name: "Bills", color: "#00338D" },
  MIA: { name: "Dolphins", color: "#008E97" },
  NE: { name: "Patriots", color: "#0a2342" },
  NYJ: { name: "Jets", color: "#125740" },
  BAL: { name: "Ravens", color: "#241773" },
  CIN: { name: "Bengals", color: "#FB4F14" },
  CLE: { name: "Browns", color: "#603814" },
  PIT: { name: "Steelers", color: "#FFB612" },
  HOU: { name: "Texans", color: "#03202F" },
  IND: { name: "Colts", color: "#002C5F" },
  JAX: { name: "Jaguars", color: "#006778" },
  TEN: { name: "Titans", color: "#4B92DB" },
  KC: { name: "Chiefs", color: "#E31837" },
  LAC: { name: "Chargers", color: "#0080C6" },
  DEN: { name: "Broncos", color: "#FB4F14" },
  LV: { name: "Raiders", color: "#A5ACAF" },
  PHI: { name: "Eagles", color: "#004C54" },
  DAL: { name: "Cowboys", color: "#869397" },
  NYG: { name: "Giants", color: "#0B2265" },
  WAS: { name: "Commanders", color: "#5A1414" },
  DET: { name: "Lions", color: "#0076B6" },
  GB: { name: "Packers", color: "#203731" },
  MIN: { name: "Vikings", color: "#4F2683" },
  CHI: { name: "Bears", color: "#0B162A" },
  TB: { name: "Buccaneers", color: "#D50A0A" },
  ATL: { name: "Falcons", color: "#A71930" },
  NO: { name: "Saints", color: "#8a7346" },
  CAR: { name: "Panthers", color: "#0085CA" },
  SF: { name: "49ers", color: "#AA0000" },
  SEA: { name: "Seahawks", color: "#69BE28" },
  LAR: { name: "Rams", color: "#003594" },
  ARI: { name: "Cardinals", color: "#97233F" },
};

export interface Division {
  key: string; // "AFC East"
  conf: Conference;
  teams: string[]; // team ids, order is arbitrary
}

export const DIVISIONS: Division[] = [
  { key: "AFC East", conf: "AFC", teams: ["BUF", "MIA", "NE", "NYJ"] },
  { key: "AFC North", conf: "AFC", teams: ["BAL", "CIN", "CLE", "PIT"] },
  { key: "AFC South", conf: "AFC", teams: ["HOU", "IND", "JAX", "TEN"] },
  { key: "AFC West", conf: "AFC", teams: ["KC", "LAC", "DEN", "LV"] },
  { key: "NFC East", conf: "NFC", teams: ["PHI", "DAL", "NYG", "WAS"] },
  { key: "NFC North", conf: "NFC", teams: ["DET", "GB", "MIN", "CHI"] },
  { key: "NFC South", conf: "NFC", teams: ["TB", "ATL", "NO", "CAR"] },
  { key: "NFC West", conf: "NFC", teams: ["SF", "SEA", "LAR", "ARI"] },
];

export const CONFERENCES: Conference[] = ["AFC", "NFC"];

// Lookups
export function teamName(id: string): string {
  return TEAMS[id]?.name ?? id;
}
export function teamColor(id: string): string {
  return TEAMS[id]?.color ?? "#666";
}
export function divisionsFor(conf: Conference): Division[] {
  return DIVISIONS.filter((d) => d.conf === conf);
}
export function conferenceOf(id: string): Conference | null {
  const d = DIVISIONS.find((div) => div.teams.includes(id));
  return d ? d.conf : null;
}

// ESPN sometimes uses slightly different abbreviations; normalize to ours.
const ESPN_ALIASES: Record<string, string> = {
  WSH: "WAS",
  LA: "LAR",
  OAK: "LV",
  SD: "LAC",
  STL: "LAR",
};
export function normalizeAbbr(abbr: string): string {
  const up = abbr?.toUpperCase();
  return ESPN_ALIASES[up] ?? up;
}
