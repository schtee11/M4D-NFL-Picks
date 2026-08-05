import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getOrCreateEntry, parseEntry, savePicks, saveBracket, setLocked } from "@/lib/picks";
import { canLock } from "@/lib/bracket";
import { deadlinePassed } from "@/lib/config";
import { Conference } from "@/lib/teams";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const entry = await getOrCreateEntry(user.id);
  const picks = parseEntry(entry);
  return NextResponse.json({
    picks,
    locked: entry.locked,
    canLock: canLock(picks),
    deadlinePassed: deadlinePassed(),
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
        const updated = await savePicks(user.id, divisionPicks, wildcards);
        return NextResponse.json({ ok: true, picks: parseEntry(updated) });
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
