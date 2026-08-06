// Persistence helpers that translate between the DB's JSON columns and the
// SeasonPicks shape the bracket logic and UI work with.

import { prisma } from "./db";
import { SeasonPicks, emptyPicks, canLock } from "./bracket";
import { Conference } from "./teams";
import { SEASON } from "./config";
import type { SeasonEntry } from "@prisma/client";

// Which input drives the bracket field. "manual": hand-picked division winners,
// wildcards, and seed win totals. "matchups": the whole field is derived from a
// fully-called game slate. The two never blend.
export type PickMode = "manual" | "matchups";

export function parsePickMode(entry: SeasonEntry | null): PickMode {
  return entry?.pickMode === "matchups" ? "matchups" : "manual";
}

export function parseEntry(entry: SeasonEntry | null): SeasonPicks {
  if (!entry) return emptyPicks();
  try {
    const wc = JSON.parse(entry.wildcards) as Record<Conference, string[]>;
    return {
      divisionPicks: JSON.parse(entry.divisionPicks),
      wildcards: { AFC: wc.AFC ?? [], NFC: wc.NFC ?? [] },
      bracketPicks: JSON.parse(entry.bracketPicks),
      records: JSON.parse(entry.records ?? "{}"),
    };
  } catch {
    return emptyPicks();
  }
}

export async function getEntry(userId: string, season = SEASON): Promise<SeasonEntry | null> {
  return prisma.seasonEntry.findUnique({ where: { userId_season: { userId, season } } });
}

export async function getOrCreateEntry(userId: string, season = SEASON): Promise<SeasonEntry> {
  const existing = await getEntry(userId, season);
  if (existing) return existing;
  return prisma.seasonEntry.create({ data: { userId, season } });
}

export async function savePicks(
  userId: string,
  divisionPicks: Record<string, string>,
  wildcards: Record<Conference, string[]>,
  records: Record<string, number>,
  season = SEASON,
): Promise<SeasonEntry> {
  await getOrCreateEntry(userId, season);
  return prisma.seasonEntry.update({
    where: { userId_season: { userId, season } },
    data: {
      divisionPicks: JSON.stringify(divisionPicks),
      wildcards: JSON.stringify(wildcards),
      records: JSON.stringify(records),
    },
  });
}

export async function savePickMode(
  userId: string,
  mode: PickMode,
  season = SEASON,
): Promise<SeasonEntry> {
  await getOrCreateEntry(userId, season);
  return prisma.seasonEntry.update({
    where: { userId_season: { userId, season } },
    data: { pickMode: mode },
  });
}

export async function saveBracket(
  userId: string,
  bracketPicks: Record<string, string>,
  season = SEASON,
): Promise<SeasonEntry> {
  return prisma.seasonEntry.update({
    where: { userId_season: { userId, season } },
    data: { bracketPicks: JSON.stringify(bracketPicks) },
  });
}

export async function setLocked(userId: string, locked: boolean, season = SEASON): Promise<SeasonEntry> {
  const entry = await getOrCreateEntry(userId, season);
  if (locked && !canLock(parseEntry(entry))) {
    throw new Error("Picks are incomplete");
  }
  return prisma.seasonEntry.update({
    where: { userId_season: { userId, season } },
    data: { locked, lockedAt: locked ? new Date() : null },
  });
}
