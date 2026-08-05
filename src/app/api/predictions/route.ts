import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getOrCreateEntry, parseEntry, savePicks, saveBracket, setLocked } from "@/lib/picks";
import { canLock } from "@/lib/bracket";
import { syncEntry } from "@/lib/sync";
import { deadlinePassed } from "@/lib/config";
import { Conference } from "@/lib/teams";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const entry = await getOrCreateEntry(user.id);
  // Only the deadline truly freezes predictions — "locked" is a soft state the
  // user can toggle any time before then. So keep pulling weekly picks into the
  // seeding (override manual W/L for completed slates) and auto-swapping
  // out-of-order division winners even while locked; stop only past the deadline.
  const sync = await syncEntry(user.id, deadlinePassed(), entry);
  return NextResponse.json({
    picks: sync.picks,
    locked: entry.locked,
    canLock: canLock(sync.picks),
    deadlinePassed: deadlinePassed(),
    derivedTeams: sync.derivedTeams,
    swaps: sync.swaps,
  });
}

// POST /api/predictions  { op, payload }
//   op: "savePicks" | "saveBracket" | "lock" | "unlock"
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
        // Re-derive from weekly picks and auto-swap before returning, so the UI
        // gets the reconciled truth rather than the raw submission.
        const sync = await syncEntry(user.id, false);
        return NextResponse.json({
          ok: true,
          picks: sync.picks,
          derivedTeams: sync.derivedTeams,
          swaps: sync.swaps,
        });
      }
      case "saveBracket": {
        if (!entry.locked) {
          return NextResponse.json({ error: "Lock your picks first." }, { status: 409 });
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
