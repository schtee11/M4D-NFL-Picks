import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  hashPin,
  verifyPin,
  setSessionCookie,
  clearSessionCookie,
  handleFor,
} from "@/lib/auth";

// POST /api/auth  { displayName, pin }
// If the name already exists, this logs in (PIN must match). Otherwise it
// creates the member. Right-sized for a small private league.
export async function POST(req: Request) {
  let body: { displayName?: string; pin?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const displayName = (body.displayName || "").trim();
  const pin = (body.pin || "").trim();

  if (displayName.length < 2 || displayName.length > 24) {
    return NextResponse.json({ error: "Name must be 2–24 characters." }, { status: 400 });
  }
  if (!/^\d{4,6}$/.test(pin)) {
    return NextResponse.json({ error: "PIN must be 4–6 digits." }, { status: 400 });
  }

  const handle = handleFor(displayName);
  const existing = await prisma.user.findUnique({ where: { handle } });

  if (existing) {
    if (!verifyPin(pin, existing.pinHash)) {
      return NextResponse.json(
        { error: "That name is taken and the PIN doesn't match." },
        { status: 401 },
      );
    }
    setSessionCookie(existing.id);
    return NextResponse.json({ ok: true, user: publicUser(existing) });
  }

  const user = await prisma.user.create({
    data: { displayName, handle, pinHash: hashPin(pin) },
  });
  setSessionCookie(user.id);
  return NextResponse.json({ ok: true, user: publicUser(user) });
}

// DELETE /api/auth → logout
export async function DELETE() {
  clearSessionCookie();
  return NextResponse.json({ ok: true });
}

function publicUser(u: { id: string; displayName: string }) {
  return { id: u.id, displayName: u.displayName };
}
