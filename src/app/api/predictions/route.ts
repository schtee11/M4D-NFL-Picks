import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getOrCreateEntry,
  parseEntry,
  parsePickMode,
  savePicks,
  savePickMode,
  saveBracket,
  setLocked,
  PickMode,
} from "@/lib/picks";
import { canLock } from "@/lib/bracket";
import { syncEntry } from "@/lib/sync";
import { deadlinePassed, LEAGUE_NAME, SEASON } from "@/lib/config";
import { Conference } from "@/lib/teams";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const entry = await getOrCreateEntry(user.id);
  // syncEntry also freezes on entry.locked, so a matchups field can't drift from
  // later weekly-pick edits once the user has locked in.
  const sync = await syncEntry(user.id, deadlinePassed(), entry);
  return NextResponse.json({
    picks: sync.picks,
    locked: entry.locked,
    canLock: canLock(sync.picks),
    deadlinePassed: deadlinePassed(),
    pickMode: sync.pickMode,
    derivedTeams: sync.derivedTeams,
    fieldLocked: sync.fieldLocked,
    slate: sync.slate,
    // Labels for the share overview.
    displayName: user.displayName,
    league: LEAGUE_NAME,
    season: SEASON,
  });
}

// POST /api/predictions  { op, payload }
//   op: "savePicks" | "saveBracket" | "setMode" | "lock" | "unlock"
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const entry = await getOrCreateEntry(user.id);
  const frozen = deadlinePassed();

  try {
    switch (body.op) {
      case "savePicks": {
        if (entry.locked || frozen) {
          return NextResponse.json({ error: "Picks are locked." }, { status: 409 });
        }
        // The field is hand-editable only on the manual track. On the matchups
        // track it's derived from the slate, so reject manual edits outright.
        if (parsePickMode(entry) === "matchups") {
          return NextResponse.json(
            { error: "Your bracket is set by your matchups." },
            { status: 409 },
          );
        }
        const divisionPicks = (body.divisionPicks || {}) as Record<string, string>;
        const wc = (body.wildcards || { AFC: [], NFC: [] }) as Record<Conference, string[]>;
        // Enforce max 3 wildcards per conference and no overlap with division winners.
        const winners = new Set(Object.values(divisionPicks));
        const clean = (arr: string[]) => (arr || []).filter((t) => !winners.has(t)).slice(0, 3);
        const wildcards = { AFC: clean(wc.AFC), NFC: clean(wc.NFC) };
        // Projected wins per team, clamped to a valid 0–17 integer.
        const rawRecords = (body.records || {}) as Record<string, unknown>;
        const records: Record<string, number> = {};
        for (const [team, val] of Object.entries(rawRecords)) {
          const n = Math.round(Number(val));
          if (Number.isFinite(n)) records[team] = Math.min(17, Math.max(0, n));
        }
        await savePicks(user.id, divisionPicks, wildcards, records);
        const sync = await syncEntry(user.id, false);
        return NextResponse.json({
          ok: true,
          picks: sync.picks,
          pickMode: sync.pickMode,
          derivedTeams: sync.derivedTeams,
          fieldLocked: sync.fieldLocked,
          slate: sync.slate,
        });
      }
      case "setMode": {
        if (entry.locked || frozen) {
          return NextResponse.json({ error: "Picks are locked." }, { status: 409 });
        }
        const mode: PickMode = body.mode === "matchups" ? "matchups" : "manual";
        await savePickMode(user.id, mode);
        const sync = await syncEntry(user.id, false);
        return NextResponse.json({
          ok: true,
          picks: sync.picks,
          pickMode: sync.pickMode,
          canLock: canLock(sync.picks),
          derivedTeams: sync.derivedTeams,
          fieldLocked: sync.fieldLocked,
          slate: sync.slate,
        });
      }
      case "saveBracket": {
        // The bracket is part of the same editable flow as the picks now, so it
        // follows the same freeze rules: editable until you lock or the deadline.
        if (entry.locked || frozen) {
          return NextResponse.json({ error: "Picks are locked." }, { status: 409 });
        }
        const bracketPicks = (body.bracketPicks || {}) as Record<string, string>;
        const updated = await saveBracket(user.id, bracketPicks);
        return NextResponse.json({ ok: true, picks: parseEntry(updated) });
      }
      case "lock": {
        if (frozen) return NextResponse.json({ error: "Deadline passed." }, { status: 409 });
        const updated = await setLocked(user.id, true);
        return NextResponse.json({ ok: true, locked: updated.locked });
      }
      case "unlock": {
        if (frozen) return NextResponse.json({ error: "Deadline passed." }, { status: 409 });
        const updated = await setLocked(user.id, false);
        return NextResponse.json({ ok: true, locked: updated.locked });
      }
      default:
        return NextResponse.json({ error: "Unknown op" }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Error" }, { status: 400 });
  }
}
